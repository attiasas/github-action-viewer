import { useState, useEffect, useCallback } from 'react';
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

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  head_branch: string;
  head_sha: string;
  workflow_id: number;
  run_number: number;
}

interface DetailedWorkflowStatus {
  repository: string;
  repositoryUrl: string;
  repoId: number;
  branches: Record<string, {
    workflows: Record<string, WorkflowRun | { status: 'no_runs'; conclusion: null; name: string; workflow_id: number; }>;
    error: string | null;
  }>;
}

interface RepositoryListProps {
  repositories: Repository[];
  actionStats: ActionStatistics[];
  onRepositoryRemoved: (repoId: number) => void;
  onActionStatsUpdate: (stats: ActionStatistics[]) => void;
  gridView?: boolean;
}

interface RepositoryTimer {
  timeLeft: number;
  intervalId: NodeJS.Timeout | null;
}

export default function RepositoryList({ 
  repositories, 
  actionStats, 
  onRepositoryRemoved, 
  onActionStatsUpdate,
  gridView = false 
}: RepositoryListProps) {
  const { user } = useAuth();
  const [showConfigModal, setShowConfigModal] = useState<number | null>(null);
  const [showWorkflowStatus, setShowWorkflowStatus] = useState<number | null>(null);
  const [workflowStatusData, setWorkflowStatusData] = useState<DetailedWorkflowStatus | null>(null);
  const [isLoadingWorkflowStatus, setIsLoadingWorkflowStatus] = useState(false);
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});
  const [isRemoving, setIsRemoving] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repositoryTimers, setRepositoryTimers] = useState<Record<number, RepositoryTimer>>({});

  // Function to refresh stats for all repositories
  const refreshRepositoryStats = useCallback(async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/actions/stats/${user.id}`);
      if (response.ok) {
        const stats = await response.json();
        onActionStatsUpdate(stats);
      }
    } catch (error) {
      console.error('Error refreshing repository stats:', error);
    }
  }, [user, onActionStatsUpdate]);

  // Function to manually refresh a specific repository
  const manualRefreshRepository = useCallback(async (repoId: number) => {
    setIsRefreshing(repoId);
    
    try {
      // Reset the timer for this repository
      setRepositoryTimers(prev => {
        const repo = repositories.find(r => r.id === repoId);
        if (repo && prev[repoId]) {
          return {
            ...prev,
            [repoId]: {
              ...prev[repoId],
              timeLeft: repo.auto_refresh_interval
            }
          };
        }
        return prev;
      });
      
      // Trigger the refresh
      await refreshRepositoryStats();
    } catch (error) {
      console.error('Error manually refreshing repository:', error);
    } finally {
      setIsRefreshing(null);
    }
  }, [repositories, refreshRepositoryStats]);

  // Initialize timers when repositories change
  useEffect(() => {
    const newTimers: Record<number, RepositoryTimer> = {};
    
    repositories.forEach(repo => {
      newTimers[repo.id] = {
        timeLeft: repo.auto_refresh_interval,
        intervalId: null
      };
    });
    
    setRepositoryTimers(newTimers);
  }, [repositories]);

  // Single timer that runs every second and updates all repository timers
  useEffect(() => {
    const globalInterval = setInterval(() => {
      setRepositoryTimers(prev => {
        const updated = { ...prev };
        let hasChanges = false;
        
        repositories.forEach(repo => {
          if (updated[repo.id]) {
            const newTimeLeft = updated[repo.id].timeLeft - 1;
            
            if (newTimeLeft <= 0) {
              // Time to refresh - reset timer and trigger refresh
              updated[repo.id] = {
                ...updated[repo.id],
                timeLeft: repo.auto_refresh_interval
              };
              refreshRepositoryStats();
              hasChanges = true;
            } else {
              updated[repo.id] = {
                ...updated[repo.id],
                timeLeft: newTimeLeft
              };
              hasChanges = true;
            }
          }
        });
        
        return hasChanges ? updated : prev;
      });
    }, 1000);
    
    return () => clearInterval(globalInterval);
  }, [repositories, refreshRepositoryStats]);

  // Format time left display
  const formatTimeLeft = (seconds: number): string => {
    if (seconds <= 0) return '0s';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  // Calculate repository status based on latest runs
  const getRepositoryStatus = (repoId: number): string => {
    const stat = actionStats.find(s => s.repoId === repoId);
    if (!stat) return 'unknown';
    
    // Get all latest run statuses from branches
    const branchStatuses = Object.values(stat.branches)
      .filter(branch => branch.latestRun && !branch.error)
      .map(branch => branch.latestRun?.conclusion || branch.latestRun?.status || 'unknown');
    
    if (branchStatuses.length === 0) return 'unknown';
    
    // Priority: failure > pending/cancelled > success
    if (branchStatuses.some(status => status === 'failure')) return 'failure';
    if (branchStatuses.some(status => status === 'pending' || status === 'in_progress' || status === 'cancelled')) return 'pending';
    if (branchStatuses.every(status => status === 'success')) return 'success';
    
    return 'unknown';
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

  const openConfigModal = (repoId: number) => {
    setShowConfigModal(repoId);
  };

  const closeConfigModal = () => {
    setShowConfigModal(null);
  };

  const openWorkflowStatus = async (repoId: number) => {
    setShowWorkflowStatus(repoId);
    setIsLoadingWorkflowStatus(true);
    setWorkflowStatusData(null);
    setExpandedBranches({});
    
    if (!user) return;
    
    try {
      const response = await fetch(`/api/actions/workflow-status/${user.id}/${repoId}`);
      if (response.ok) {
        const data = await response.json();
        setWorkflowStatusData(data);
        
        // Initialize expanded branches state - expand all if only one branch, otherwise collapse all
        const branchNames = Object.keys(data.branches);
        const initialExpandedState: Record<string, boolean> = {};
        branchNames.forEach(branchName => {
          initialExpandedState[branchName] = branchNames.length === 1;
        });
        setExpandedBranches(initialExpandedState);
      } else {
        console.error('Failed to fetch workflow status');
      }
    } catch (error) {
      console.error('Error fetching workflow status:', error);
    } finally {
      setIsLoadingWorkflowStatus(false);
    }
  };

  const closeWorkflowStatus = () => {
    setShowWorkflowStatus(null);
    setWorkflowStatusData(null);
    setExpandedBranches({});
  };

  const toggleBranch = (branchName: string) => {
    setExpandedBranches(prev => ({
      ...prev,
      [branchName]: !prev[branchName]
    }));
  };

  // Calculate overall branch status based on workflows
  const getBranchStatus = (branchData: { workflows: Record<string, WorkflowRun | { status: 'no_runs'; conclusion: null; name: string; workflow_id: number; }>; error: string | null; }) => {
    if (branchData.error) return 'error';
    
    const workflows = Object.values(branchData.workflows);
    if (workflows.length === 0) return 'unknown';
    
    const statuses = workflows.map(workflow => {
      const status = workflow.status;
      const conclusion = 'conclusion' in workflow ? workflow.conclusion : null;
      return conclusion || status;
    });
    
    // Priority: failure/action_required > pending/in_progress > cancelled > success > no_runs
    if (statuses.some(status => status === 'failure')) return 'failure';
    if (statuses.some(status => status === 'action_required')) return 'action_required';
    if (statuses.some(status => status === 'pending' || status === 'in_progress')) return 'pending';
    if (statuses.some(status => status === 'cancelled')) return 'cancelled';
    if (statuses.some(status => status === 'success')) return 'success';
    if (statuses.every(status => status === 'no_runs')) return 'no_runs';
    
    return 'unknown';
  };

  // Sort branches by status priority
  const getSortedBranches = (branches: Record<string, { workflows: Record<string, WorkflowRun | { status: 'no_runs'; conclusion: null; name: string; workflow_id: number; }>; error: string | null; }>) => {
    const statusPriority: Record<string, number> = {
      'failure': 1,
      'action_required': 2,
      'pending': 3,
      'cancelled': 4,
      'success': 5,
      'no_runs': 6,
      'error': 7,
      'unknown': 8
    };
    
    return Object.entries(branches).sort(([branchNameA, branchDataA], [branchNameB, branchDataB]) => {
      const statusA = getBranchStatus(branchDataA);
      const statusB = getBranchStatus(branchDataB);
      
      const priorityA = statusPriority[statusA] || 8;
      const priorityB = statusPriority[statusB] || 8;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same status, sort by branch name alphabetically
      return branchNameA.localeCompare(branchNameB);
    });
  };

  // Sort repositories by status priority (failure first, then pending, success, unknown)
  const getSortedRepositories = () => {
    const statusPriority: Record<string, number> = {
      'failure': 1,
      'pending': 2,
      'success': 3,
      'unknown': 4
    };
    
    return [...repositories].sort((a, b) => {
      const statusA = getRepositoryStatus(a.id);
      const statusB = getRepositoryStatus(b.id);
      
      const priorityA = statusPriority[statusA] || 4;
      const priorityB = statusPriority[statusB] || 4;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same status, sort by repository name
      return a.repository_name.localeCompare(b.repository_name);
    });
  };

  if (repositories.length === 0) {
    return (
      <div className="repository-list empty">
        <p>No repositories are being tracked yet.</p>
      </div>
    );
  }

  const sortedRepositories = getSortedRepositories();

  return (
    <div className={`repository-list ${gridView ? 'grid-view' : ''}`}>
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="dismiss-error">×</button>
        </div>
      )}
      <div className={gridView ? "repository-grid" : "repository-items"}>
        {sortedRepositories.map(repo => {
          const status = getRepositoryStatus(repo.id);
        return (
          <div key={repo.id} className={`repository-item status-${status}`}>
            <div className="repository-header-full">
              <div className="repo-actions-left">
                <button 
                  className="remove-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRepository(repo.id);
                  }}
                  disabled={isRemoving === repo.id}
                  title="Remove repository"
                >
                  {isRemoving === repo.id ? '...' : '✗'}
                </button>
                <button 
                  className="config-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openConfigModal(repo.id);
                  }}
                  title="Repository Configuration"
                >
                  ⚙️
                </button>
                <button 
                  className="refresh-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    manualRefreshRepository(repo.id);
                  }}
                  disabled={isRefreshing === repo.id}
                  title="Refresh this repository"
                >
                  {isRefreshing === repo.id ? '⏳' : '🔄'}
                </button>
                {repo.tracked_workflows.length > 0 && (
                  <span>Workflows: {repo.tracked_workflows.length}</span>
                )}
                <span>
                  Refresh: {repositoryTimers[repo.id] ? formatTimeLeft(repositoryTimers[repo.id].timeLeft) : repo.auto_refresh_interval + 's'}
                </span>
              </div>
              
              <div className="repo-status-right">
                <div className={`status-indicator status-${status}`} title={`Status: ${status}`}></div>
              </div>
            </div>
            
            <div className="repo-content" onClick={() => openWorkflowStatus(repo.id)}>
              <div className="repo-title-section">
                <h4>
                  <a href={repo.repository_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    {repo.repository_name}
                  </a>
                </h4>
              </div>
            </div>
          </div>
        );
      })}
      </div>

      {/* Configuration Modal */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={closeConfigModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Repository Configuration</h3>
              <button 
                className="modal-close-button"
                onClick={closeConfigModal}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {(() => {
                const repo = repositories.find(r => r.id === showConfigModal);
                if (!repo) return null;
                
                return (
                  <div className="config-details">
                    <div className="config-item">
                      <strong>Repository:</strong>
                      <p>
                        <a href={repo.repository_url} target="_blank" rel="noopener noreferrer">
                          {repo.repository_name}
                        </a>
                      </p>
                    </div>
                    <div className="config-item">
                      <strong>Tracked Branches:</strong>
                      <ul>
                        {repo.tracked_branches.map(branch => (
                          <li key={branch}>{branch}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="config-item">
                      <strong>Tracked Workflows ({repo.tracked_workflows.length > 0 ? repo.tracked_workflows.length : 'All'}):</strong>
                      {repo.tracked_workflows.length > 0 ? (
                        <ul>
                          {repo.tracked_workflows.map(workflow => (
                            <li key={workflow}>{workflow}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="default-config">All workflows in the repository are being tracked</p>
                      )}
                    </div>
                    <div className="config-item">
                      <strong>Auto-refresh Interval:</strong>
                      <p>{repo.auto_refresh_interval} seconds</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Workflow Status Popup */}
      {showWorkflowStatus !== null && (
        <div className="modal-overlay" onClick={closeWorkflowStatus}>
          <div className="modal-content workflow-status-popup" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {workflowStatusData ? `${workflowStatusData.repository} - Workflow Status` : 'Workflow Status'}
              </h3>
              <button 
                className="modal-close-button"
                onClick={closeWorkflowStatus}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {isLoadingWorkflowStatus ? (
                <div className="loading-indicator">
                  <p>Loading workflow status...</p>
                </div>
              ) : workflowStatusData ? (
                <div className="workflow-status-details">
                  <div className="branch-workflow-groups">
                    {getSortedBranches(workflowStatusData.branches).map(([branchName, branchData]) => {
                      const branchStatus = getBranchStatus(branchData);
                      
                      return (
                        <div key={branchName} className="branch-group">
                          <div 
                            className="branch-header" 
                            onClick={() => toggleBranch(branchName)}
                          >
                            <div className="branch-title">
                              <div className={`branch-status-circle status-${branchStatus}`}></div>
                              <h5 className="branch-name">{branchName}</h5>
                            </div>
                            <span className={`branch-toggle ${expandedBranches[branchName] ? 'expanded' : ''}`}>
                              ▼
                            </span>
                          </div>
                        {expandedBranches[branchName] && (
                          <div className="branch-content">
                            {branchData.error ? (
                              <div className="error-message">
                                <span className="error-indicator">❌</span>
                                <span>Error: {branchData.error}</span>
                              </div>
                            ) : (
                              <div className="workflow-list">
                                {Object.entries(branchData.workflows).map(([workflowName, workflow]) => {
                                  const status = workflow.status;
                                  const conclusion = workflow.conclusion;
                                  const displayStatus = conclusion || status;
                                  
                                  return (
                                    <div key={workflowName} className={`workflow-item status-${displayStatus}`}>
                                      <div className="workflow-header">
                                        <span className="workflow-name">{workflowName}</span>
                                        <span className={`status-badge status-${displayStatus}`}>
                                          {displayStatus === 'success' ? '✅' : 
                                           displayStatus === 'failure' ? '❌' : 
                                           displayStatus === 'cancelled' ? '⏹️' : 
                                           displayStatus === 'in_progress' ? '⏳' : 
                                           displayStatus === 'pending' ? '⏳' : 
                                           displayStatus === 'no_runs' ? '➖' : 
                                           displayStatus === 'action_required' ? '⚠️' : '❓'}
                                          {displayStatus.replace('_', ' ')}
                                        </span>
                                      </div>
                                      <div className="workflow-details">
                                        {workflow.status !== 'no_runs' && 'html_url' in workflow && (
                                          <>
                                            <div className="workflow-info">
                                              <span className="info-label">Run:</span>
                                              <a 
                                                href={workflow.html_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="run-link"
                                              >
                                                #{workflow.run_number}
                                              </a>
                                            </div>
                                            <div className="workflow-info">
                                              <span className="info-label">Updated:</span>
                                              <span className="info-value">
                                                {new Date(workflow.updated_at).toLocaleString()}
                                              </span>
                                            </div>
                                            <div className="workflow-info">
                                              <span className="info-label">SHA:</span>
                                              <span className="info-value sha">
                                                {workflow.head_sha.substring(0, 7)}
                                              </span>
                                            </div>
                                          </>
                                        )}
                                        {workflow.status === 'no_runs' && (
                                          <div className="workflow-info">
                                            <span className="info-value">No runs found for this workflow on this branch</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    })}
                  </div>
                </div>
              ) : (
                <div className="error-message">
                  <p>Failed to load workflow status. Please try again.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
