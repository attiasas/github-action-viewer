
import './WorkflowHistogram.css';
import React from 'react';
import type { WorkflowStatus } from '../api/Repositories';
import { getNormalizedStatus } from './StatusUtils';

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


export interface WorkflowHistogramProps {
  runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>;
}

const WorkflowHistogram: React.FC<WorkflowHistogramProps> = ({ runs }) => {
  // Helper to rank statuses (worst first)
  const STATUS_RANK: Record<string, number> = {
    failure: 0,
    error: 1,
    cancelled: 2,
    running: 3,
    pending: 4,
    unknown: 5,
    success: 6,
    no_runs: 7,
  };

  // Helper to count consecutive runs with the same status from the start
  function countConsecutiveSameStatus(workflow: WorkflowStatus[]): number {
    if (!workflow.length) return 0;
    const firstStatus = getNormalizedStatus(workflow[0].status, workflow[0].conclusion);
    let count = 1;
    for (let i = 1; i < workflow.length; i++) {
      const status = getNormalizedStatus(workflow[i].status, workflow[i].conclusion);
      if (status === firstStatus) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  // Sort runs by latest run status, then by most consecutive runs with same status (worst first)
  const sortedRuns = [...runs].sort((a, b) => {
    const aLatest = a.workflow[0];
    const bLatest = b.workflow[0];
    const aStatus = getNormalizedStatus(aLatest?.status, aLatest?.conclusion);
    const bStatus = getNormalizedStatus(bLatest?.status, bLatest?.conclusion);
    const statusCompare = STATUS_RANK[aStatus] - STATUS_RANK[bStatus];
    if (statusCompare !== 0) return statusCompare;
    // If same status, compare consecutive count (more is worse)
    const aConsec = countConsecutiveSameStatus(a.workflow);
    const bConsec = countConsecutiveSameStatus(b.workflow);
    return bConsec - aConsec;
  });

  return (
    <section className="analytics-histogram">
      <h3>Workflow Run Histograms</h3>
      <div className="histogram-list">
        {sortedRuns.map(({ branch, workflowKey, workflow }) => (
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
            <div className="histogram-cubes" data-count={workflow.length}>
              {(workflow.length === 1 && getNormalizedStatus(workflow[0].status, workflow[0].conclusion) === 'no_runs') ? (
                <span style={{ color: 'var(--text-secondary, #888)', fontSize: '0.97em', padding: '2px 0' }}>No runs yet</span>
              ) : (
                workflow.map((run, idx) => {
                  const normalized = getNormalizedStatus(run.status, run.conclusion);
                  return (
                    <span
                      key={run.runNumber || idx}
                      className="histogram-cube"
                      title={`Run #${run.runNumber || ''} - ${normalized}`}
                      style={{ background: STATUS_COLORS[normalized] || '#bdbdbd' }}
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
};

export default WorkflowHistogram;
