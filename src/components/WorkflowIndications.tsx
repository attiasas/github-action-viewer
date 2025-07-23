

import './WorkflowIndications.css';
import React from 'react';
import type { Indication } from './indicationsUtils';

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
  return (
    <div className="workflow-analytics">
      <section className="analytics-indications">
        <h3>Indications</h3>
        <ul>
          {sorted.map((ind, idx) => (
            <li key={idx} className={typeToClass[ind.type] || 'indication-info'}>
              {ind.message}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default WorkflowIndications;
