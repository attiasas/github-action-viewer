import React from 'react';
import './RunTimeGraph.css';
import type { WorkflowStatus } from '../../api/Repositories';
import { getNormalizedStatus } from '../StatusUtils';

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


interface RunTimeGraphProps {
  workflow: WorkflowStatus[];
}

const RunTimeGraph: React.FC<RunTimeGraphProps> = ({ workflow }) => {
  // Filter state
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

  // Run times
  function getRunTimes(wf: WorkflowStatus[]): number[] {
    return wf.map(run => {
      if (run.runStartedAt && run.updatedAt) {
        return Math.round((new Date(run.updatedAt).getTime() - new Date(run.runStartedAt).getTime()) / 1000);
      }
      return 0;
    });
  }
  const runTimes = getRunTimes(filteredRuns);
  const maxRunTime = Math.max(...runTimes, 0);
  const minRunTime = Math.min(...runTimes.filter(t => t > 0), maxRunTime);
  let yAxisTicks = [minRunTime, Math.round((minRunTime + maxRunTime) / 2), maxRunTime].filter(v => v > 0);
  yAxisTicks = Array.from(new Set(yAxisTicks));

  // UI: filter selector
  return (
    <div className="run-time-graph-container" style={{ minHeight: Math.max(80, yAxisTicks.length * 28), position: 'relative', overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <label htmlFor="runTimeFilter" style={{ fontSize: '0.95em', color: 'var(--text-secondary, #888)', marginRight: 8 }}>Run Time Filter:</label>
        <select
          id="runTimeFilter"
          value={runTimeFilter}
          onChange={e => setRunTimeFilter(e.target.value as 'successFirst' | 'successAll' | 'all')}
          style={{ fontSize: '0.95em', padding: '2px 8px', borderRadius: 4, border: '1px solid #e0e0e0', background: 'var(--bg-tertiary, #f8f8f8)', color: 'var(--text-secondary, #666)' }}
        >
          <option value="successFirst">Successful First Attempts</option>
          <option value="successAll">All Successes</option>
          <option value="all">All Runs</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.18em', height: Math.max(60, yAxisTicks.length * 24), position: 'relative', width: '100%' }}>
        {/* Y axis ticks */}
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 2 }}>
          {yAxisTicks.map((tick, i) => (
            <span key={tick} style={{ fontSize: '0.85em', color: 'var(--text-secondary, #888)', textAlign: 'right', minHeight: 18, marginBottom: i === yAxisTicks.length - 1 ? 0 : 8 }}>{formatRunTime(tick)}</span>
          ))}
        </div>
        {/* Bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.18em', height: '100%', marginLeft: 36, width: 'calc(100% - 36px)' }}>
          {filteredRuns.map((run, idx) => {
            const rt = runTimes[idx];
            if (rt === 0) return null;
            const barHeight = maxRunTime > 0 ? Math.max(8, Math.round((rt / maxRunTime) * (Math.max(60, yAxisTicks.length * 24) - 8))) : 8;
            const tooltip = `Run #${run.runNumber || run.runId || ''}\n${run.runStartedAt ? 'Started: ' + run.runStartedAt : ''}\n${run.updatedAt ? 'Ended: ' + run.updatedAt : ''}\nRun time: ${formatRunTime(rt)}`;
            return (
              <div
                key={run.runId || idx}
                title={tooltip}
                className="run-time-graph-bar"
                style={{
                  width: 16,
                  minWidth: 16,
                  maxWidth: 16,
                  height: barHeight,
                  background: runTimeFilter === 'all' ? STATUS_COLORS[getNormalizedStatus(run.status, run.conclusion)] || '#bdbdbd' : STATUS_COLORS['success'],
                  borderRadius: 4,
                  marginRight: 2,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
                  border: '1.5px solid var(--border-secondary, #e0e0e0)',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  cursor: run.url ? 'pointer' : 'default',
                  position: 'relative',
                  transition: 'height 0.18s, box-shadow 0.18s',
                }}
                onClick={() => { if (run.url) window.open(run.url, '_blank', 'noopener'); }}
                tabIndex={run.url ? 0 : -1}
                aria-label={tooltip.replace(/\n/g, ' ')}
              >
                <span style={{ position: 'absolute', bottom: barHeight + 4, left: '50%', transform: 'translateX(-50%)', fontSize: '0.82em', color: 'var(--text-secondary, #888)', whiteSpace: 'nowrap', pointerEvents: 'none', opacity: 0, transition: 'opacity 0.18s', zIndex: 3 }} className="run-time-label">{formatRunTime(rt)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: '0.85em', color: 'var(--text-secondary, #aaa)', marginTop: 4 }}>Y axis: Run time (duration). Bar color = {runTimeFilter === 'all' ? 'run status' : 'success'}. Hover for details. Click bar to open run.</div>
    </div>
  );
};

export default RunTimeGraph;
