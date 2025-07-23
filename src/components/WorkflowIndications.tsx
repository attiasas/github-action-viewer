import React from 'react';

export interface WorkflowIndicationsProps {
  indications: string[];
}

const WorkflowIndications: React.FC<WorkflowIndicationsProps> = ({ indications }) => (
  <section className="analytics-indications">
    <h3>Indications</h3>
    <ul>
      {indications.map((ind, idx) => (
        <li key={idx}>{ind}</li>
      ))}
    </ul>
  </section>
);

export default WorkflowIndications;
