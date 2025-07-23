import React from 'react';
import type { WorkflowStatus } from '../api/Repositories';

export interface WorkflowAnalyticsProps {
  runs: Array<{ branch: string; workflowKey: string; workflow: WorkflowStatus[] }>;
}

/**
 * Analytics section for workflow runs. Aggregates all runs (not just latest) for statistics.
 */


import WorkflowIndications from './WorkflowIndications';
import WorkflowHistogram from './WorkflowHistogram';
import './WorkflowAnalytics.css';




import { getIndications } from './indicationsUtils';

const WorkflowAnalytics: React.FC<WorkflowAnalyticsProps> = ({ runs }) => {
  const indications = getIndications(runs);
  return (
    <div className="workflow-analytics">
      <WorkflowIndications indications={indications} />
      <WorkflowHistogram runs={runs} />
    </div>
  );
};

export default WorkflowAnalytics;
