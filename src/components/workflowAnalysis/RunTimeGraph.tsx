import React from 'react';
import './RunTimeGraph.css';
import type { WorkflowStatus } from '../../api/Repositories';
import { getNormalizedStatus } from '../StatusUtils';
import { calculateRunTime, formatRunTime } from '../indicationsUtils';

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

interface RunTimeGraphProps {
  workflow: WorkflowStatus[];
}


const FILTERS = [
  { value: 'successFirst', label: 'Successful First Attempts' },
  { value: 'successAll', label: 'All Successes' },
  { value: 'all', label: 'All Runs' },
];

const RunTimeGraph: React.FC<RunTimeGraphProps> = ({ workflow }) => {
  const [runTimeFilter, setRunTimeFilter] = React.useState<'successFirst' | 'successAll' | 'all'>('successFirst');

  // Filtering logic
  let filteredRuns: WorkflowStatus[] = [];
  if (runTimeFilter === 'successFirst') {
    filteredRuns = workflow.filter(run => {
      const isSuccess = getNormalizedStatus(run.status, run.conclusion) === 'success';
      return isSuccess && (run.runAttempt === 1 || run.runAttempt === undefined);
    });
  } else if (runTimeFilter === 'successAll') {
    filteredRuns = workflow.filter(run => getNormalizedStatus(run.status, run.conclusion) === 'success');
  } else {
    filteredRuns = workflow;
  }

  // Run times (in seconds)
  const runTimes = filteredRuns.map(run => {
    if (run.runStartedAt && run.updatedAt) {
      const ms = calculateRunTime(new Date(run.runStartedAt).getTime(), new Date(run.updatedAt).getTime());
      return ms ? Math.round(ms / 1000) : 0;
    }
    return 0;
  });
  const maxRunTime = Math.max(...runTimes, 0);
  const minRunTime = Math.min(...runTimes.filter(t => t > 0), maxRunTime);
  const avgRunTime = runTimes.length > 0 ? Math.round(runTimes.reduce((a, b) => a + b, 0) / runTimes.length) : 0;
  const GRAPH_HEIGHT = 120; // px, matches .run-time-graph-bars height in CSS
  const YAXIS_WIDTH = 60;

  // Show only min, avg, max ticks, but remove avg if too close to min or max
  let yAxisTicks: number[] = [];
  if (maxRunTime > 0) {
    yAxisTicks = [maxRunTime];
    // Only add avg if not too close to min or max
    const minDiff = 0.3 * maxRunTime; // 10% of maxRunTime
    if (
      avgRunTime > 0 &&
      avgRunTime !== maxRunTime &&
      avgRunTime !== minRunTime &&
      Math.abs(avgRunTime - maxRunTime) > minDiff &&
      Math.abs(avgRunTime - minRunTime) > minDiff
    ) {
      yAxisTicks.push(avgRunTime);
    }
    if (minRunTime > 0 && minRunTime !== maxRunTime) yAxisTicks.push(minRunTime);
    yAxisTicks = Array.from(new Set(yAxisTicks)).sort((a, b) => b - a);
  }

  // Place y-axis ticks proportionally
  const getTickPosition = (tick: number) => {
    if (maxRunTime === 0) return 0;
    return ((maxRunTime - tick) / maxRunTime) * GRAPH_HEIGHT;
  };

  // Calculate bar height so it starts at the bottom
  const getBarHeight = (rt: number) => {
    if (maxRunTime === 0) return 8;
    return Math.max(8, Math.round((rt / maxRunTime) * GRAPH_HEIGHT));
  };

  return (
    <div className="run-time-graph-container">
      <div className="run-time-graph-header">
        <span className="run-time-graph-title">Run Time Graph</span>
        <div className="run-time-graph-filter-group">
          {FILTERS.map(f => (
            <button
              key={f.value}
              className={`run-time-graph-filter-btn${runTimeFilter === f.value ? ' active' : ''}`}
              onClick={() => setRunTimeFilter(f.value as 'successFirst' | 'successAll' | 'all')}
              type="button"
              aria-pressed={runTimeFilter === f.value}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="run-time-graph-yaxis" style={{ height: GRAPH_HEIGHT, position: 'absolute', left: 0, top: 54, width: YAXIS_WIDTH }}>
        {yAxisTicks.map((tick) => (
          <span
            key={tick}
            className="run-time-graph-yaxis-tick"
            style={{ position: 'absolute', left: 0, width: '100%', top: getTickPosition(tick) }}
          >
            {formatRunTime(tick)}
          </span>
        ))}
      </div>
      <div className="run-time-graph-bars" style={{ height: GRAPH_HEIGHT, marginLeft: YAXIS_WIDTH }}>
        {filteredRuns.map((run, idx) => {
          const rt = runTimes[idx];
          if (rt === 0) return null;
          const barHeight = getBarHeight(rt);
          const tooltip = `Run #${run.runNumber || run.runId || ''}\n${run.runStartedAt ? 'Started: ' + run.runStartedAt : ''}\n${run.updatedAt ? 'Ended: ' + run.updatedAt : ''}\nRun time: ${formatRunTime(rt)}`;
          return (
            <div
              key={run.runId || idx}
              title={tooltip}
              className="run-time-graph-bar"
              style={{
                height: barHeight,
                alignSelf: 'flex-end',
                background: runTimeFilter === 'all' ? STATUS_COLORS[getNormalizedStatus(run.status, run.conclusion)] || '#bdbdbd' : STATUS_COLORS['success'],
                cursor: run.url ? 'pointer' : 'default',
              }}
              onClick={() => { if (run.url) window.open(run.url, '_blank', 'noopener'); }}
              tabIndex={run.url ? 0 : -1}
              aria-label={tooltip.replace(/\n/g, ' ')}
            >
              <span className="run-time-label">{formatRunTime(rt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RunTimeGraph;
