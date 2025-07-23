import React from 'react';
import type { WorkflowStatus } from '../api/Repositories';

export interface WorkflowAnalyticsProps {
  runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>;
}

/**
 * Analytics section for workflow runs. Aggregates all runs (not just latest) for statistics.
 */

import './WorkflowAnalytics.css';

const STATUS_COLORS: Record<string, string> = {
  success: '#4caf50',
  failure: '#f44336',
  cancelled: '#9e9e9e',
  running: '#2196f3',
  pending: '#ff9800',
  error: '#e91e63',
  unknown: '#bdbdbd',
  no_runs: '#bdbdbd',
};

function getNormalizedStatus(status: string, conclusion: string | null): string {
  if (status === 'no_runs') return 'no_runs';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'failure') return 'failure';
  if (conclusion === 'cancelled') return 'cancelled';
  if (status === 'running' || status === 'in_progress') return 'running';
  if (status === 'pending' || status === 'queued') return 'pending';
  if (status === 'error') return 'error';
  return 'unknown';
}

function getIndications(runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>): string[] {
  const indications: string[] = [];
  let totalFailures = 0;
  let totalSuccess = 0;
  let workflowsWithNoRuns = 0;
  const consecutiveFailures: Record<string, number> = {};
  const consecutiveSuccess: Record<string, number> = {};
  let anyLongFailureStreak = false;
  let anyLongSuccessStreak = false;
  let anyRecentFailure = false;

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
    if (failStreak >= 3) anyLongFailureStreak = true;
    if (successStreak >= 5) anyLongSuccessStreak = true;
  });

  if (workflowsWithNoRuns > 0) {
    indications.push(
      workflowsWithNoRuns === 1
        ? '1 workflow has no runs yet'
        : `${workflowsWithNoRuns} workflows have no runs yet`
    );
  }
  if (anyLongFailureStreak) {
    indications.push('Some workflows have failed more than 3 runs in a row');
  }
  if (anyLongSuccessStreak) {
    indications.push('Some workflows have succeeded 5 or more times in a row');
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

const WorkflowAnalytics: React.FC<WorkflowAnalyticsProps> = ({ runs }) => {
  const indications = getIndications(runs);

  return (
    <div className="workflow-analytics">
      <section className="analytics-indications">
        <h3>Indications</h3>
        <ul>
          {indications.map((ind, idx) => (
            <li key={idx}>{ind}</li>
          ))}
        </ul>
      </section>
      <section className="analytics-histogram">
        <h3>Workflow Run Histograms</h3>
        <div className="histogram-list">
          {runs.map(({ branch, workflowKey, workflow }) => (
            <div className="histogram-entry" key={branch + ':' + workflowKey}>
              <div className="histogram-label">
                <span className="histogram-branch">{branch}</span>
                <span className="histogram-workflow">{workflowKey}</span>
              </div>
              <div className="histogram-cubes">
                {workflow.length === 1 && getNormalizedStatus(workflow[0].status, workflow[0].conclusion) === 'no_runs' ? (
                  <span
                    className="histogram-cube"
                    title="No runs yet"
                    style={{ background: STATUS_COLORS['no_runs'] }}
                  />
                ) : (
                  workflow.map((run, idx) => {
                    const status = getNormalizedStatus(run.status, run.conclusion);
                    return (
                      <span
                        key={run.runNumber || idx}
                        className="histogram-cube"
                        title={`Run #${run.runNumber || ''} - ${status}`}
                        style={{ background: STATUS_COLORS[status] || '#bdbdbd' }}
                      />
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default WorkflowAnalytics;
