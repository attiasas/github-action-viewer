import type { WorkflowStatus } from '../api/Repositories';
import { getNormalizedStatus } from './StatusUtils';

export type IndicationType = 'info' | 'warning' | 'success' | 'error';
export interface Indication {
  type: IndicationType;
  message: string;
  url?: string;
  timestamp?: string;
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
    // Analyze run statuses for this workflow
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
    [5, 10, 15, 20, 25, 30].forEach((n) => {
      if (failStreak >= n) failureStreaks[n] = (failureStreaks[n] || 0) + 1;
      if (successStreak >= n) successStreaks[n] = (successStreaks[n] || 0) + 1;
    });
  });

  if (workflowsWithNoRuns > 0) {
    indications.push({
      type: 'info',
      message: workflowsWithNoRuns === 1
        ? '1 workflow has no runs yet'
        : `${workflowsWithNoRuns} workflows have no runs yet`
    });
  }
  if (workflowsWithOnlyFailures > 0) {
    indications.push({
      type: 'warning',
      message: workflowsWithOnlyFailures === 1
        ? '1 workflow has only failures'
        : `${workflowsWithOnlyFailures} workflows have only failures`
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
        : `${count} workflows have not run in the last ${maxNotRunDays} days`
    });
  }
  // Only show the most significant (longest) failure and success streaks
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
        : `${count} workflows have failed ${maxFailureStreak} or more times in a row`
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
        : `${count} workflows have succeeded ${maxSuccessStreak} or more times in a row`
    });
  }
  if (anyRecentFailure) {
    indications.push({ type: 'warning', message: 'At least one workflow failed in the most recent run' });
  }
  if (totalFailures === 0 && totalSuccess > 0) {
    indications.push({ type: 'success', message: 'All runs succeeded' });
  }
  if (totalFailures > 0 && totalSuccess === 0) {
    indications.push({ type: 'error', message: 'All runs failed' });
  }
  if (indications.length === 0) {
    indications.push({ type: 'info', message: 'No significant patterns detected' });
  }
  return indications;
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
      const start = new Date(run.runStartedAt).getTime();
      const end = new Date(run.updatedAt).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        totalRunTime += (end - start);
        runTimeCount++;
        totalRuns++;
      }
    }
    if (run.conclusion === 'success') successCount++;
  });
  const avgRunTime = runTimeCount > 0 ? totalRunTime / runTimeCount : null;
  const successRate = totalRuns > 0 ? successCount / totalRuns : null;
  return { totalRuns: workflow.length, avgRunTime, successRate };
}