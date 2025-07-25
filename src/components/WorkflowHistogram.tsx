
import './WorkflowHistogram.css';
import React from 'react';
import type { WorkflowStatus } from '../api/Repositories';
import { getNormalizedStatus } from './StatusUtils';

const STATUS_COLORS: Record<string, string> = {
  success: '#4caf50',
  failure: '#f44336',
  cancelled: '#a17fc3', // distinct purple for cancelled
  running: '#2196f3',
  pending: '#ff9800',
  error: '#e91e63',
  unknown: '#6ec6ff', // light blue for unknown
  no_runs: '#e0e0e0', // light gray for no_runs
};


export interface WorkflowHistogramProps {
  runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>;
}

const WorkflowHistogram: React.FC<WorkflowHistogramProps> = ({ runs }) => {
  // Status change icons by type
  const statusChangeIcons: Record<string, React.ReactNode> = {
    bad: <span className="histogram-status-change-indicator" style={{ color: 'var(--accent-danger, #dc3545)' }} title="Status worsened" aria-label="Status worsened">❌</span>,
    good: <span className="histogram-status-change-indicator" style={{ color: 'var(--accent-success, #28a745)' }} title="Status improved" aria-label="Status improved">✅</span>,
    info: <span className="histogram-status-change-indicator" style={{ color: 'var(--accent-warning, #ffc107)' }} title="Status changed" aria-label="Status changed">&#x1F504;</span>,
  };

  // Helper to determine type of status change

  // Helper to determine type of status change
  function getStatusChangeType(currentStatus: string, prev: WorkflowStatus[]): 'bad' | 'good' | 'info' | undefined {
    if (!prev || !Array.isArray(prev) || prev.length === 0) return undefined;
    const prevStatus = getNormalizedStatus(prev[0].status, prev[0].conclusion);
    if (prevStatus === 'success' && (currentStatus === 'failure' || currentStatus === 'error')) return 'bad';
    if ((prevStatus === 'failure' || prevStatus === 'error') && currentStatus === 'success') return 'good';
    return undefined;
  }

  // Helper to get status indicator for a single workflow run
  function getStatusIndicator(curr: WorkflowStatus, prev: WorkflowStatus[]): 'bad' | 'good' | 'info' | undefined {
    if (!curr) return undefined;
    // calculate status indicator based on current status
    const currentStatus = getNormalizedStatus(curr.status, curr.conclusion);
    if (currentStatus === 'running' || currentStatus === 'pending' || currentStatus === 'unknown') return 'info';
    // calculate based on current and previous status
    return getStatusChangeType(currentStatus, prev);
  }

  // Helper to find status change indices and types in workflow runs (latest first)
  function getStatusChangeIndicators(workflow: WorkflowStatus[]): Record<number, 'bad' | 'good' | 'info'> {
    const indicators: Record<number, 'bad' | 'good' | 'info'> = {};
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
  // Helper to get daily status: last run of each day, from last run date back to today
  function getDailyStatus(workflow: WorkflowStatus[]): Array<{ date: string; run: WorkflowStatus | null }> {
    if (!workflow.length) return [];
    // Map date string (YYYY-MM-DD) to latest run for that day
    // And also keep track of the last run date
    const map = new Map<string, WorkflowStatus>();
    let lastRunDate: Date | null = null;
    for (const run of workflow) {
      const createdAt = run.createdAt || run.updatedAt; // Prefer createdAt, fallback to updatedAt
      if (!createdAt) continue;
      const d = new Date(createdAt);
      const dayStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      // Only keep the latest run for the day (assuming workflow is sorted latest first)
      if (!map.has(dayStr)) {
        map.set(dayStr, run);
        lastRunDate = d;
      }
    }
    if (!lastRunDate) return [];
    // Build array from today back to last run date
    const days: Array<{ date: string; run: WorkflowStatus | null }> = [];
    const d = new Date();
    while (d >= lastRunDate) {
      const dayStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      days.push({ date: dayStr, run: map.get(dayStr) || null });
      d.setDate(d.getDate() - 1);
    }
    return days;
  }

  return (
    <section className="analytics-histogram">
      <h3>Workflow Run Analysis</h3>
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
          const statusChangeIndicators = getStatusChangeIndicators(workflow);
          // Find the first (latest) status change index (lowest idx in statusChangeIndicators)
          const statusChangeIdxs = Object.keys(statusChangeIndicators).map(Number);
          const firstStatusChangeIdx = statusChangeIdxs.length > 0 ? Math.min(...statusChangeIdxs) : -1;
          // Get daily status
          const dailyStatus = getDailyStatus(workflow);
          return (
            <div className="histogram-entry" key={branch + ':' + workflowKey}>
              <div className="histogram-label">
                <span className="histogram-workflow" style={{ fontWeight: 600, fontSize: '1.07em' }}>
                  {wfName && typeof wfName === 'string' && wfName.trim().length > 0 ? wfName : workflowKey}
                </span>
                <span className="histogram-branch" style={{ fontSize: '0.93em', color: 'var(--text-secondary, #666)' }}>{branch}</span>
              </div>
              {/* Main histogram */}
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: '0.97em', fontWeight: 500, marginBottom: 10 }}>Recent Runs</div>
                <div className="histogram-cubes" data-count={workflow.length}>
                  {(workflow.length === 1 && getNormalizedStatus(workflow[0].status, workflow[0].conclusion) === 'no_runs') ? (
                    <span style={{ color: 'var(--text-secondary, #888)', fontSize: '0.97em', padding: '2px 0' }}>No runs yet</span>
                  ) : (
                    workflow.map((run, idx) => {
                      const normalized = getNormalizedStatus(run.status, run.conclusion);
                      const tooltip = `Run #${run.runNumber || ''}\nStatus: ${normalized}\nCommit: ${shortCommit(run.commit)}\nDate: ${formatDate(run.createdAt)}${run.url ? '\nClick to view run' : ''}`;
                      const changeType = statusChangeIndicators[idx];
                      const isStatusChange = !!changeType;
                      const pulse = isStatusChange && idx === firstStatusChangeIdx;
                      return (
                        <span
                          key={run.runNumber || idx}
                          className={`histogram-cube${isStatusChange ? (pulse ? ' histogram-cube-status-change' : ' histogram-cube-status-change-static') : ''}`}
                          title={tooltip + (isStatusChange ? `\nStatus changed (${changeType}) from previous run` : '')}
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
                          <span style={{ display: 'none' }}>{run.runNumber}</span>
                          {isStatusChange && (
                            <span className="histogram-status-change-badge" title={`Status changed (${changeType}) from previous run`}>
                              {statusChangeIcons[changeType]}
                            </span>
                          )}
                        </span>
                      );
                    })
                  )}
                </div>
                {/* Daily status histogram */}
                <div style={{ fontSize: '0.97em', fontWeight: 500, margin: '10px 0 10px 0' }}>Daily Status</div>
                <div className="histogram-cubes" data-count={dailyStatus.length}>
                  {dailyStatus.every(ds => !ds.run) ? (
                    <span style={{ color: 'var(--text-secondary, #888)', fontSize: '0.97em', padding: '2px 0' }}>No runs yet</span>
                  ) : (
                    (() => {
                      // Find the first (latest) status change index in dailyStatus
                      const statusChangeIdxs = dailyStatus
                        .map((ds, idx) => {
                          const prev = idx < dailyStatus.length - 1 ? dailyStatus.slice(idx + 1).map(d => d.run).filter(Boolean) as WorkflowStatus[] : [];
                          const changeType = ds.run ? getStatusIndicator(ds.run, prev) : undefined;
                          return changeType ? idx : null;
                        })
                        .filter(idx => idx !== null) as number[];
                      const firstStatusChangeIdx = statusChangeIdxs.length > 0 ? Math.min(...statusChangeIdxs) : -1;
                      return dailyStatus.map((ds, idx) => {
                        const normalized = ds.run ? getNormalizedStatus(ds.run.status, ds.run.conclusion) : 'no_runs';
                        const tooltip = ds.run
                          ? `Date: ${ds.date}\nStatus: ${normalized}\nRun #${ds.run.runNumber || ''}\nCommit: ${shortCommit(ds.run.commit)}${ds.run.url ? '\nClick to view run' : ''}`
                          : `Date: ${ds.date}\nNo run`;
                        const prev = idx < dailyStatus.length - 1 ? dailyStatus.slice(idx + 1).map(d => d.run).filter(Boolean) as WorkflowStatus[] : [];
                        const changeType = ds.run ? getStatusIndicator(ds.run, prev) : undefined;
                        const isStatusChange = !!changeType;
                        const pulse = isStatusChange && idx === firstStatusChangeIdx;
                        return (
                          <span
                            key={ds.date}
                            className={`histogram-cube${isStatusChange ? (pulse ? ' histogram-cube-status-change' : ' histogram-cube-status-change-static') : ''}`}
                            title={tooltip + (isStatusChange ? `\nStatus changed (${changeType}) from previous day` : '')}
                            style={{
                              background: STATUS_COLORS[normalized] || '#bdbdbd',
                              cursor: ds.run && ds.run.url ? 'pointer' : 'default',
                              opacity: ds.run ? 1 : 0.45,
                              position: 'relative',
                            }}
                            onClick={() => { if (ds.run && ds.run.url) window.open(ds.run.url, '_blank', 'noopener'); }}
                            tabIndex={ds.run && ds.run.url ? 0 : -1}
                            aria-label={tooltip.replace(/\n/g, ' ')}
                          >
                            {/* Show date below cube for clarity on mobile */}
                            <span style={{ display: 'none' }}>{ds.date}</span>
                            {isStatusChange && (
                              <span className="histogram-status-change-badge" title={`Status changed (${changeType}) from previous day`}>
                                {statusChangeIcons[changeType!]}
                              </span>
                            )}
                          </span>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default WorkflowHistogram;
