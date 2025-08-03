import type { WorkflowStatus } from '../../api/Repositories';
import { getNormalizedStatus, getDailyStatus } from './StatusUtils';

export type IndicationSeverity = 'success' | 'info' | 'warning' | 'error';

export type IndicationType = 'Job With No Runs' | 'Consecutive Failed Runs' | 'Consecutive Successful Runs' | 'Job Not Run Recently' | 'Daily Streaks Failure' | 'Daily Streaks Success' | 'Job Failed In Last Run' | 'All Jobs Failed' | 'All Jobs Succeeded';
export type IndicationEventType = 'new' | 'improvement'  | 'fixed' | 'worst';

export interface Indication {
  type: IndicationType;
  severity: IndicationSeverity;
  severityScore: number;
  relevantJobCount: number; // Number of jobs this indication is relevant to
  message: string;
  url?: string;
  timestamp?: string;
}

export interface IndicationEvent {
  event: IndicationEventType;
  indication: Indication;
  message: string;
}

type IndicationMsgFn =
  | (() => string)
  | ((relevantJobCount: number) => string)
  | ((relevantJobCount: number, streak: number) => string)
  | ((relevantJobCount: number, days: number) => string);

const indicationsData: Map<IndicationType, { severity: IndicationSeverity; eventToMsg: Map<IndicationEventType, IndicationMsgFn> }> = new Map([
  ['Job With No Runs', {
    severity: 'info',
    eventToMsg: new Map([
      ['new', (relevantJobCount: number) => relevantJobCount === 1
        ? '1 job has no runs yet'
        : `${relevantJobCount} jobs have no runs yet`],
      ['improvement', (relevantJobCount: number) => relevantJobCount === 1
        ? '1 job has started running for the first time'
        : `${relevantJobCount} jobs have started running for the first time`],
      ['fixed', () => `All jobs have runs now`],
      ['worst', (relevantJobCount: number) => relevantJobCount === 1
        ? '1 additional job has no runs'
        : `${relevantJobCount} additional jobs have no runs`],
    ])
  }],
  ['Daily Streaks Failure', {
    severity: 'error',
    eventToMsg: new Map([
      ['new', (relevantJobCount: number, maxDailyFailureStreak: number) => relevantJobCount === 1
        ? `A workflow has failed for ${maxDailyFailureStreak} or more consecutive days`
        : `${relevantJobCount} workflows have failed for ${maxDailyFailureStreak} or more consecutive days`],
      ['improvement', (relevantJobCount: number, maxDailyFailureStreak: number) => relevantJobCount === 1
        ? `A workflow has reduced its failure streak to ${maxDailyFailureStreak} or more consecutive days`
        : `${relevantJobCount} workflows have reduced their failure streak to ${maxDailyFailureStreak} or more consecutive days`],
      ['fixed', () => `All workflows have no failure streaks`],
      ['worst', (relevantJobCount: number, maxDailyFailureStreak: number) => relevantJobCount === 1
        ? `A workflow has failed for ${maxDailyFailureStreak} or more consecutive days`
        : `${relevantJobCount} workflows have failed for ${maxDailyFailureStreak} or more consecutive days`],
    ])
  }],
  ['Daily Streaks Success', {
    severity: 'success',
    eventToMsg: new Map([
      ['new', (relevantJobCount: number, maxDailySuccessStreak: number) => relevantJobCount === 1
        ? `A workflow has succeeded for ${maxDailySuccessStreak} or more consecutive days`
        : `${relevantJobCount} workflows have succeeded for ${maxDailySuccessStreak} or more consecutive days`],
      ['improvement', (relevantJobCount: number, maxDailySuccessStreak: number) => relevantJobCount === 1
        ? `A workflow has increased its success streak to ${maxDailySuccessStreak} or more consecutive days`
        : `${relevantJobCount} workflows have increased their success streak to ${maxDailySuccessStreak} or more consecutive days`],
      ['fixed', () => `All workflows have no success streaks`],
      ['worst', (relevantJobCount: number, maxDailySuccessStreak: number) => relevantJobCount === 1
        ? `A workflow has failed for ${maxDailySuccessStreak} or more consecutive days`
        : `${relevantJobCount} workflows have failed for ${maxDailySuccessStreak} or more consecutive days`],
    ])
  }],
  ['Consecutive Failed Runs', {
    severity: 'error',
    eventToMsg: new Map([
      ['new', (relevantJobCount: number, maxFailureStreak: number) => relevantJobCount === 1
        ? `A workflow has failed ${maxFailureStreak} or more times in a row`
        : `${relevantJobCount} workflows have failed ${maxFailureStreak} or more times in a row`],
      ['improvement', (relevantJobCount: number, maxFailureStreak: number) => relevantJobCount === 1
        ? `A workflow has reduced its failure streak to ${maxFailureStreak} or more times in a row`
        : `${relevantJobCount} workflows have reduced their failure streak to ${maxFailureStreak} or more times in a row`],
      ['fixed', () => `All workflows have no failure streaks`],
      ['worst', (relevantJobCount: number, maxFailureStreak: number) => relevantJobCount === 1
        ? `A workflow has failed ${maxFailureStreak} or more times in a row`
        : `${relevantJobCount} workflows have failed ${maxFailureStreak} or more times in a row`],
    ])
  }],
  ['Consecutive Successful Runs', {
    severity: 'success',
    eventToMsg: new Map([
      ['new', (relevantJobCount: number, maxSuccessStreak: number) => relevantJobCount === 1
        ? `A workflow has succeeded ${maxSuccessStreak} or more times in a row`
        : `${relevantJobCount} workflows have succeeded ${maxSuccessStreak} or more times in a row`],
      ['improvement', (relevantJobCount: number, maxSuccessStreak: number) => relevantJobCount === 1
        ? `A workflow has increased its success streak to ${maxSuccessStreak} or more times in a row`
        : `${relevantJobCount} workflows have increased their success streak to ${maxSuccessStreak} or more times in a row`],
      ['fixed', () => `All workflows have no success streaks`],
      ['worst', (relevantJobCount: number, maxSuccessStreak: number) => relevantJobCount === 1
        ? `A workflow has succeeded ${maxSuccessStreak} or more times in a row`
        : `${relevantJobCount} workflows have succeeded ${maxSuccessStreak} or more times in a row`],
    ])
  }],
  ['Job Not Run Recently', {
    severity: 'warning',
    eventToMsg: new Map([
      ['new', (relevantJobCount: number, maxNotRunDays: number) => relevantJobCount === 1
        ? `A workflow has not run in the last ${maxNotRunDays} days`
        : `${relevantJobCount} workflows have not run in the last ${maxNotRunDays} days`],
      ['improvement', (relevantJobCount: number, maxNotRunDays: number) => relevantJobCount === 1
        ? `A workflow has started running again after ${maxNotRunDays} days`
        : `${relevantJobCount} workflows have started running again after ${maxNotRunDays} days`],
      ['fixed', () => `All workflows have run recently`],
      ['worst', (relevantJobCount: number, maxNotRunDays: number) => relevantJobCount === 1
        ? `A workflow has not run in the last ${maxNotRunDays} days`
        : `${relevantJobCount} workflows have not run in the last ${maxNotRunDays} days`],
    ])
  }],
  ['Job Failed In Last Run', {
    severity: 'warning',
    eventToMsg: new Map([
      ['new', (relevantJobCount: number) => relevantJobCount === 1
        ? `A workflow failed in the most recent run`
        : `${relevantJobCount} workflows failed in the most recent run`],
      ['improvement', (relevantJobCount: number) => relevantJobCount === 1
        ? `A workflow has not failed in the most recent run`
        : `${relevantJobCount} workflows have not failed in the most recent run`],
      ['fixed', () => `All workflows have succeeded in the most recent run`],
      ['worst', (relevantJobCount: number) => relevantJobCount === 1
        ? `A workflow has failed in the most recent run`
        : `${relevantJobCount} workflows have failed in the most recent run`],
    ])
  }],
  ['All Jobs Failed', {
    severity: 'error',
    eventToMsg: new Map([
      ['new', (relevantJobCount: number) => relevantJobCount === 1
        ? `A workflow has failed all runs`
        : `${relevantJobCount} workflows have failed all runs`],
      ['improvement', (relevantJobCount: number) => relevantJobCount === 1
        ? `A workflow has started succeeding after failing all runs`
        : `${relevantJobCount} workflows have started succeeding after failing all runs`],
      ['fixed', () => `All workflows have succeeded at least once`],
      ['worst', (relevantJobCount: number) => relevantJobCount === 1
        ? `A workflow has failed all runs`
        : `${relevantJobCount} workflows have failed all runs`],
    ])
  }],
  ['All Jobs Succeeded', {
    severity: 'success',
    eventToMsg: new Map([
      ['new', (relevantJobCount: number) => relevantJobCount === 1
        ? `A workflow has succeeded all runs`
        : `${relevantJobCount} workflows have succeeded all runs`],
      ['improvement', (relevantJobCount: number) => relevantJobCount === 1
        ? `A workflow has continued its success streak`
        : `${relevantJobCount} workflows have continued their success streak`],
      ['fixed', () => `All workflows have succeeded at least once`],
      ['worst', (relevantJobCount: number) => relevantJobCount === 1
        ? `A workflow has succeeded all runs`
        : `${relevantJobCount} workflows have succeeded all runs`],
    ])
  }],
]);

