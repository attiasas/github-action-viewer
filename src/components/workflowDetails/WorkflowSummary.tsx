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

  const successRate = stats.totalRuns > 0 ? (stats.success / stats.totalRuns * 100).toFixed(1) : '0.0';
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
      <div className="summary-left">
        <div className={scoreClass} style={{ color: scoreColor }}>
          <span style={{ fontSize: '2.2em', fontWeight: 700 }}>
            {score === null ? <span className="repo-score-unknown-text">Unknown</span> : score}
          </span>
          <span style={{ fontSize: '1em', fontWeight: 500, marginLeft: 8 }}>Stability Score</span>
        </div>
        <div className="repo-stats">
          <div><strong>Success Rate:</strong> <span style={{ color: 'var(--accent-success, #28a745)' }}>{successRate}%</span></div>
          <div><strong>Total Runs:</strong> {stats.totalRuns}</div>
          <div><strong>Tracked:</strong> {stats.trackedWorkflows}</div>
          <div><strong>Latest Run At:</strong> {latestRunDisplay}</div>
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