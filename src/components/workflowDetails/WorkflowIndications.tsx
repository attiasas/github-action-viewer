

import './WorkflowIndications.css';
import React from 'react';
import type { Indication } from '../utils/indicationsUtils';

export interface WorkflowIndicationsProps {
  indications: Indication[];
}

const typeToClass: Record<string, string> = {
  info: 'indication-info',
  warning: 'indication-warning',
  error: 'indication-error',
  success: 'indication-success',
};


const typeOrder: Record<string, number> = {
  error: 0,
  warning: 1,
  info: 2,
  success: 3,
};

const WorkflowIndications: React.FC<WorkflowIndicationsProps> = ({ indications }) => {
  const sorted = [...indications].sort((a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99));

  // Icon for each indication type
  const typeIcon: Record<string, React.ReactNode> = {
    info: <span style={{ color: 'var(--accent-info, #17a2b8)', fontSize: '1.2em' }} aria-label="Info">ℹ️</span>,
    warning: <span style={{ color: 'var(--accent-warning, #ffc107)', fontSize: '1.2em' }} aria-label="Warning">⚠️</span>,
    error: <span style={{ color: 'var(--accent-danger, #dc3545)', fontSize: '1.2em' }} aria-label="Error">❌</span>,
    success: <span style={{ color: 'var(--accent-success, #28a745)', fontSize: '1.2em' }} aria-label="Success">✅</span>,
  };

  return (
    <div className="workflow-analytics">
      <section className="analytics-indications">
        <h3>Indications</h3>
        <ul>
          {sorted.map((ind, idx) => (
            <li
              key={idx}
              className={typeToClass[ind.type] || 'indication-info'}
              tabIndex={ind.url ? 0 : -1}
              title={ind.message}
              onClick={() => { if (ind.url) window.open(ind.url, '_blank', 'noopener'); }}
              onKeyDown={e => { if (ind.url && (e.key === 'Enter' || e.key === ' ')) window.open(ind.url, '_blank', 'noopener'); }}
            >
              {typeIcon[ind.type]}
              <span style={{ flex: 1 }}>{ind.message}</span>
              {ind.timestamp && (
                <span className="indication-timestamp">{new Date(ind.timestamp).toLocaleString()}</span>
              )}
              {ind.url && (
                <span className="indication-link-icon" aria-label="External link" title="Open link">
                  <svg width="1em" height="1em" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle' }}>
                    <path d="M14.5 3H17a1 1 0 0 1 1 1v2.5a1 1 0 1 1-2 0V6.41l-7.3 7.3a1 1 0 0 1-1.4-1.42l7.3-7.3H14.5a1 1 0 1 1 0-2z" fill="currentColor"/>
                    <rect x="3" y="9" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  </svg>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default WorkflowIndications;
