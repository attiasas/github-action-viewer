
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

  // Helper to shorten commit SHA
  function shortCommit(commit: string | null | undefined) {
    return commit && commit.length > 7 ? commit.slice(0, 7) : commit || '';
  }

  // Helper to format date
  function formatDate(dateStr?: string) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

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
      {/* Status color legend */}
      <div style={{ display: 'flex', gap: '1.5em', marginBottom: '0.7em', flexWrap: 'wrap', fontSize: '0.97em' }}>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.4em' }}>
            <span style={{ width: 16, height: 16, background: color, borderRadius: 4, display: 'inline-block', border: '1px solid #e0e0e0' }} />
            <span style={{ color: 'var(--text-secondary, #888)' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
          </span>
        ))}
      </div>
      <div className="histogram-list">
        {sortedRuns.map(({ branch, workflowKey, workflow }) => {
          const wfName = workflow && workflow.length > 0 && workflow[0].name;
          const wfPath = workflow && workflow.length > 0 && workflow[0].workflow_path;
          return (
            <div className="histogram-entry" key={branch + ':' + workflowKey}>
              <div className="histogram-label">
                <span className="histogram-workflow" style={{ fontWeight: 600, fontSize: '1.07em' }}>
                  {wfName && typeof wfName === 'string' && wfName.trim().length > 0 ? wfName : workflowKey}
                </span>
                {wfPath && (
                  <span style={{ fontSize: '0.89em', color: 'var(--text-tertiary, #aaa)' }}>{wfPath}</span>
                )}
                <span className="histogram-branch" style={{ fontSize: '0.93em', color: 'var(--text-secondary, #666)' }}>{branch}</span>
              </div>
              <div className="histogram-cubes" data-count={workflow.length}>
                {(workflow.length === 1 && getNormalizedStatus(workflow[0].status, workflow[0].conclusion) === 'no_runs') ? (
                  <span style={{ color: 'var(--text-secondary, #888)', fontSize: '0.97em', padding: '2px 0' }}>No runs yet</span>
                ) : (
                  workflow.map((run, idx) => {
                    const normalized = getNormalizedStatus(run.status, run.conclusion);
                    const tooltip = `Run #${run.runNumber || ''}\nStatus: ${normalized}\nCommit: ${shortCommit(run.commit)}\nDate: ${formatDate(run.createdAt)}${run.url ? '\nClick to view run' : ''}`;
                    return (
                      <span
                        key={run.runNumber || idx}
                        className="histogram-cube"
                        title={tooltip}
                        style={{ background: STATUS_COLORS[normalized] || '#bdbdbd', cursor: run.url ? 'pointer' : 'default', border: normalized === 'success' ? '2px solid var(--status-success, #28a745)' : undefined }}
                        onClick={() => { if (run.url) window.open(run.url, '_blank', 'noopener'); }}
                        tabIndex={run.url ? 0 : -1}
                        aria-label={tooltip.replace(/\n/g, ' ')}
                      >
                        {/* Show run number below cube for clarity on mobile */}
                        <span style={{ display: 'none' }}>{run.runNumber}</span>
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default WorkflowHistogram;
