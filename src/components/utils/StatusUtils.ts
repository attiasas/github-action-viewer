// Calculate stability score for a set of runs, normalized 0-100
import { getIndications } from './indicationsUtils';
import type { RepositoryStatus, WorkflowStatus } from '../../api/Repositories';

export type NormalizedStatus = 'success' | 'failure' | 'cancelled' | 'running' | 'pending' | 'error' | 'unknown' | 'no_runs';
export type Severity = 'info' | 'success' | 'error' | 'warning';
export type ChangeType = 'bad' | 'good' | 'info' | undefined;

export function getNormalizedStatus(status: string, conclusion: string | null): string {
  const actual: string = conclusion || status;
  if (actual === 'no_runs') return 'no_runs';

  if (actual === 'success') return 'success';
  if (actual === 'failure' || actual === 'timed_out') return 'failure';
  if (actual === 'cancelled' || actual === 'skipped') return 'cancelled';
  if (actual === 'queued' || actual === 'running' || actual === 'in_progress') return 'running';

  if (actual === 'error') return 'error';

  if (actual === 'pending' || actual === 'action_required') return 'pending';

  return 'unknown';
}

export function getReversedSeverity(severity: Severity): Severity {
  switch (severity) {
    case 'success':
      return 'error';
    case 'error':
    case 'warning':
      return 'success';
    default:
      return 'info';
  }
}

export function getDailyStatus(workflow: WorkflowStatus[]): Array<{ date: string; run: WorkflowStatus | null }> {
  if (!workflow.length) return [];
  // Map date string (DD-MM-YYYY) to latest run for that day
  // And also keep track of the last run date
  const map = new Map<string, WorkflowStatus>();
  let lastRunDate: Date | null = null;
  for (const run of workflow) {
    const timestamp = run.createdAt || run.runStartedAt || run.updatedAt;
    if (!timestamp) continue;
    const timestampDate = new Date(timestamp);
    const dayStr = String(timestampDate.getDate()).padStart(2, '0') + '-' + String(timestampDate.getMonth() + 1).padStart(2, '0') + '-' + timestampDate.getFullYear();
    // Only keep the latest run for the day (assuming workflow is sorted latest first)
    if (!map.has(dayStr)) {
      map.set(dayStr, run);
      lastRunDate = timestampDate;
    }
  }
  if (!lastRunDate) return [];
  // Remove time from last run date
  lastRunDate.setHours(0, 0, 0, 0);
  if (lastRunDate > new Date()) {
    lastRunDate = new Date(); // Ensure we don't go into future
  }
  // Build array from today back to last run date
  const days: Array<{ date: string; run: WorkflowStatus | null }> = [];
  const currentDate = new Date();
  while (currentDate >= lastRunDate) {
    const dayStr = String(currentDate.getDate()).padStart(2, '0') + '-' + String(currentDate.getMonth() + 1).padStart(2, '0') + '-' + currentDate.getFullYear();
    days.push({ date: dayStr, run: map.get(dayStr) || { status: 'no_runs' } as WorkflowStatus });
    currentDate.setDate(currentDate.getDate() - 1);
  }
  return days;
}

// Helper to determine type of status change
export function getStatusChangeType(currentStatus: string, prev: WorkflowStatus[]): ChangeType {
  if (!prev || !Array.isArray(prev) || prev.length === 0) return undefined;
  let prevStatus = 'no_runs'
  for (let i = 0; i < prev.length; i++) {
    // Get the normalized status of the previous run
    prevStatus = getNormalizedStatus(prev[i].status, prev[i].conclusion);
    if (prevStatus  === 'success' || prevStatus === 'failure' || prevStatus === 'error') break;
  }
  if (prevStatus === 'success' && (currentStatus === 'failure' || currentStatus === 'error')) return 'bad';
  if ((prevStatus === 'failure' || prevStatus === 'error') && currentStatus === 'success') return 'good';
  return undefined;
}

// Helper to get status indicator for a single workflow run
export function getStatusIndicator(curr: WorkflowStatus, prev: WorkflowStatus[]): ChangeType {
  if (!curr) return undefined;
  // calculate status indicator based on current status
  const currentStatus = getNormalizedStatus(curr.status, curr.conclusion);
  if (currentStatus === 'running' || currentStatus === 'pending' || currentStatus === 'unknown') return 'info';
  // calculate based on current and previous status
  return getStatusChangeType(currentStatus, prev);
}

