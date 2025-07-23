import type { WorkflowStatus } from '../api/Repositories';

export function getNormalizedStatus(status: string, conclusion: string | null): string {
  if (status === 'no_runs') return 'no_runs';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'failure') return 'failure';
  if (conclusion === 'cancelled') return 'cancelled';
  if (status === 'running' || status === 'in_progress') return 'running';
  if (status === 'pending' || status === 'queued') return 'pending';
  if (status === 'error') return 'error';
  return 'unknown';
}

export function getIndications(runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>): string[] {
  const indications: string[] = [];
  let totalFailures = 0;
  let totalSuccess = 0;
  let workflowsWithNoRuns = 0;
  const consecutiveFailures: Record<string, number> = {};
  const consecutiveSuccess: Record<string, number> = {};
  let anyRecentFailure = false;
  // For streaks: { streakLength: count }
  const failureStreaks: Record<number, number> = {};
  const successStreaks: Record<number, number> = {};

  runs.forEach(({ branch, workflowKey, workflow }) => {
    // If workflow has a single run with status 'no_runs', treat as no runs
    if (
      workflow.length === 1 &&
      getNormalizedStatus(workflow[0].status, workflow[0].conclusion) === 'no_runs'
    ) {
      workflowsWithNoRuns++;
      return;
    }
    let failStreak = 0;
    let successStreak = 0;
    for (let i = workflow.length - 1; i >= 0; i--) {
      const run = workflow[i];
      const status = getNormalizedStatus(run.status, run.conclusion);
      if (status === 'failure') {
        failStreak++;
        totalFailures++;
        if (i === workflow.length - 1) anyRecentFailure = true;
        successStreak = 0;
      } else if (status === 'success') {
        successStreak++;
        totalSuccess++;
        failStreak = 0;
      } else {
        failStreak = 0;
        successStreak = 0;
      }
    }
    consecutiveFailures[`${branch}:${workflowKey}`] = failStreak;
    consecutiveSuccess[`${branch}:${workflowKey}`] = successStreak;
    // Generalize for 5, 10, 15, ...
    [5, 10, 15, 20, 25, 30].forEach((n) => {
      if (failStreak >= n) failureStreaks[n] = (failureStreaks[n] || 0) + 1;
      if (successStreak >= n) successStreaks[n] = (successStreaks[n] || 0) + 1;
    });
  });

  if (workflowsWithNoRuns > 0) {
    indications.push(
      workflowsWithNoRuns === 1
        ? '1 workflow has no runs yet'
        : `${workflowsWithNoRuns} workflows have no runs yet`
    );
  }
  // Only show the most significant (longest) failure and success streaks
  const maxFailureStreak = Object.keys(failureStreaks)
    .map(Number)
    .filter((n) => failureStreaks[n] > 0)
    .sort((a, b) => b - a)[0];
  if (maxFailureStreak) {
    const count = failureStreaks[maxFailureStreak];
    indications.push(
      count === 1
        ? `A workflow has failed ${maxFailureStreak} or more times in a row`
        : `${count} workflows have failed ${maxFailureStreak} or more times in a row`
    );
  }
  const maxSuccessStreak = Object.keys(successStreaks)
    .map(Number)
    .filter((n) => successStreaks[n] > 0)
    .sort((a, b) => b - a)[0];
  if (maxSuccessStreak) {
    const count = successStreaks[maxSuccessStreak];
    indications.push(
      count === 1
        ? `A workflow has succeeded ${maxSuccessStreak} or more times in a row`
        : `${count} workflows have succeeded ${maxSuccessStreak} or more times in a row`
    );
  }
  if (anyRecentFailure) {
    indications.push('At least one workflow failed in the most recent run');
  }
  if (totalFailures === 0 && totalSuccess > 0) {
    indications.push('All runs succeeded');
  }
  if (totalFailures > 0 && totalSuccess === 0) {
    indications.push('All runs failed');
  }
  if (indications.length === 0) {
    indications.push('No significant patterns detected');
  }
  return indications;
}
