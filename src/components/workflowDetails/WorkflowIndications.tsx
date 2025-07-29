

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
    <div className="workflow-analytics" style={{ boxShadow: 'var(--shadow-card, 0 2px 8px rgba(0,0,0,0.06))', borderRadius: 12, background: 'var(--bg-card, #fff)', padding: '1.5rem', margin: '2rem 0' }}>
      <section className="analytics-indications">
        <h3 style={{ marginBottom: '0.5rem', fontSize: '1.2rem', color: 'var(--accent-primary, #222)' }}>Indications</h3>
        <ul style={{ paddingLeft: '1.2em', margin: 0 }}>
          {sorted.map((ind, idx) => (
            <li
              key={idx}
              className={typeToClass[ind.type] || 'indication-info'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.7em',
                fontWeight: 500,
                fontSize: '1rem',
                borderRadius: 8,
                padding: '0.5em 1em',
                marginBottom: '0.3em',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'background 0.2s, color 0.2s',
                cursor: ind.url ? 'pointer' : 'default',
                outline: 'none',
              }}
              tabIndex={ind.url ? 0 : -1}
              title={ind.message}
              onClick={() => { if (ind.url) window.open(ind.url, '_blank', 'noopener'); }}
              onKeyDown={e => { if (ind.url && (e.key === 'Enter' || e.key === ' ')) window.open(ind.url, '_blank', 'noopener'); }}
            >
              {typeIcon[ind.type]}
              <span style={{ flex: 1 }}>{ind.message}</span>
              {ind.timestamp && (
                <span style={{ fontSize: '0.92em', color: 'var(--text-tertiary, #aaa)', marginLeft: '0.7em' }}>{new Date(ind.timestamp).toLocaleString()}</span>
              )}
              {ind.url && (
                <span style={{ fontSize: '0.92em', color: 'var(--accent-info, #17a2b8)', marginLeft: '0.7em' }}>↗</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default WorkflowIndications;
