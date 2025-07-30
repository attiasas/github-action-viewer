import React from 'react';
import type { WorkflowStatus } from '../../api/Repositories';
import { getNormalizedStatus, calculateStabilityScore } from '../utils/StatusUtils';
import './WorkflowSummary.css';
import { formatRelativeTime } from '../utils/indicationsUtils';

export interface WorkflowSummaryProps {
  runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>;
}

// Helper to aggregate all runs
function aggregateRuns(runs: WorkflowSummaryProps['runs']) {
  let totalRuns = 0;
  let success = 0;
  let failure = 0;
  let cancelled = 0;
  let running = 0;
  let pending = 0;
  let error = 0;
  let unknown = 0;
  let noRuns = 0;
  let trackedWorkflows = 0;
  runs.forEach(({ workflow }) => {
    trackedWorkflows++;
    workflow.forEach(run => {
      const status = getNormalizedStatus(run.status, run.conclusion);
      if (status === 'success') success++;
      else if (status === 'failure') failure++;
      else if (status === 'cancelled') cancelled++;
      else if (status === 'running') running++;
      else if (status === 'pending') pending++;
      else if (status === 'error') error++;
      else if (status === 'unknown') unknown++;
      else if (status === 'no_runs') noRuns++;

      if (status !== 'no_runs') totalRuns++;
    });
  });
  return { totalRuns, success, failure, cancelled, running, pending, error, unknown, noRuns, trackedWorkflows };
}


// Pie chart colors for statuses (match WorkflowAnalysis)
const statusColors: Record<string, string> = {
  success: '#4caf50',
  failure: '#f44336',
  cancelled: '#a17fc3', // distinct purple for cancelled
  running: '#2196f3',
  pending: '#ff9800',
  error: '#e91e63',
  unknown: '#6ec6ff', // light blue for unknown
  noRuns: '#bdbdbd', // light gray for no_runs
};