// Helper to find status change indices and types in workflow runs (latest first)
export function getStatusChangeIndicators(workflow: WorkflowStatus[]): Record<number, ChangeType> {
  const indicators: Record<number, ChangeType> = {};
  for (let i = 0; i < workflow.length; i++) {
    let prev: WorkflowStatus[] = [];
    if (i < workflow.length - 1) {
      prev = workflow.slice(i + 1);
    }
    const changeType = getStatusIndicator(workflow[i], prev);
    if (changeType) {
      indicators[i] = changeType;
    }
  }
  return indicators;
}

export function RepositoryStatusToFlatArray(repositoryData: RepositoryStatus, filterBranch?: string, filterWorkflow?: string): Array<{ branch: string, workflowKey: string, jobRuns: WorkflowStatus[] }> {
  const allRunsForAnalytics: Array<{ branch: string, workflowKey: string, jobRuns: WorkflowStatus[] }> = [];
  Object.entries(repositoryData.branches).filter(([branchName]) => !filterBranch || branchName === filterBranch)
    .forEach(([branchName, branchData]) => {
      Object.entries(branchData.workflows).filter(([workflowKey, workflowRuns]) => {
        if (!filterWorkflow) return true;
        const runs = workflowRuns as WorkflowStatus[];
        const wf = runs[0] as WorkflowStatus;
        return (
          workflowKey === filterWorkflow ||
          (wf && (wf.name === filterWorkflow || wf.workflow_path === filterWorkflow))
        );
      })
    .forEach(([workflowKey, workflowRuns]) => {
      allRunsForAnalytics.push({ branch: branchName, workflowKey, jobRuns: workflowRuns as WorkflowStatus[] });
    });
  });
  return allRunsForAnalytics;
}

export function calculateStabilityScore(
  entries: Array<{ branch: string; workflowKey: string; jobRuns: WorkflowStatus[] }>
): number | null {
  if (!entries || entries.length === 0) return null;
  // If all workflows are no_run, return null (unknown)
  const allNoRun = entries.every(({ jobRuns }) =>
    jobRuns.length === 0 || jobRuns.every(run => {
      const status = run.status || run.conclusion;
      return status === 'no_runs';
    })
  );
  if (allNoRun) return null;

  const workflowScores: number[] = [];
  entries.forEach(({ branch, workflowKey, jobRuns }) => {
    const indications = getIndications([
      { branch, workflowKey, jobRuns }
    ]);
    const relevant = indications.filter(ind => ind.severity !== 'success');
    let penalty = 0;
    relevant.forEach(ind => {
      let factor = 1;
      if (ind.severity === 'error') factor = 2;
      else if (ind.severity === 'warning') factor = 1;
      else if (ind.severity === 'info') factor = 0.5;
      penalty += (ind.severityScore || 1) * factor;
    });
    const indicationScore = Math.max(0, 100 - Math.min(Math.log10(1 + penalty) * 25, 100));

    // Weighted success rate: recent runs count more
    let successRate = 100;
    if (jobRuns.length > 0) {
      // Exponential decay weights: w_i = decay^i, latest run is i=0
      const decay = 0.5; // tune decay factor (0.7-0.9 reasonable)
      let weightedSuccess = 0;
      let weightedTotal = 0;
      for (let i = 0; i < jobRuns.length; i++) {
        const run = jobRuns[i];
        const status = getNormalizedStatus(run.status, run.conclusion);
        // Only consider runs that are not no_runs or cancelled
        if (status !== 'no_runs' && status !== 'cancelled') {
          const weight = Math.pow(decay, i);
          weightedTotal += weight;
          if (status === 'success') {
            weightedSuccess += weight;
          }
        }
      }
      successRate = weightedTotal > 0 ? (weightedSuccess / weightedTotal) * 100 : 100;
    }
    const finalScore = 0.5 * indicationScore + 0.5 * successRate;
    workflowScores.push(finalScore);
  });
  const avgScore = workflowScores.reduce((a, b) => a + b, 0) / workflowScores.length;
  return Math.max(0, Math.min(100, Math.round(avgScore)));
}