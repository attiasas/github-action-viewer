
export interface TrackedRepository {
  repository: RepositoryMetadata;
  serverId: number;
  serverName: string;
  serverUrl: string;
}

export interface RepositoryMetadata {
  id: number;
  name: string;
  url: string;
  autoRefreshInterval: number;
  displayName?: string;
  trackedBranches: string[];
  trackedWorkflowsPaths: string[];
}

export interface RepositoryStatus {
  id: number;
  name: string;
  url: string;
  branches: Map<string, BranchStatus>;
  overall: OverallStatus;
  status: NormalizedStatus; // Normalized status of the repository
  hasPermissionError?: boolean; // True if any branch has permission error
  hasError?: boolean; // True if any branch has error
  error?: string; // Error message if any (added when parsing workflows fails)
}

export interface BranchStatus {
  name: string;
  workflows: Map<string, WorkflowStatus>;
  overall: OverallStatus;
  status: NormalizedStatus; // Normalized status of the branch
  error?: string; // Error message if any (added when parsing workflows fails)
}

export interface WorkflowStatus {
  name: string;
  runNumber: number;
  commit: string | null; // Commit SHA or null if not available
  status: RunStatus;
  conclusion: string | null; // Conclusion of the workflow run
  createdAt?: string; // Creation date of the workflow run
  updatedAt?: string; // Updated date of the workflow run
  url?: string; // URL to the workflow run
  workflow_id?: number; // ID of the workflow
  workflow_path?: string; // Path to the workflow file
}

export type NormalizedStatus = 'success' | 'failure' | 'pending' | 'running' | 'error' | 'unknown'; // Normalized status values for workflows, branches, and repositories
export type RunStatus = 'success' | 'failure' | 'pending' | 'running' | 'cancelled' | 'error' | 'no_runs'; // Normalized status values for workflows

export interface OverallStatus {
  success: number;
  failure: number;
  pending: number;
  cancelled: number;
  running: number;
}