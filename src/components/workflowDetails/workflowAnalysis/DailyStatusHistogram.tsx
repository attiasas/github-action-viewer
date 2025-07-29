import React from 'react';
import './DailyStatusHistogram.css';
import type { WorkflowStatus } from '../../../api/Repositories';
import { shortCommit } from '../../utils/indicationsUtils';
import { getNormalizedStatus, getDailyStatus, getStatusIndicator } from '../../utils/StatusUtils';

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

interface DailyStatusHistogramProps {
  workflow: WorkflowStatus[];
}

const DailyStatusHistogram: React.FC<DailyStatusHistogramProps> = ({ workflow }) => {

  const dailyStatus: Array<{ date: string; run: WorkflowStatus | null }> = getDailyStatus(workflow);
  // Find the first (latest) status change index in dailyStatus
  const statusChangeIdxs = dailyStatus
    .map((ds: { date: string; run: WorkflowStatus | null }, idx: number) => {
      const prev: WorkflowStatus[] = idx < dailyStatus.length - 1 ? dailyStatus.slice(idx + 1).map((d: { date: string; run: WorkflowStatus | null }) => d.run).filter(Boolean) as WorkflowStatus[] : [];
      const changeType = ds.run ? getStatusIndicator(ds.run, prev) : undefined;
      return changeType ? idx : null;
    })
    .filter((idx: number | null) => idx !== null) as number[];
  const firstStatusChangeIdx = statusChangeIdxs.length > 0 ? Math.min(...statusChangeIdxs) : -1;
  // Helper to get relative label (today, -1, -2, ...)
  const getRelativeLabel = (idx: number) => {
    return idx === 0 ? '' : `-${idx}`;
  };

  return (
    <div className="daily-status-histogram">
      <div className="histogram-cubes" data-count={dailyStatus.length}>
        {dailyStatus.every((ds: { date: string; run: WorkflowStatus | null }) => !ds.run) ? (
          <span style={{ color: 'var(--text-secondary, #888)', fontSize: '0.97em', padding: '2px 0' }}>No runs yet</span>
        ) : (
          dailyStatus.map((ds: { date: string; run: WorkflowStatus | null }, idx: number) => {
            const normalized = ds.run ? getNormalizedStatus(ds.run.status, ds.run.conclusion) : 'no_runs';
            const tooltip = ds.run
              ? `Date: ${ds.date}\nStatus: ${ds.run.conclusion || ds.run.status}${ds.run.runNumber || ds.run.runId ? `\nRun #${ds.run.runNumber || ds.run.runId}` : ''}${ds.run.event ? `\nEvent: ${ds.run.event}` : ''}${ds.run.commit ? `\nCommit: ${shortCommit(ds.run.commit)}` : ''}${ds.run.url ? '\n\nClick to view run' : ''}`
              : `Date: ${ds.date}\nNo run`;
            const prev: WorkflowStatus[] = idx < dailyStatus.length - 1 ? dailyStatus.slice(idx + 1).map((d: { date: string; run: WorkflowStatus | null }) => d.run).filter(Boolean) as WorkflowStatus[] : [];
            const changeType = ds.run ? getStatusIndicator(ds.run, prev) : undefined;
            const isStatusChange = !!changeType;
            const pulse = isStatusChange && idx === firstStatusChangeIdx;
            // Week marker: visually mark every 7th cube (except idx 0)
            const isWeek = idx > 0 && idx % 7 === 0;
            return (
              <div
                key={ds.date}
                className={`histogram-cube-label-wrapper${isStatusChange ? ' has-indicator' : ''}${isWeek ? ' week-marker' : ''}`}
              >
                {/* Indicator above cube, centered horizontally (like RecentRunsHistogram) */}
                {isStatusChange && (
                  <span
                    className="histogram-status-change-badge"
                    title={`Status changed (${changeType}) from previous run`}
                  >
                    {/* You may want to pass statusChangeIcons as a prop for custom icons */}
                  </span>
                )}
                {/* Cube itself */}
                <span
                  className={`histogram-cube${isStatusChange ? (pulse ? ' histogram-cube-status-change' : ' histogram-cube-status-change-static') : ''}`}
                  title={(isStatusChange ? `Status changed (${changeType}) from previous run\n\n` : '') + tooltip}
                  style={{
                    background: STATUS_COLORS[normalized] || '#bdbdbd',
                    cursor: ds.run && ds.run.url ? 'pointer' : 'default',
                    opacity: ds.run ? 1 : 0.45,
                  }}
                  onClick={() => { if (ds.run && ds.run.url) window.open(ds.run.url, '_blank', 'noopener'); }}
                  tabIndex={ds.run && ds.run.url ? 0 : -1}
                  aria-label={tooltip.replace(/\n/g, ' ')}
                >
                  {/* Accessible date for screen readers */}
                  <span style={{ display: 'none' }}>{ds.date}</span>
                </span>
                {/* Label directly below cube, always centered */}
                <span
                  className={`histogram-cube-label${idx === 0 ? ' histogram-cube-label-hidden' : ''}`}
                >
                  {idx === 0 ? '' : getRelativeLabel(idx)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DailyStatusHistogram;
