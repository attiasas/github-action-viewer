import type { WorkflowStatus } from '../../api/Repositories';
import { getNormalizedStatus, getDailyStatus } from './StatusUtils';

export type IndicationType = 'info' | 'warning' | 'success' | 'error';
export interface Indication {
  type: IndicationType;
  message: string;
  url?: string;
  timestamp?: string;
  relevantWorkflowCount?: number;
  severityScore?: number;
}

export function getIndications(runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>): Indication[] {
  const indications: Indication[] = [];
  let totalFailures = 0;
  let totalSuccess = 0;
  let workflowsWithNoRuns = 0;
  let workflowsWithOnlyFailures = 0;
  // Track workflows not run in the last N days for multiple thresholds
  const notRunThresholds = [30, 60, 90, 120, 150, 365];
  // For each threshold, count workflows that have not run in that many days (but only the largest threshold per workflow)
  const workflowsNotRunRecently: Record<number, number> = {};
  notRunThresholds.forEach(days => { workflowsNotRunRecently[days] = 0; });
  const consecutiveFailures: Record<string, number> = {};
  const consecutiveSuccess: Record<string, number> = {};
  let anyRecentFailure = false;
  // For streaks: { streakLength: count }
  const failureStreaks: Record<number, number> = {};
  const successStreaks: Record<number, number> = {};
  const now = Date.now();

  // Aggregate daily streaks for all workflows
  const indicatorThresholdsCounts: number[] = [5, 10, 15, 20, 25, 30, 60, 90, 180];
  const dailySuccessStreaks: Record<number, number> = {};
  const dailyFailureStreaks: Record<number, number> = {};

  runs.forEach(({ branch, workflowKey, workflow }) => {
    // If workflow has a single run with status 'no_runs', treat as no runs
    if (
      workflow.length === 1 &&
      getNormalizedStatus(workflow[0].status, workflow[0].conclusion) === 'no_runs'
    ) {
      workflowsWithNoRuns++;
      return;
    }
    // For each workflow, only count the largest threshold it exceeds
    if (workflow.length > 0 && workflow[0].updatedAt) {
      const lastRun = new Date(workflow[0].updatedAt).getTime();
      if (!isNaN(lastRun)) {
        // Find the largest threshold exceeded
        const exceeded = notRunThresholds.filter(days => (now - lastRun > days * 24 * 60 * 60 * 1000));
        if (exceeded.length > 0) {
          const maxDays = Math.max(...exceeded);
          workflowsNotRunRecently[maxDays] = (workflowsNotRunRecently[maxDays] || 0) + 1;
        }
      }
    }

    // --- Aggregate daily streaks (success/failure in days) only if streak starts from today (idx 0) ---
    const dailyStatus = getDailyStatus(workflow);
    if (dailyStatus.length > 0) {
      const firstStatus = dailyStatus[0].run ? getNormalizedStatus(dailyStatus[0].run.status, dailyStatus[0].run.conclusion) : 'no_runs';
      if (firstStatus === 'success' || firstStatus === 'failure') {
        const streakType = firstStatus as 'success' | 'failure';
        let streakLength = 1;
        for (let i = 1; i < dailyStatus.length; i++) {
          const ds = dailyStatus[i];
          const status = ds.run ? getNormalizedStatus(ds.run.status, ds.run.conclusion) : 'no_runs';
          if (status === streakType) {
            streakLength++;
          } else if (status === 'success' || status === 'failure') {
            break; // Streak only counts from today, stop at first transition
          }
        }
        if (streakType === 'success') {
          indicatorThresholdsCounts.forEach((n) => {
            if (streakLength >= n) dailySuccessStreaks[n] = (dailySuccessStreaks[n] || 0) + 1;
          });
        } else if (streakType === 'failure') {
          indicatorThresholdsCounts.forEach((n) => {
            if (streakLength >= n) dailyFailureStreaks[n] = (dailyFailureStreaks[n] || 0) + 1;
          });
        }
      }
    }

    // --- Existing: Analyze run statuses for this workflow ---
    let failStreak = 0;
    let successStreak = 0;
    let onlyFailures = true;
    let hasFailure = false;
    let hasSuccess = false;
    for (let i = workflow.length - 1; i >= 0; i--) {
      const run = workflow[i];
      const status = getNormalizedStatus(run.status, run.conclusion);
      if (status === 'failure') {
        failStreak++;
        totalFailures++;
        if (i === 0) anyRecentFailure = true;
        successStreak = 0;
        hasFailure = true;
      } else if (status === 'success') {
        successStreak++;
        totalSuccess++;
        failStreak = 0;
        onlyFailures = false;
        hasSuccess = true;
      } else if (status === 'pending' || status === 'running') {
        failStreak = 0;
        successStreak = 0;
        onlyFailures = false;
      } else {
        failStreak = 0;
        successStreak = 0;
        onlyFailures = false;
      }
    }
    if (onlyFailures && workflow.length > 0) workflowsWithOnlyFailures++;
    if (
      hasFailure && hasSuccess && workflow.length > 1
    )
    consecutiveFailures[`${branch}:${workflowKey}`] = failStreak;
    consecutiveSuccess[`${branch}:${workflowKey}`] = successStreak;
    indicatorThresholdsCounts.forEach((n) => {
      if (failStreak >= n) failureStreaks[n] = (failureStreaks[n] || 0) + 1;
      if (successStreak >= n) successStreaks[n] = (successStreaks[n] || 0) + 1;
    });
  });

  if (workflowsWithNoRuns > 0) {
    indications.push({
      type: 'info',
      message: workflowsWithNoRuns === 1
        ? '1 workflow has no runs yet'
        : `${workflowsWithNoRuns} workflows have no runs yet`,
      relevantWorkflowCount: workflowsWithNoRuns,
      url: "https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow",
      severityScore: workflowsWithNoRuns * 1
    });
  }
  if (workflowsWithOnlyFailures > 0) {
    indications.push({
      type: 'warning',
      message: workflowsWithOnlyFailures === 1
        ? '1 workflow has only failures'
        : `${workflowsWithOnlyFailures} workflows have only failures`,
      relevantWorkflowCount: workflowsWithOnlyFailures,
      severityScore: workflowsWithOnlyFailures * 3
    });
  }
  // Only display the largest threshold indication for not run recently
  const maxNotRunDays = notRunThresholds.filter(days => workflowsNotRunRecently[days] > 0).sort((a, b) => b - a)[0];
  if (maxNotRunDays) {
    const count = workflowsNotRunRecently[maxNotRunDays];
    indications.push({
      type: 'warning',
      message: count === 1
        ? `1 workflow has not run in the last ${maxNotRunDays} days`
        : `${count} workflows have not run in the last ${maxNotRunDays} days`,
      relevantWorkflowCount: count,
      url: "https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows",
      severityScore: count * (maxNotRunDays / 8)
    });
  }
  // Only show the most significant (longest) failure and success streaks (run-based)
  const maxFailureStreak = Object.keys(failureStreaks)
    .map(Number)
    .filter((n) => failureStreaks[n] > 0)
    .sort((a, b) => b - a)[0];
  if (maxFailureStreak) {
    const count = failureStreaks[maxFailureStreak];
    indications.push({
      type: 'error',
      message: count === 1
        ? `A workflow has failed ${maxFailureStreak} or more times in a row`
        : `${count} workflows have failed ${maxFailureStreak} or more times in a row`,
      relevantWorkflowCount: count,
      severityScore: count * maxFailureStreak * 5
    });
  }
  const maxSuccessStreak = Object.keys(successStreaks)
    .map(Number)
    .filter((n) => successStreaks[n] > 0)
    .sort((a, b) => b - a)[0];
  if (maxSuccessStreak) {
    const count = successStreaks[maxSuccessStreak];
    indications.push({
      type: 'success',
      message: count === 1
        ? `A workflow has succeeded ${maxSuccessStreak} or more times in a row`
        : `${count} workflows have succeeded ${maxSuccessStreak} or more times in a row`,
      relevantWorkflowCount: count,
    });
  }
  // Show most significant daily streaks (day-based)
  const maxDailyFailureStreak = Object.keys(dailyFailureStreaks)
    .map(Number)
    .filter((n) => dailyFailureStreaks[n] > 0)
    .sort((a, b) => b - a)[0];
  if (maxDailyFailureStreak) {
    const count = dailyFailureStreaks[maxDailyFailureStreak];
    indications.push({
      type: 'error',
      message: count === 1
        ? `A workflow has failed for ${maxDailyFailureStreak} or more consecutive days`
        : `${count} workflows have failed for ${maxDailyFailureStreak} or more consecutive days`,
      relevantWorkflowCount: count,
      severityScore: count * maxDailyFailureStreak
    });
  }
  const maxDailySuccessStreak = Object.keys(dailySuccessStreaks)
    .map(Number)
    .filter((n) => dailySuccessStreaks[n] > 0)
    .sort((a, b) => b - a)[0];
  if (maxDailySuccessStreak) {
    const count = dailySuccessStreaks[maxDailySuccessStreak];
    indications.push({
      type: 'success',
      message: count === 1
        ? `A workflow has succeeded for ${maxDailySuccessStreak} or more consecutive days`
        : `${count} workflows have succeeded for ${maxDailySuccessStreak} or more consecutive days`,
      relevantWorkflowCount: count,
    });
  }
  if (anyRecentFailure) {
    indications.push({ type: 'warning', message: 'At least one workflow failed in the most recent run', relevantWorkflowCount: 1, severityScore: 5 });
  }
  if (totalFailures === 0 && totalSuccess > 0) {
    indications.push({ type: 'success', message: 'All runs succeeded', relevantWorkflowCount: totalSuccess, severityScore: 0 });
  }
  if (totalFailures > 0 && totalSuccess === 0) {
    indications.push({ type: 'error', message: 'All runs failed', relevantWorkflowCount: totalFailures, severityScore: totalFailures * 10 });
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