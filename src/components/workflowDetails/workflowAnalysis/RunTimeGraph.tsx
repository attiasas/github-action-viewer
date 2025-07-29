import React from 'react';
import './RunTimeGraph.css';
import type { WorkflowStatus } from '../../../api/Repositories';
import { getNormalizedStatus } from '../../utils/StatusUtils';
import { calculateRunTime, formatRunTime } from '../../utils/indicationsUtils';

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
  const [ignoreOutliers, setIgnoreOutliers] = React.useState<boolean>(false);

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

  // Outlier filtering logic
  let runTimes = filteredRuns.map(run => {
    if (run.runStartedAt && run.updatedAt) {
      const ms = calculateRunTime(new Date(run.runStartedAt).getTime(), new Date(run.updatedAt).getTime());
      return ms ? Math.round(ms / 1000) : 0;
    }
    return 0;
  });

  let filteredRunsFinal = filteredRuns;
  if (ignoreOutliers && runTimes.length > 4) {
    // Use IQR method to filter outliers
    const sorted = [...runTimes].filter(rt => rt > 0).sort((a, b) => a - b);
    const q1 = sorted[Math.floor((sorted.length / 4))];
    const q3 = sorted[Math.floor((sorted.length * 3) / 4)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    filteredRunsFinal = filteredRuns.filter((_, idx) => {
      const rt = runTimes[idx];
      return rt >= lower && rt <= upper;
    });
    runTimes = filteredRunsFinal.map(run => {
      if (run.runStartedAt && run.updatedAt) {
        const ms = calculateRunTime(new Date(run.runStartedAt).getTime(), new Date(run.updatedAt).getTime());
        return ms ? Math.round(ms / 1000) : 0;
      }
      return 0;
    });
  }

  // Run times (in seconds)
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

  // Place y-axis ticks so their baseline matches the bottom of the corresponding bar
  const getTickPosition = (tick: number) => {
    if (maxRunTime === 0) return 0;
    return ((maxRunTime - tick) / maxRunTime) * GRAPH_HEIGHT;
  };

  // Calculate bar height so it starts at the bottom
  const getBarHeight = (rt: number) => {
    if (maxRunTime === 0) return 8;
    return Math.max(8, Math.round((rt / maxRunTime) * GRAPH_HEIGHT));
  };

  const hasRuns = filteredRunsFinal.length > 0 && runTimes.some(rt => rt > 0);

  return (
    <div className="run-time-graph-container" style={{ position: 'relative', overflowX: 'auto' }}>
      <div className="run-time-graph-header">
        <span className="run-time-graph-title">Run Time Graph</span>
      </div>
      <div className="run-time-graph-filter-group" style={{ marginBottom: 12 }}>
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
        <button
          className={`run-time-graph-filter-btn${ignoreOutliers ? ' active' : ''}`}
          style={{ marginLeft: 10 }}
          onClick={() => setIgnoreOutliers(v => !v)}
          type="button"
          aria-pressed={ignoreOutliers}
        >
          {ignoreOutliers ? 'Ignoring Outliers' : 'Include Outliers'}
        </button>
      </div>
      {hasRuns ? (
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', width: '100%' }}>
          <div
            className="run-time-graph-yaxis"
            style={{
              height: GRAPH_HEIGHT,
              width: YAXIS_WIDTH,
              position: 'sticky',
              left: 0,
              zIndex: 10,
              background: 'var(--bg-card, #fff)',
              borderRight: '1px solid var(--border-secondary, #e0e0e0)',
              marginRight: 12,
              boxShadow: '2px 0 8px -4px rgba(0,0,0,0.07)',
              minWidth: YAXIS_WIDTH,
              maxWidth: YAXIS_WIDTH,
              display: 'block',
            }}
          >
            {yAxisTicks.map((tick) => (
              <span
                key={tick}
                className="run-time-graph-yaxis-tick"
                style={{
                  position: 'absolute',
                  left: 0,
                  width: '100%',
                  top: getTickPosition(tick),
                  background: 'var(--bg-card, #fff)',
                  paddingRight: 6,
                  paddingLeft: 2,
                  borderRadius: 4,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                {formatRunTime(tick)}
              </span>
            ))}
          </div>
          <div
            className="run-time-graph-bars"
            style={{
              height: GRAPH_HEIGHT,
              minWidth: 400,
              marginLeft: 0,
              paddingLeft: 18,
              width: `calc(100% - ${YAXIS_WIDTH}px)`,
              display: 'flex',
              alignItems: 'flex-end',
              gap: '0.18em',
              position: 'relative',
            }}
          >
            {filteredRunsFinal.map((run, idx) => {
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
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: GRAPH_HEIGHT + 40,
          minHeight: 180, width: '100%', padding: '32px 0', color: 'var(--text-secondary, #888)',
        }}>
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 12, opacity: 0.7 }}>
            <rect x="8" y="44" width="8" height="12" rx="2" fill="#e0e0e0"/>
            <rect x="20" y="36" width="8" height="20" rx="2" fill="#e0e0e0"/>
            <rect x="32" y="28" width="8" height="28" rx="2" fill="#e0e0e0"/>
            <rect x="44" y="52" width="8" height="4" rx="2" fill="#e0e0e0"/>
            <rect x="56" y="40" width="8" height="16" rx="2" fill="#e0e0e0"/>
            <rect x="8" y="8" width="56" height="4" rx="2" fill="#bdbdbd"/>
          </svg>
          <div style={{ fontSize: '1.08em', fontWeight: 500, marginBottom: 4 }}>No runs to display</div>
          <div style={{ fontSize: '0.97em', color: 'var(--text-secondary, #aaa)', textAlign: 'center', maxWidth: 320 }}>
            There are no workflow runs matching the selected filter.<br />Try changing the filter or check back later.
          </div>
        </div>
      )}
    </div>
  );
};

export default RunTimeGraph;
