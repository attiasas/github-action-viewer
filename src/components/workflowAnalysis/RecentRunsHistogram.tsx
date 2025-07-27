import React from 'react';
import './RecentRunsHistogram.css';
import type { WorkflowStatus } from '../../api/Repositories';
import { calculateRunTime, formatRunTime, shortCommit } from '../indicationsUtils';
import { getNormalizedStatus, getStatusChangeIndicators } from '../StatusUtils';

const STATUS_COLORS: Record<string, string> = {
  success: '#4caf50',
  failure: '#f44336',
  cancelled: '#a17fc3',
  running: '#2196f3',
  pending: '#ff9800',
  error: '#e91e63',
  unknown: '#6ec6ff',
  no_runs: '#bdbdbd',
};

// Status change icons by type
const statusChangeIcons: Record<string, React.ReactNode> = {
  bad: <span className="histogram-status-change-indicator" style={{ color: 'var(--accent-danger, #dc3545)' }} title="Status worsened" aria-label="Status worsened">❌</span>,
  good: <span className="histogram-status-change-indicator" style={{ color: 'var(--accent-success, #28a745)' }} title="Status improved" aria-label="Status improved">✅</span>,
  info: <span className="histogram-status-change-indicator" style={{ color: 'var(--accent-warning, #ffc107)' }} title="Status changed" aria-label="Status changed">&#x1F504;</span>,
};

interface RecentRunsHistogramProps {
  workflow: WorkflowStatus[];
}

const RecentRunsHistogram: React.FC<RecentRunsHistogramProps> = ({
  workflow,
}) => {
  // Helper to format date
  function formatDate(dateStr?: string) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const statusChangeIndicators = getStatusChangeIndicators(workflow);
  const statusChangeIdxs = Object.keys(statusChangeIndicators).map(Number);
  const firstStatusChangeIdx = statusChangeIdxs.length > 0 ? Math.min(...statusChangeIdxs) : -1;
  return (
    <div className="recent-runs-histogram">
      <div className="histogram-cubes" data-count={workflow.length}>
        {(workflow.length === 1 && getNormalizedStatus(workflow[0].status, workflow[0].conclusion) === 'no_runs') ? (
          <span style={{ color: 'var(--text-secondary, #888)', fontSize: '0.97em', padding: '2px 0' }}>No runs yet</span>
        ) : (
          workflow.map((run, idx) => {
            const normalized = getNormalizedStatus(run.status, run.conclusion);
            let runTimeStr = '';
            if (run.runStartedAt && run.updatedAt) {
              runTimeStr = formatRunTime(Math.round(calculateRunTime(new Date(run.runStartedAt).getTime(), new Date(run.updatedAt).getTime()) || 0) / 1000);
            }
            const tooltip = `Run #${run.runNumber || run.runId || ''}\nAttempt: ${run.runAttempt || -1}\nStatus: ${run.conclusion || run.status}\nEvent: ${run.event || ''}\nCommit: ${shortCommit(run.commit)}\nCreated at: ${formatDate(run.createdAt)}\nStarted at: ${formatDate(run.runStartedAt)}\nUpdated at: ${formatDate(run.updatedAt)}${runTimeStr ? `\nRun time: ${runTimeStr}` : ''}${run.url ? '\n\nClick to view run' : ''}`;
            const changeType = statusChangeIndicators[idx];
            const isStatusChange = !!changeType;
            const pulse = isStatusChange && idx === firstStatusChangeIdx;
            return (
              <div
                key={run.runId || idx}
                className={`histogram-cube-label-wrapper${isStatusChange ? ' has-indicator' : ''}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', minHeight: 60, position: 'relative' }}
              >
                {/* Floating indicator above cube, always centered */}
                {isStatusChange && (
                  <span
                    className={`histogram-status-change-badge${pulse ? ' histogram-status-change-badge-pulse' : ''}`}
                    title={`Status changed (${changeType}) from previous run`}
                  >
                    {statusChangeIcons[changeType]}
                  </span>
                )}
                {/* Cube itself */}
                <span
                  className={`histogram-cube${isStatusChange ? (pulse ? ' histogram-cube-status-change' : ' histogram-cube-status-change-static') : ''}`}
                  title={(isStatusChange ? `Status changed (${changeType}) from previous run\n\n` : '') + tooltip}
                  style={{
                    background: STATUS_COLORS[normalized] || '#bdbdbd',
                    cursor: run.url ? 'pointer' : 'default',
                    border: normalized === 'success' ? '2px solid var(--status-success, #28a745)' : undefined,
                    position: 'relative',
                  }}
                  onClick={() => { if (run.url) window.open(run.url, '_blank', 'noopener'); }}
                  tabIndex={run.url ? 0 : -1}
                  aria-label={tooltip.replace(/\n/g, ' ')}
                >
                  {/* Show run number below cube for clarity on mobile */}
                  <span style={{ display: 'none' }}>{run.runId}</span>
                </span>
                {/* Attempt number label if multiple attempts exist */}
                {run.runAttempt && run.runAttempt > 1 && (
                  <span className="histogram-cube-attempt-label" title={`Attempt #${run.runAttempt}`}>x{run.runAttempt}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RecentRunsHistogram;
