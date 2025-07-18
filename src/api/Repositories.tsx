
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