// Pie chart SVG generator
function StatusPieChart({ stats }: { stats: ReturnType<typeof aggregateRuns> }) {
  const data = [
    { label: 'Success', value: stats.success, color: statusColors.success },
    { label: 'Failure', value: stats.failure, color: statusColors.failure },
    { label: 'Cancelled', value: stats.cancelled, color: statusColors.cancelled },
    { label: 'Running', value: stats.running, color: statusColors.running },
    { label: 'Pending', value: stats.pending, color: statusColors.pending },
    { label: 'Error', value: stats.error, color: statusColors.error },
    { label: 'Unknown', value: stats.unknown, color: statusColors.unknown },
    { label: 'No Runs', value: stats.noRuns, color: statusColors.noRuns },
  ].filter(d => d.value > 0);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let cumulative = 0;
  const radius = 80;
  const center = 95;
  const strokeWidth = 36;
  return (
    <div className="status-pie-chart-wrapper status-pie-chart-row">
      <svg width={190} height={190} viewBox="0 0 190 190" className="status-pie-chart">
        {data.length === 1 ? (
          // Only one status: draw a full circle in the color
          <circle cx={center} cy={center} r={radius} fill={data[0].color} />
        ) : (
          data.map((d, i) => {
            const startAngle = (cumulative / total) * 2 * Math.PI;
            const endAngle = ((cumulative + d.value) / total) * 2 * Math.PI;
            const x1 = center + radius * Math.sin(startAngle);
            const y1 = center - radius * Math.cos(startAngle);
            const x2 = center + radius * Math.sin(endAngle);
            const y2 = center - radius * Math.cos(endAngle);
            const largeArc = d.value / total > 0.5 ? 1 : 0;
            const path = `M${center},${center} L${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`;
            cumulative += d.value;
            return <path key={i} d={path} fill={d.color} stroke="#fff" strokeWidth={1} />;
          })
        )}
        <circle cx={center} cy={center} r={radius - strokeWidth / 2} fill="var(--bg-card, #fff)" />
      </svg>
      <div className="status-pie-legend">
        {data.map((d, i) => (
          <div key={i} className="status-pie-legend-item">
            <span className="status-pie-legend-color" style={{ background: d.color }} />
            <span className="status-pie-legend-label">{d.label}</span>
            <span className="status-pie-legend-value">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const WorkflowSummary: React.FC<WorkflowSummaryProps> = ({ runs }) => {
  // Get indications
  const stats = aggregateRuns(runs);

  const score = calculateStabilityScore(runs);
  let scoreColor = 'var(--accent-success, #28a745)';
  let scoreClass = 'repo-score-label';
  if (score === null) {
    scoreColor = 'var(--accent-unknown, #888)';
    scoreClass += ' repo-score-unknown';
  } else if (score < 60) {
    scoreColor = 'var(--accent-danger, #dc3545)';
    scoreClass += ' repo-score-danger';
  } else if (score < 80) {
    scoreColor = 'var(--accent-warning, #ffc107)';
    scoreClass += ' repo-score-warning';
  } else {
    scoreClass += ' repo-score-success';
  }

  const successRateNum = stats.totalRuns > 0 ? (stats.success / stats.totalRuns * 100) : 0;
  const successRate = successRateNum.toFixed(1);
  let successRateColor = 'var(--accent-success, #28a745)';
  if (stats.totalRuns === 0) successRateColor = 'var(--accent-unknown, #888)';
  else if (successRateNum < 60) successRateColor = 'var(--accent-danger, #dc3545)';
  else if (successRateNum < 80) successRateColor = 'var(--accent-warning, #ffc107)';
  let latestRunAt: string | null = null;
  runs.forEach(({ workflow }) => {
    workflow.forEach(run => {
      if (run.updatedAt) {
        if (!latestRunAt || new Date(run.updatedAt) > new Date(latestRunAt)) {
          latestRunAt = run.updatedAt;
        }
      }
    });
  });
  const latestRunDisplay = latestRunAt ? formatRelativeTime(latestRunAt) : 'N/A';

  return (
    <div className="workflow-summary-container">
      <div className="summary-left" title="Stability Score is a weighted metric (0-100) combining workflow health and recent run success rates. Recent runs count more. Penalties are applied for errors, warnings, and failed runs.">
        <div className={scoreClass} style={{ color: scoreColor }}>
          <span style={{ fontSize: '2.5em', fontWeight: 700, marginLeft: 10 }}>
            {score === null ? <span className=" -score-unknown-text">Unknown</span> : score}
          </span>
          <span style={{ fontSize: '1em', fontWeight: 500, marginLeft: 8 }}>Stability Score</span>
        </div>
        <div className="repo-stats">
          <div className="repo-stats-row" title="Percentage of successful runs out of all runs (weighted by recency)">
            <span className="repo-stats-icon" style={{ color: 'var(--accent-success, #28a745)' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="10" r="8" /><path d="M7 10.5l2 2 4-4" stroke="#fff" strokeWidth="2" fill="none"/></svg>
            </span>
            <span className="repo-stats-label">Success Rate</span>
            <span className="repo-stats-value" style={{ color: successRateColor }}>{successRate}%</span>
          </div>
          <div className="repo-stats-row" title="Total number of workflow runs (excluding no_runs)">
            <span className="repo-stats-icon" style={{ color: 'var(--accent-info, #2196f3)' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><rect x="4" y="4" width="12" height="12" rx="3"/></svg>
            </span>
            <span className="repo-stats-label">Total Runs</span>
            <span className="repo-stats-value">{stats.totalRuns}</span>
          </div>
          <div className="repo-stats-row" title="Number of tracked workflows in this repository">
            <span className="repo-stats-icon" style={{ color: 'var(--accent-primary, #333)' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M5 6h10v2H5zM5 10h10v2H5zM5 14h10v2H5z"/></svg>
            </span>
            <span className="repo-stats-label">Tracked Jobs</span>
            <span className="repo-stats-value">{stats.trackedWorkflows}</span>
          </div>
          <div className="repo-stats-row" title="Time of the most recent workflow run (across all tracked workflows)">
            <span className="repo-stats-icon" style={{ color: 'var(--accent-warning, #ffc107)' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2v4M10 14v4M4.22 4.22l2.83 2.83M14.95 14.95l2.83 2.83M2 10h4M14 10h4" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
            </span>
            <span className="repo-stats-label">Latest Run</span>
            <span className="repo-stats-value">{latestRunDisplay}</span>
          </div>
        </div>
      </div>
      <div className="summary-right">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <StatusPieChart stats={stats} />
        </div>
      </div>
    </div>
  );
};

export default WorkflowSummary;