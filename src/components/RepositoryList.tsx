import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './RepositoryList.css';

interface Repository {
  id: number;
  repository_name: string;
  repository_url: string;
  tracked_branches: string[];
  tracked_workflows: string[];
  auto_refresh_interval: number;
}

interface BranchStats {
  success: number;
  failure: number;
  pending: number;
  cancelled: number;
  latestRun?: {
    id: number;
    status: string;
    conclusion: string | null;
    created_at: string;
    head_branch: string;
  };
  error?: string;
}

interface ActionStatistics {
  repository: string;
  repositoryUrl: string;
  repoId: number;
  branches: Record<string, BranchStats>;
  overall: {
    success: number;
    failure: number;
    pending: number;
    cancelled: number;
  };
}

interface RepositoryListProps {
  repositories: Repository[];
  actionStats: ActionStatistics[];
  onRepositoryRemoved: (repoId: number) => void;
}

export default function RepositoryList({ repositories, actionStats, onRepositoryRemoved }: RepositoryListProps) {
  const { user } = useAuth();
  const [expandedRepo, setExpandedRepo] = useState<number | null>(null);
  const [isRemoving, setIsRemoving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getRepoStats = (repoId: number) => {
    return actionStats.find(stat => stat.repoId === repoId);
  };

  const removeRepository = async (repoId: number) => {
    if (!user) return;

    setIsRemoving(repoId);
    setError(null);
    try {
      const response = await fetch(`/api/repositories/tracked/${user.id}/${repoId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onRepositoryRemoved(repoId);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setError(`Failed to remove repository: ${errorData.error || 'Please try again'}`);
      }
    } catch (error) {
      console.error('Error removing repository:', error);
      setError('Network error occurred while removing repository');
    } finally {
      setIsRemoving(null);
    }
  };

  const toggleExpanded = (repoId: number) => {
    setExpandedRepo(expandedRepo === repoId ? null : repoId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return '#28a745';
      case 'failure': return '#dc3545';
      case 'pending': return '#ffc107';
      case 'cancelled': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✓';
      case 'failure': return '✗';
      case 'pending': return '○';
      case 'cancelled': return '⊘';
      default: return '?';
    }
  };

  if (repositories.length === 0) {
    return (
      <div className="repository-list empty">
        <p>No repositories are being tracked yet.</p>
      </div>
    );
  }

  return (
    <div className="repository-list">
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="dismiss-error">×</button>
        </div>
      )}
      {repositories.map(repo => {
        const stats = getRepoStats(repo.id);
        const isExpanded = expandedRepo === repo.id;

        return (
          <div key={repo.id} className="repository-item">
            <div className="repository-header" onClick={() => toggleExpanded(repo.id)}>
              <div className="repo-info">
                <h4>
                  <a href={repo.repository_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    {repo.repository_name}
                  </a>
                </h4>
                <div className="repo-config">
                  <span>Branches: {repo.tracked_branches.join(', ')}</span>
                  <span>Refresh: {repo.auto_refresh_interval}s</span>
                  {repo.tracked_workflows.length > 0 && (
                    <span>Workflows: {repo.tracked_workflows.length}</span>
                  )}
                </div>
              </div>
              
              {stats && (
                <div className="repo-stats-summary">
                  <div className="stats-row">
                    <span className="stat success" title="Success">{stats.overall.success}</span>
                    <span className="stat failure" title="Failure">{stats.overall.failure}</span>
                    <span className="stat pending" title="Pending">{stats.overall.pending}</span>
                    <span className="stat cancelled" title="Cancelled">{stats.overall.cancelled}</span>
                  </div>
                </div>
              )}
              
              <div className="repo-actions">
                <button 
                  className="expand-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(repo.id);
                  }}
                >
                  {isExpanded ? '▲' : '▼'}
                </button>
                <button 
                  className="remove-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRepository(repo.id);
                  }}
                  disabled={isRemoving === repo.id}
                >
                  {isRemoving === repo.id ? '...' : '✗'}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="repository-details">
                <div className="details-section">
                  <h5>Configuration</h5>
                  <div className="config-details">
                    <div className="config-item">
                      <strong>Tracked Branches:</strong>
                      <ul>
                        {repo.tracked_branches.map(branch => (
                          <li key={branch}>{branch}</li>
                        ))}
                      </ul>
                    </div>
                    {repo.tracked_workflows.length > 0 && (
                      <div className="config-item">
                        <strong>Tracked Workflows:</strong>
                        <ul>
                          {repo.tracked_workflows.map(workflow => (
                            <li key={workflow}>{workflow}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="config-item">
                      <strong>Auto-refresh Interval:</strong> {repo.auto_refresh_interval} seconds
                    </div>
                  </div>
                </div>

                {stats && (
                  <div className="details-section">
                    <h5>Branch Details</h5>
                    <div className="branch-details">
                      {Object.entries(stats.branches).map(([branch, branchStats]) => (
                        <div key={branch} className="branch-detail">
                          <div className="branch-header">
                            <h6>{branch}</h6>
                            <div className="branch-stats">
                              <span className="stat success">{branchStats.success}</span>
                              <span className="stat failure">{branchStats.failure}</span>
                              <span className="stat pending">{branchStats.pending}</span>
                              <span className="stat cancelled">{branchStats.cancelled}</span>
                            </div>
                          </div>
                          
                          {branchStats.error ? (
                            <div className="branch-error">Error: {branchStats.error}</div>
                          ) : branchStats.latestRun && (
                            <div className="latest-run">
                              <span className="run-label">Latest run:</span>
                              <span 
                                className={`run-status ${branchStats.latestRun.conclusion || branchStats.latestRun.status}`}
                                style={{ color: getStatusColor(branchStats.latestRun.conclusion || branchStats.latestRun.status) }}
                              >
                                {getStatusIcon(branchStats.latestRun.conclusion || branchStats.latestRun.status)}
                                {branchStats.latestRun.conclusion || branchStats.latestRun.status}
                              </span>
                              <span className="run-time">
                                {new Date(branchStats.latestRun.created_at).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
