
import './WorkflowAnalysis.css';
import React from 'react';
import type { WorkflowStatus } from '../api/Repositories';
import { getNormalizedStatus, getStatusChangeIndicators } from './StatusUtils';
import { getWorkflowAggregatedInfo, calculateRunTime } from './indicationsUtils';
import RunTimeGraph from './workflowAnalysis/RunTimeGraph';
import DailyStatusHistogram from './workflowAnalysis/DailyStatusHistogram';
import RecentRunsHistogram from './workflowAnalysis/RecentRunsHistogram';

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


export interface WorkflowAnalysisProps {
  runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>;
}

const WorkflowAnalysis: React.FC<WorkflowAnalysisProps> = ({ runs }) => {
  // Visualization selector state (per entry)
  const [selectedVizMap, setSelectedVizMap] = React.useState<Record<string, 'recent' | 'daily' | 'runtime'>>({});
  const handleVizChange = (key: string, value: 'recent' | 'daily' | 'runtime') => {
    setSelectedVizMap(prev => ({ ...prev, [key]: value }));
  };
  // runTimeFilter state moved to RunTimeGraph
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

  // Helper to get run times in seconds for a workflow
  // function getRunTimes(workflow: WorkflowStatus[]): number[] {
  //   return workflow.map(run => {
  //     if (run.runStartedAt && run.updatedAt) {
  //       return Math.round((calculateRunTime(new Date(run.runStartedAt).getTime(), new Date(run.updatedAt).getTime()) || 0) / 1000);
  //     }
  //     return 0;
  //   });
  // }

  // Helper to get max run time for scaling
  // function getMaxRunTime(workflow: WorkflowStatus[]): number {
  //   const times = getRunTimes(workflow);
  //   return Math.max(...times, 0);
  // }
  // Status change icons by type
  const statusChangeIcons: Record<string, React.ReactNode> = {
    bad: <span className="histogram-status-change-indicator" style={{ color: 'var(--accent-danger, #dc3545)' }} title="Status worsened" aria-label="Status worsened">❌</span>,
    good: <span className="histogram-status-change-indicator" style={{ color: 'var(--accent-success, #28a745)' }} title="Status improved" aria-label="Status improved">✅</span>,
    info: <span className="histogram-status-change-indicator" style={{ color: 'var(--accent-warning, #ffc107)' }} title="Status changed" aria-label="Status changed">&#x1F504;</span>,
  };

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

  // ...existing code...
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
          // RunTimeGraph now manages its own filter state and axis logic
          // Visualization options (easy to extend)
          const vizOptions = [
            { key: 'recent', label: 'Recent Runs Histogram' },
            { key: 'daily', label: 'Daily Status Histogram' },
            { key: 'runtime', label: 'Run Time Graph' },
          ];
          const entryKey = branch + ':' + workflowKey;
          const selectedViz = selectedVizMap[entryKey] || 'recent';
          return (
            <div className="histogram-entry" key={entryKey} style={{ display: 'flex', alignItems: 'stretch', gap: '1.5rem', overflow: 'visible', maxWidth: '100%' }}>
              {/* Left: label, branch, aggregated info */}
              <div className="histogram-label" style={{ flex: '0 0 auto', minWidth: 140, maxWidth: 220, width: 'max-content', display: 'flex', flexDirection: 'column', gap: '0.2em', fontSize: '1rem', fontWeight: 500, wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
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
              {/* Right: visualization selector and display */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1em', marginBottom: 8, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
                  <label htmlFor={`viz-select-${branch}-${workflowKey}`} style={{ fontSize: '0.97em', color: 'var(--text-secondary, #888)', fontWeight: 500 }}>Show:</label>
                  <select
                    id={`viz-select-${branch}-${workflowKey}`}
                    value={selectedViz}
                    onChange={e => handleVizChange(entryKey, e.target.value as 'recent' | 'daily' | 'runtime')}
                    style={{ fontSize: '0.97em', padding: '2px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: 'var(--bg-tertiary, #f8f8f8)', color: 'var(--text-secondary, #666)', fontWeight: 500 }}
                  >
                    {vizOptions.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ width: '100%', minHeight: 60, maxHeight: 360, overflowY: 'auto', overflowX: 'visible', paddingRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                  {selectedViz === 'recent' && (
                    <RecentRunsHistogram
                      workflow={workflow}
                      statusChangeIndicators={statusChangeIndicators}
                      firstStatusChangeIdx={firstStatusChangeIdx}
                      shortCommit={shortCommit}
                      formatDate={formatDate}
                      calculateRunTime={calculateRunTime}
                      formatRunTime={formatRunTime}
                      statusChangeIcons={statusChangeIcons}
                    />
                  )}
                  {selectedViz === 'daily' && (
                    <DailyStatusHistogram
                      workflow={workflow}
                      shortCommit={shortCommit}
                    />
                  )}
                  {selectedViz === 'runtime' && workflow.length > 0 && (
                    <RunTimeGraph workflow={workflow} />
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

export default WorkflowAnalysis;