export function isSameIndication(a: Indication, b: Indication): boolean {
  return a.severity === b.severity && a.message === b.message;
}

function jobHasNoRuns(job: { jobRuns: WorkflowStatus[] }): boolean {
  return !job.jobRuns || job.jobRuns.length === 0 || job.jobRuns.every(run => run.status === 'no_runs');
}

export function getIndications(jobs: Array<{ branch: string; workflowKey: string; jobRuns: WorkflowStatus[] }>): Indication[] {
  const indications: Indication[] = [];

  // --- Job With No Runs ---
  const noRunJobs = jobs.filter(jobHasNoRuns);
  if (noRunJobs.length > 0) {
    const { severity, eventToMsg } = indicationsData.get('Job With No Runs')!;
    indications.push({
      type: 'Job With No Runs',
      severity,
      severityScore: noRunJobs.length,
      relevantJobCount: noRunJobs.length,
      message: (eventToMsg.get('new') as (relevantJobCount: number) => string)(noRunJobs.length),
    });
  }
  const jobsWithRuns = jobs.filter(j => !jobHasNoRuns(j));

  // --- Job Not Run Recently ---
  const daysWithoutRunsIntervalForIndications: number = 10;
  const minDaysWithoutRunsInterval: number = 10;
  const jobsWithNotRunDays: Record<number, number[]> = {};
  let maxNotRunDays = 0;
  jobsWithRuns.forEach((j, idx) => {
    const daily = getDailyStatus(j.jobRuns);
    // Find the first day with a run (latest run)
    let daysSinceLastRun = 0;
    for (let i = 0; i < daily.length; i++) {
      const run = daily[i].run;
      const status = run ? getNormalizedStatus(run.status, run.conclusion) : 'no_runs';
      if (status !== 'no_runs') {
        // The index i is the number of days since last run (0 = today, 1 = yesterday, ...)
        daysSinceLastRun = i;
        break;
      }
    }
    if (daysSinceLastRun >= minDaysWithoutRunsInterval) {
      if (!jobsWithNotRunDays[daysSinceLastRun]) jobsWithNotRunDays[daysSinceLastRun] = [];
      jobsWithNotRunDays[daysSinceLastRun].push(idx);
      if (daysSinceLastRun > maxNotRunDays) maxNotRunDays = daysSinceLastRun;
    }
  });
  // Group jobs by intervals
  const notRecentlyIntervalGroups: Record<number, number[]> = {};
  Object.keys(jobsWithNotRunDays).forEach(s => {
    const days = parseInt(s);
    if (days >= minDaysWithoutRunsInterval) {
      const interval = Math.max(minDaysWithoutRunsInterval, Math.floor(days / daysWithoutRunsIntervalForIndications) * daysWithoutRunsIntervalForIndications);
      if (!notRecentlyIntervalGroups[interval]) notRecentlyIntervalGroups[interval] = [];
      notRecentlyIntervalGroups[interval].push(...jobsWithNotRunDays[days]);
    }
  });
  Object.entries(notRecentlyIntervalGroups).forEach(([intervalStr, idxs]) => {
    const interval = parseInt(intervalStr);
    const { severity, eventToMsg } = indicationsData.get('Job Not Run Recently')!;
    indications.push({
      type: 'Job Not Run Recently',
      severity,
      severityScore: 3 * interval * idxs.length, // moderate penalty
      relevantJobCount: idxs.length,
      message: eventToMsg.get('new')!(idxs.length, interval),
    });
  });

  // --- Consecutive Failed Runs (streaks from latest only) ---
  const failureStreakIntervalForIndications: number = 10;
  const minFailureStreakInterval: number = 5;
  const jobsWithFailureStreak: Record<number, number[]> = {}; // streak -> [job idx]
  jobsWithRuns.forEach((j, idx) => {
    let streak = 0;
    for (const run of j.jobRuns) {
      const status = getNormalizedStatus(run.status, run.conclusion);
      if (status !== 'success') streak++;
      else break;
    }
    if (streak >= minFailureStreakInterval) {
      if (!jobsWithFailureStreak[streak]) jobsWithFailureStreak[streak] = [];
      jobsWithFailureStreak[streak].push(idx);
    }
  });
  // Group jobs by intervals
  const failureStreakIntervalGroups: Record<number, number[]> = {};
  Object.keys(jobsWithFailureStreak).forEach(s => {
    const streak = parseInt(s);
    if (streak >= minFailureStreakInterval) {
      const interval = Math.max(minFailureStreakInterval, Math.floor(streak / failureStreakIntervalForIndications) * failureStreakIntervalForIndications);
      if (!failureStreakIntervalGroups[interval]) failureStreakIntervalGroups[interval] = [];
      failureStreakIntervalGroups[interval].push(...jobsWithFailureStreak[streak]);
    }
  });
  Object.entries(failureStreakIntervalGroups).forEach(([intervalStr, idxs]) => {
    const interval = parseInt(intervalStr);
    const { severity, eventToMsg } = indicationsData.get('Consecutive Failed Runs')!;
    indications.push({
      type: 'Consecutive Failed Runs',
      severity,
      severityScore: 5 * interval * idxs.length, // high penalty
      relevantJobCount: idxs.length,
      message: eventToMsg.get('new')!(idxs.length, interval),
    });
  });

  // --- Consecutive Successful Runs (streaks from latest only) ---
  const successStreakIntervalForIndications: number = 10;
  const minSuccessStreakInterval: number = 20;
  const jobsWithSuccessStreak: Record<number, number[]> = {};
  let maxSuccessStreak = 0;
  jobsWithRuns.forEach((j, idx) => {
    let streak = 0;
    for (const run of j.jobRuns) {
      const status = getNormalizedStatus(run.status, run.conclusion);
      if (status === 'success' || status === 'canceled' || status === 'running') streak++;
      else break;
    }
    if (streak >= minSuccessStreakInterval) {
      if (!jobsWithSuccessStreak[streak]) jobsWithSuccessStreak[streak] = [];
      jobsWithSuccessStreak[streak].push(idx);
      if (streak > maxSuccessStreak) maxSuccessStreak = streak;
    }
  });
  // Group jobs by intervals
  const successStreakIntervalGroups: Record<number, number[]> = {};
  Object.keys(jobsWithSuccessStreak).forEach(s => {
    const streak = parseInt(s);
    if (streak >= minSuccessStreakInterval) {
      const interval = Math.max(minSuccessStreakInterval, Math.floor(streak / successStreakIntervalForIndications) * successStreakIntervalForIndications);
      if (!successStreakIntervalGroups[interval]) successStreakIntervalGroups[interval] = [];
      successStreakIntervalGroups[interval].push(...jobsWithSuccessStreak[streak]);
    }
  });
  // Only generate indication for the largest interval group (if any)
  const successStreakIntervalKeys = Object.keys(successStreakIntervalGroups).map(Number).filter(k => k >= 5);
  if (successStreakIntervalKeys.length > 0) {
    const maxInterval = Math.max(...successStreakIntervalKeys);
    const idxs = successStreakIntervalGroups[maxInterval];
    const { severity, eventToMsg } = indicationsData.get('Consecutive Successful Runs')!;
    indications.push({
      type: 'Consecutive Successful Runs',
      severity,
      severityScore: 0, // no penalty for success
      relevantJobCount: idxs.length,
      message: eventToMsg.get('new')!(idxs.length, maxInterval),
    });
  }

  // --- Daily Streaks Failure (from latest only) ---
  const dailyFailureIntervalForIndications: number = 10;
  const minDailyFailureStreakInterval: number = 5;
  const jobsWithDailyFailureStreak: Record<number, number[]> = {};
  let maxDailyFailureStreak = 0;
  jobsWithRuns.forEach((j, idx) => {
    const daily = getDailyStatus(j.jobRuns);
    let streak = 0;
    for (const d of daily) {
      const status = d.run ? getNormalizedStatus(d.run.status, d.run.conclusion) : 'no_runs';
      if (status !== 'success' && status !== 'no_runs') streak++;
      else break;
    }
    if (streak >= minDailyFailureStreakInterval) {
      if (!jobsWithDailyFailureStreak[streak]) jobsWithDailyFailureStreak[streak] = [];
      jobsWithDailyFailureStreak[streak].push(idx);
      if (streak > maxDailyFailureStreak) maxDailyFailureStreak = streak;
    }
  });
  // Group jobs by intervals
  const dailyFailureStreakIntervalGroups: Record<number, number[]> = {};
  Object.keys(jobsWithDailyFailureStreak).forEach(s => {
    const streak = parseInt(s);
    if (streak >= minDailyFailureStreakInterval) {
      const interval = Math.max(minDailyFailureStreakInterval, Math.floor(streak / dailyFailureIntervalForIndications) * dailyFailureIntervalForIndications);
      if (!dailyFailureStreakIntervalGroups[interval]) dailyFailureStreakIntervalGroups[interval] = [];
      dailyFailureStreakIntervalGroups[interval].push(...jobsWithDailyFailureStreak[streak]);
    }
  });
  Object.entries(dailyFailureStreakIntervalGroups).forEach(([intervalStr, idxs]) => {
    const interval = parseInt(intervalStr);
    const { severity, eventToMsg } = indicationsData.get('Daily Streaks Failure')!;
    indications.push({
      type: 'Daily Streaks Failure',
      severity,
      severityScore: 4 * interval * idxs.length, // high penalty
      relevantJobCount: idxs.length,
      message: eventToMsg.get('new')!(idxs.length, interval),
    });
  });

  // --- Daily Streaks Success (from latest only) ---
  const dailySuccessIntervalForIndications: number = 10;
  const minDailySuccessInterval: number = 20;
  let maxDailySuccessStreak = 0;
  const jobsWithDailySuccessStreak: Record<number, number[]> = {};
  jobsWithRuns.forEach((j, idx) => {
    const daily = getDailyStatus(j.jobRuns);
    let streak = 0;
    for (const d of daily) {
      const status = d.run ? getNormalizedStatus(d.run.status, d.run.conclusion) : 'no_runs';
      if (status === 'success' || status === 'running') streak++;
      else break;
    }
    if (streak >= minDailySuccessInterval) {
      if (!jobsWithDailySuccessStreak[streak]) jobsWithDailySuccessStreak[streak] = [];
      jobsWithDailySuccessStreak[streak].push(idx);
      if (streak > maxDailySuccessStreak) maxDailySuccessStreak = streak;
    }
  });
  // Group jobs by intervals
  const dailySuccessStreakIntervalGroups: Record<number, number[]> = {};
  Object.keys(jobsWithDailySuccessStreak).forEach(s => {
    const streak = parseInt(s);
    if (streak >= minDailySuccessInterval) {
      const interval = Math.max(minDailySuccessInterval, Math.floor(streak / dailySuccessIntervalForIndications) * dailySuccessIntervalForIndications);
      if (!dailySuccessStreakIntervalGroups[interval]) dailySuccessStreakIntervalGroups[interval] = [];
      dailySuccessStreakIntervalGroups[interval].push(...jobsWithDailySuccessStreak[streak]);
    }
  });
  // Only generate indication for the largest interval group (if any)
  const dailySuccessIntervalKeys = Object.keys(dailySuccessStreakIntervalGroups).map(Number).filter(k => k >= 5);
  if (dailySuccessIntervalKeys.length > 0) {
    const maxInterval = Math.max(...dailySuccessIntervalKeys);
    const idxs = dailySuccessStreakIntervalGroups[maxInterval];
    const { severity, eventToMsg } = indicationsData.get('Daily Streaks Success')!;
    indications.push({
      type: 'Daily Streaks Success',
      severity,
      severityScore: 0, // no penalty for success
      relevantJobCount: idxs.length,
      message: eventToMsg.get('new')!(idxs.length, maxInterval),
    });
  }

  // --- Job Failed In Last Run ---
  const failedLastRunJobs = jobsWithRuns.filter(j => j.jobRuns.length > 0 && ['failure', 'error'].includes(getNormalizedStatus(j.jobRuns[0].status, j.jobRuns[0].conclusion)));
  if (failedLastRunJobs.length > 0) {
    const { severity, eventToMsg } = indicationsData.get('Job Failed In Last Run')!;
    indications.push({
      type: 'Job Failed In Last Run',
      severity,
      severityScore: 2 * failedLastRunJobs.length, // moderate penalty
      relevantJobCount: failedLastRunJobs.length,
      message: eventToMsg.get('new')!(failedLastRunJobs.length, 0),
    });
  }

  // --- All Jobs Failed ---
  const allFailedJobs = jobsWithRuns.filter(j => j.jobRuns.every(run => getNormalizedStatus(run.status, run.conclusion) !== 'success'));
  if (allFailedJobs.length > 0) {
    const { severity, eventToMsg } = indicationsData.get('All Jobs Failed')!;
    indications.push({
      type: 'All Jobs Failed',
      severity,
      severityScore: 10 * allFailedJobs.length, // very high penalty
      relevantJobCount: allFailedJobs.length,
      message: eventToMsg.get('new')!(allFailedJobs.length, 0),
    });
  }

  // --- All Jobs Succeeded ---
  const allSucceededJobs = jobsWithRuns.filter(j => j.jobRuns.every(run => getNormalizedStatus(run.status, run.conclusion) === 'success'));
  if (allSucceededJobs.length > 0) {
    const { severity, eventToMsg } = indicationsData.get('All Jobs Succeeded')!;
    indications.push({
      type: 'All Jobs Succeeded',
      severity,
      severityScore: 0,
      relevantJobCount: allSucceededJobs.length,
      message: eventToMsg.get('new')!(allSucceededJobs.length, 0),
    });
  }


  return indications;
}

