
import './WorkflowHistogram.css';
import React from 'react';
import type { WorkflowStatus } from '../api/Repositories';

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

export interface WorkflowHistogramProps {
  runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>;
}

const WorkflowHistogram: React.FC<WorkflowHistogramProps> = ({ runs }) => (
  <section className="analytics-histogram">
    <h3>Workflow Run Histograms</h3>
    <div className="histogram-list">
      {runs.map(({ branch, workflowKey, workflow }) => (
        <div className="histogram-entry" key={branch + ':' + workflowKey}>
          <div className="histogram-label">
            <span className="histogram-workflow">
              {(() => {
                const wfName = workflow && workflow.length > 0 && workflow[0].name;
                if (wfName && typeof wfName === 'string' && wfName.trim().length > 0) {
                  return wfName;
                }
                return workflowKey;
              })()}
            </span>
            <span className="histogram-branch" style={{ fontSize: '0.93em', color: 'var(--text-secondary, #666)' }}>{branch}</span>
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
);

export default WorkflowHistogram;
