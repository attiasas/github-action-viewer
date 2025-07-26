
import './WorkflowHistogram.css';
import React from 'react';
import type { WorkflowStatus } from '../api/Repositories';
import { getNormalizedStatus } from './StatusUtils';
import { getWorkflowAggregatedInfo } from './indicationsUtils';

const STATUS_COLORS: Record<string, string> = {
  success: '#4caf50',
  failure: '#f44336',
  cancelled: '#a17fc3', // distinct purple for cancelled
  running: '#2196f3',
  pending: '#ff9800',
  error: '#e91e63',
  unknown: '#6ec6ff', // light blue for unknown
  no_runs: '#bdbdbd', // light gray for no_runs
};


export interface WorkflowHistogramProps {
  runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>;
}

const WorkflowHistogram: React.FC<WorkflowHistogramProps> = ({ runs }) => {
  // Helper to format run time from start and end timestamps
  function formatRunTime(totalSeconds: number): string {
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
    let prevStatus = 'no_runs'
    for (let i = 0; i < prev.length; i++) {
      // Get the normalized status of the previous run
      prevStatus = getNormalizedStatus(prev[i].status, prev[i].conclusion);
      if (prevStatus !== 'no_runs') break; // Use the first non-'no_runs' status
    }
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
          const hasNoRuns = !workflow || workflow.length === 0 || (workflow.length === 1 && getNormalizedStatus(workflow[0].status, workflow[0].conclusion) === 'no_runs');
          if (hasNoRuns) {
            return (
              <div className="histogram-entry histogram-entry-empty" key={branch + ':' + workflowKey} style={{ justifyContent: 'center', alignItems: 'center', minHeight: 100, background: 'var(--bg-tertiary, #f8f8f8)', borderRadius: 14, border: '1.5px solid var(--border-secondary, #e0e0e0)', boxShadow: 'var(--shadow-card, 0 2px 8px rgba(0,0,0,0.07))', marginBottom: '0.5rem', textAlign: 'center', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <span className="histogram-workflow" style={{ fontWeight: 600, fontSize: '1.07em', marginBottom: 4 }}>
                    {wfName && typeof wfName === 'string' && wfName.trim().length > 0 ? wfName : workflowKey}
                  </span>
                  <span className="histogram-branch" style={{ fontSize: '0.93em', color: 'var(--text-secondary, #666)', marginBottom: 8 }}>{branch}</span>
                  <span style={{ color: 'var(--text-secondary, #888)', fontSize: '1.05em', padding: '8px 0', fontWeight: 500, letterSpacing: '0.01em', display: 'flex', alignItems: 'center', gap: '0.5em' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4 }} aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#bdbdbd" strokeWidth="2" fill="#f8f8f8" /><path d="M8 12h8M12 8v8" stroke="#bdbdbd" strokeWidth="2" strokeLinecap="round" /></svg>
                    No workflow runs found
                  </span>
                  <span style={{ color: 'var(--text-secondary, #aaa)', fontSize: '0.97em', marginTop: 2 }}>Start a workflow run to see analytics here.</span>
                </div>
              </div>
            );
          }
          // ...existing code...
          const statusChangeIndicators = getStatusChangeIndicators(workflow);
          const statusChangeIdxs = Object.keys(statusChangeIndicators).map(Number);
          const firstStatusChangeIdx = statusChangeIdxs.length > 0 ? Math.min(...statusChangeIdxs) : -1;
          const dailyStatus = getDailyStatus(workflow);
          return (
            <div className="histogram-entry" key={branch + ':' + workflowKey}>
              <div className="histogram-label">
                <span className="histogram-workflow" style={{ fontWeight: 600, fontSize: '1.07em' }}>
                  {wfName && typeof wfName === 'string' && wfName.trim().length > 0 ? wfName : workflowKey}
                </span>
                <span className="histogram-branch" style={{ fontSize: '0.93em', color: 'var(--text-secondary, #666)' }}>{branch}</span>
                {/* Aggregated info rows (only if there are runs) */}
                {(() => {
                  if (!workflow || workflow.length === 0 || (workflow.length === 1 && getNormalizedStatus(workflow[0].status, workflow[0].conclusion) === 'no_runs')) return null;
                  const info = getWorkflowAggregatedInfo(workflow);
                  const avgRunTimeStr = (() => {
                    if (info.avgRunTime === null) return 'N/A';
                    const avgRunTime = formatRunTime(Math.round(info.avgRunTime / 1000));
                    return avgRunTime || 'N/A';
                  })();
                  const successRateStr = info.successRate !== null ? `${(info.successRate * 100).toFixed(1)}%` : 'N/A';
                  return (
                    <div className="histogram-aggregated-info">
                      <div className="aggregated-info-row">
                        <span className="aggregated-info-label">Total runs</span>
                        <span className="aggregated-info-value">{info.totalRuns}</span>
                      </div>
                      <div className="aggregated-info-row">
                        <span className="aggregated-info-label">Avg run time</span>
                        <span className="aggregated-info-value">{avgRunTimeStr}</span>
                      </div>
                      <div className="aggregated-info-row">
                        <span className="aggregated-info-label">Success rate</span>
                        <span className="aggregated-info-value">{successRateStr}</span>
                      </div>
                    </div>
                  );
                })()}
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
                      let runTimeStr = '';
                      if (run.runStartedAt && run.updatedAt) {
                        const start = new Date(run.runStartedAt).getTime();
                        const end = new Date(run.updatedAt).getTime();
                        if (!isNaN(start) && !isNaN(end) && end > start) {
                          runTimeStr = formatRunTime(Math.round((end - start) / 1000));
                        }
                      }
                      const tooltip = `Run #${run.runNumber || run.runId || ''}\nAttempt: ${run.runAttempt || -1}\nStatus: ${run.conclusion || run.status}\nEvent: ${run.event || ''}\nCommit: ${shortCommit(run.commit)}\nCreated at: ${formatDate(run.createdAt)}\nStarted at: ${formatDate(run.runStartedAt)}\nUpdated at: ${formatDate(run.updatedAt)}${runTimeStr ? `\nRun time: ${runTimeStr}` : ''}${run.url ? '\n\nClick to view run' : ''}`;
                      const changeType = statusChangeIndicators[idx];
                      const isStatusChange = !!changeType;
                      const pulse = isStatusChange && idx === firstStatusChangeIdx;
                      return (
                        <span
                          key={run.runId || idx}
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
                          ? `Date: ${ds.date}\nStatus: ${ds.run.conclusion || ds.run.status}\nRun #${ds.run.runNumber || ds.run.runId || ''}\nEvent: ${ds.run.event || ''}\nCommit: ${shortCommit(ds.run.commit)}${ds.run.url ? '\n\nClick to view run' : ''}`
                          : `Date: ${ds.date}\nNo run`;
                        const prev = idx < dailyStatus.length - 1 ? dailyStatus.slice(idx + 1).map(d => d.run).filter(Boolean) as WorkflowStatus[] : [];
                        const changeType = ds.run ? getStatusIndicator(ds.run, prev) : undefined;
                        const isStatusChange = !!changeType;
                        const pulse = isStatusChange && idx === firstStatusChangeIdx;
                        return (
                          <span
                            key={ds.date}
                            className={`histogram-cube${isStatusChange ? (pulse ? ' histogram-cube-status-change' : ' histogram-cube-status-change-static') : ''}`}
                            title={(isStatusChange ? `Status changed (${changeType}) from previous day\n\n` : '') + tooltip}
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