export function calculateRunTime(start: number, end: number): number | null {
  if (isNaN(start) || isNaN(end) || start >= end) return null;
  const runTime = end - start; // Run time in milliseconds
  // Skip not valid run times: if run time is 0 negative, Infinity or more than 7 days (This is only estimated, as GitHub does not provide actual run times)
  return (isNaN(runTime) || runTime <= 0 || runTime === Infinity || runTime > 7 * 24 * 60 * 60 * 1000) ? null : runTime;
}

export function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateString).toLocaleDateString();
  };

export function formatRunTime(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return '';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  let str = '';
  if (hours > 0) str += `${hours}h `;
  if (minutes > 0 || hours > 0) str += `${minutes}m `;
  str += `${seconds}s`;
  return str.trim();
}

// Helper to shorten commit SHA
export function shortCommit(commit: string | null | undefined) {
  return commit && commit.length > 7 ? commit.slice(0, 7) : commit || '';
}

/**
 * Returns aggregated info for a workflow run array: total runs, average run time (ms), success rate, etc.
 */
export function getWorkflowAggregatedInfo(workflow: WorkflowStatus[]): {
  totalRuns: number;
  avgRunTime: number | null;
  successRate: number | null;
} {
  let totalRuns = 0;
  let totalRunTime = 0;
  let runTimeCount = 0;
  let successCount = 0;
  workflow.forEach(run => {
    const status = getNormalizedStatus(run.status, run.conclusion);
    if (
      (status === 'success' || status === 'failure') &&
      run.runStartedAt && run.updatedAt
    ) {
      const runTime = calculateRunTime(new Date(run.runStartedAt).getTime(), new Date(run.updatedAt).getTime());
      if (runTime === null) return; // Skip invalid run times
      // If run time is valid, add to totals
      totalRunTime += runTime;
      runTimeCount++;
      // Count this as a run
      totalRuns++;
    }
    if (run.conclusion === 'success') successCount++;
  });
  const avgRunTime = runTimeCount > 0 ? totalRunTime / runTimeCount : null;
  const successRate = totalRuns > 0 ? successCount / totalRuns : null;
  return { totalRuns: workflow.length, avgRunTime, successRate };
}

export function getNewIndications(
  previousIndications: Indication[],
  currentIndications: Indication[]
): Indication[] {
  return currentIndications.filter(
    curr => !previousIndications.some(prev => isSameIndication(curr, prev))
  );
}