import React from 'react';
import './DailyStatusHistogram.css';
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

interface DailyStatusHistogramProps {
  dailyStatus: Array<{ date: string; run: WorkflowStatus | null }>;
  getStatusIndicator: (curr: WorkflowStatus, prev: WorkflowStatus[]) => 'bad' | 'good' | 'info' | undefined;
  shortCommit: (commit: string | null | undefined) => string;
}

const DailyStatusHistogram: React.FC<DailyStatusHistogramProps> = ({ dailyStatus, getStatusIndicator, shortCommit }) => {
  // Find the first (latest) status change index in dailyStatus
  const statusChangeIdxs = dailyStatus
    .map((ds, idx) => {
      const prev = idx < dailyStatus.length - 1 ? dailyStatus.slice(idx + 1).map(d => d.run).filter(Boolean) as WorkflowStatus[] : [];
      const changeType = ds.run ? getStatusIndicator(ds.run, prev) : undefined;
      return changeType ? idx : null;
    })
    .filter(idx => idx !== null) as number[];
  const firstStatusChangeIdx = statusChangeIdxs.length > 0 ? Math.min(...statusChangeIdxs) : -1;

  return (
    <div className="daily-status-histogram" style={{ width: '100%', overflowX: 'auto', padding: '12px 0 8px 0', minHeight: '48px' }}>
      <div
        className="histogram-cubes"
        data-count={dailyStatus.length}
        style={{
          minHeight: '32px',
          paddingBottom: '8px',
          paddingTop: '0',
          gap: '0.3em',
          justifyContent: 'flex-start',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          display: 'flex',
        }}
      >
        {dailyStatus.every(ds => !ds.run) ? (
          <span style={{ color: 'var(--text-secondary, #888)', fontSize: '0.97em', padding: '2px 0' }}>No runs yet</span>
        ) : (
          dailyStatus.map((ds, idx) => {
            const normalized = ds.run ? getNormalizedStatus(ds.run.status, ds.run.conclusion) : 'no_runs';
            const tooltip = ds.run
              ? `Date: ${ds.date}\nStatus: ${ds.run.conclusion || ds.run.status}\nRun #${ds.run.runNumber || ds.run.runId || ''}\nEvent: ${ds.run.event || ''}\nCommit: ${shortCommit(ds.run.commit)}${ds.run.url ? '\n\nClick to view run' : ''}`
              : `Date: ${ds.date}\nNo run`;
            const prev = idx < dailyStatus.length - 1 ? dailyStatus.slice(idx + 1).map(d => d.run).filter(Boolean) as WorkflowStatus[] : [];
            const changeType = ds.run ? getStatusIndicator(ds.run, prev) : undefined;
            const isStatusChange = !!changeType;
            const pulse = isStatusChange && idx === firstStatusChangeIdx;
            return (
              <div
                key={ds.date}
                className={`histogram-cube-wrapper${isStatusChange ? ' has-indicator' : ''}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  minWidth: '22px',
                  margin: '0 1px',
                  position: 'relative',
                }}
              >
                {/* Indicator above cube, centered horizontally (like RecentRunsHistogram) */}
                {isStatusChange && (
                  <span
                    className="histogram-status-change-badge"
                    title={`Status changed (${changeType}) from previous day`}
                    style={{
                      position: 'absolute',
                      top: '-28px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      zIndex: 10,
                      pointerEvents: 'none',
                      background: 'var(--bg-card, #fff)',
                      borderRadius: '50%',
                      boxShadow: '0 4px 16px rgba(255,193,7,0.18)',
                      padding: '2px 6px',
                      fontSize: '1.18em',
                      border: '2px solid var(--accent-warning, #ffc107)',
                      fontWeight: 'bold',
                      marginBottom: '2px',
                    }}
                  >
                    {/* You may want to pass statusChangeIcons as a prop for custom icons */}
                  </span>
                )}
                {/* Cube itself */}
                <span
                  className={`histogram-cube${isStatusChange ? (pulse ? ' histogram-cube-status-change' : ' histogram-cube-status-change-static') : ''}`}
                  title={(isStatusChange ? `Status changed (${changeType}) from previous day\n\n` : '') + tooltip}
                  style={{
                    background: STATUS_COLORS[normalized] || '#bdbdbd',
                    cursor: ds.run && ds.run.url ? 'pointer' : 'default',
                    opacity: ds.run ? 1 : 0.45,
                    position: 'relative',
                    minHeight: '18px',
                    maxHeight: '32px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  onClick={() => { if (ds.run && ds.run.url) window.open(ds.run.url, '_blank', 'noopener'); }}
                  tabIndex={ds.run && ds.run.url ? 0 : -1}
                  aria-label={tooltip.replace(/\n/g, ' ')}
                >
                  {/* Accessible date for screen readers */}
                  <span style={{ display: 'none' }}>{ds.date}</span>
                </span>
                {/* Label below cube: date (short) */}
                <span
                  className="histogram-cube-label"
                  style={{
                    marginTop: '5px',
                    fontSize: '0.75em',
                    color: 'var(--text-secondary, #888)',
                    fontFamily: 'SF Mono, Monaco, monospace',
                    textAlign: 'center',
                    maxWidth: '40px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.1,
                  }}
                >
                  {ds.date}
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
