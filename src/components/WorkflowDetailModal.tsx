import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './WorkflowDetailModal.css';

interface Repository {
  id: number;
  repository_name: string;
  repository_url: string;
  display_name?: string;
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

interface WorkflowDetailModalProps {
  repository: Repository;
  isOpen: boolean;
  onClose: () => void;
}

export default function WorkflowDetailModal({ repository, isOpen, onClose }: WorkflowDetailModalProps) {
  const { user } = useAuth();
  const [workflowData, setWorkflowData] = useState<DetailedWorkflowStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());

  // Load detailed workflow status
  const loadWorkflowDetails = useCallback(async () => {
    if (!user || !isOpen) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/actions/workflow-status/${encodeURIComponent(user.id)}/${repository.id}?force=true`);
      if (response.ok) {
        const data = await response.json();
        setWorkflowData(data);
      } else {
        throw new Error('Failed to load workflow details');
      }
    } catch (error) {
      console.error('Error loading workflow details:', error);
      setError(error instanceof Error ? error.message : 'Failed to load workflow details');
    } finally {
      setIsLoading(false);
    }
  }, [user, isOpen, repository.id]);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadWorkflowDetails();
    }
  }, [isOpen, loadWorkflowDetails]);

  // Auto-expand single branch when data loads
  useEffect(() => {
    if (workflowData) {
      const branches = Object.keys(workflowData.branches);
      if (branches.length === 1) {
        setExpandedBranches(new Set([branches[0]]));
      }
    }
  }, [workflowData]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  };

  const getStatusDisplayText = (status: string, conclusion: string | null) => {
    if (conclusion === 'success') return 'Success';
    if (conclusion === 'failure') return 'Failed';
    if (conclusion === 'cancelled') return 'Cancelled';
    if (status === 'in_progress') return 'Running';
    if (status === 'queued') return 'Queued';
    return status || 'Unknown';
  };

  const getStatusIcon = (status: string, conclusion: string | null) => {
    if (conclusion === 'success') return '✓';
    if (conclusion === 'failure') return '✗';
    if (conclusion === 'cancelled') return '⊘';
    if (status === 'in_progress') return '⟳';
    if (status === 'queued') return '○';
    return '?';
  };

  const truncateSha = (sha: string) => {
    return sha?.substring(0, 7) || '';
  };

  const getStatusPriority = (status: string, conclusion: string | null) => {
    if (conclusion === 'failure') return 1;
    if (status === 'in_progress' || status === 'queued') return 2;
    if (conclusion === 'cancelled') return 3;
    if (conclusion === 'success') return 4;
    return 5;
  };

  const normalizeStatus = (status: string, conclusion: string | null) => {
    if (conclusion === 'success') return 'success';
    if (conclusion === 'failure') return 'failure';
    if (conclusion === 'cancelled') return 'cancelled';
    if (status === 'in_progress' || status === 'queued') return 'pending';
    return 'unknown';
  };

  const toggleBranch = (branchName: string) => {
    setExpandedBranches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(branchName)) {
        newSet.delete(branchName);
      } else {
        newSet.add(branchName);
      }
      return newSet;
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="workflow-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <h2>
              <a href={repository.repository_url} target="_blank" rel="noopener noreferrer">
                {repository.display_name || repository.repository_name}
              </a>
            </h2>
            <span className="modal-subtitle">Workflow Details</span>
          </div>
          <div className="modal-actions">
            <button className="modal-refresh-button" onClick={loadWorkflowDetails} title="Refresh">
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="refresh-icon"
              >
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
            <button className="modal-close-button" onClick={onClose} title="Close">
              ×
            </button>
          </div>
        </div>

        <div className="modal-body">
          {isLoading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading workflow details...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <span className="error-icon">⚠</span>
              <p>{error}</p>
              <button onClick={loadWorkflowDetails} className="retry-button">
                Retry
              </button>
            </div>
          ) : workflowData ? (
            <div className="workflow-details">
              {Object.entries(workflowData.branches).map(([branchName, branchData]) => {
                const isExpanded = expandedBranches.has(branchName);
                return (
                  <div key={branchName} className="branch-section">
                    <div 
                      className="branch-header clickable"
                      onClick={() => toggleBranch(branchName)}
                    >
                      <h3 className="branch-title">
                        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                        <span className="branch-name">{branchName}</span>
                      </h3>
                      {!branchData.error && (
                        <div className="branch-summary">
                          <span className="workflow-count">
                            {Object.keys(branchData.workflows).length} workflow{Object.keys(branchData.workflows).length !== 1 ? 's' : ''}
                          </span>
                          <div className="branch-stats">
                            {(() => {
                              const stats = { success: 0, failure: 0, pending: 0, cancelled: 0 };
                              Object.values(branchData.workflows).forEach(workflow => {
                                const normalizedStatus = normalizeStatus(workflow.status, workflow.conclusion);
                                if (normalizedStatus === 'success') stats.success++;
                                else if (normalizedStatus === 'failure') stats.failure++;
                                else if (normalizedStatus === 'pending') stats.pending++;
                                else if (normalizedStatus === 'cancelled') stats.cancelled++;
                              });
                              return (
                                <>
                                  {stats.success > 0 && <span className="stat success">✓{stats.success}</span>}
                                  {stats.failure > 0 && <span className="stat failure">✗{stats.failure}</span>}
                                  {stats.pending > 0 && <span className="stat pending">○{stats.pending}</span>}
                                  {stats.cancelled > 0 && <span className="stat cancelled">⊘{stats.cancelled}</span>}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>

                    {isExpanded && (
                      <>
                        {branchData.error ? (
                          <div className="branch-error">
                            <span className="error-icon">⚠</span>
                            <span>{branchData.error}</span>
                          </div>
                        ) : (
                          <div className="workflows-list">
                            {Object.entries(branchData.workflows)
                              .sort(([, workflowA], [, workflowB]) => {
                                const priorityA = getStatusPriority(workflowA.status, workflowA.conclusion);
                                const priorityB = getStatusPriority(workflowB.status, workflowB.conclusion);
                                return priorityA - priorityB;
                              })
                              .map(([workflowName, workflow]) => {
                                const normalizedStatus = normalizeStatus(workflow.status, workflow.conclusion);
                                return (
                                  <div key={workflowName} className={`workflow-card status-${normalizedStatus}`}>
                                    <div className="workflow-main">
                                      <div className="workflow-info">
                                        <div className="workflow-header">
                                          <h4 className="workflow-name">{workflowName}</h4>
                                          {'run_number' in workflow && (
                                            <span className="workflow-run-number">
                                              #{workflow.run_number}
                                            </span>
                                          )}
                                        </div>
                                        
                                        <div className="workflow-meta">
                                          {'run_number' in workflow && workflow.head_sha && (
                                            <div className="meta-item">
                                              <span className="meta-label">Commit:</span>
                                              <a 
                                                href={`${repository.repository_url}/commit/${workflow.head_sha}`}
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="commit-link"
                                                title={workflow.head_sha}
                                              >
                                                {truncateSha(workflow.head_sha)}
                                              </a>
                                            </div>
                                          )}
                                          
                                          {'run_number' in workflow && workflow.updated_at && (
                                            <div className="meta-item">
                                              <span className="meta-label">Updated:</span>
                                              <time className="timestamp" title={new Date(workflow.updated_at).toISOString()}>
                                                {formatRelativeTime(workflow.updated_at)}
                                              </time>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="workflow-status-section">
                                        {workflow.status !== 'no_runs' ? (
                                          <div className={`status-badge status-${normalizedStatus}`}>
                                            <span className="status-icon">
                                              {getStatusIcon(workflow.status, workflow.conclusion)}
                                            </span>
                                            <span className="status-text">
                                              {getStatusDisplayText(workflow.status, workflow.conclusion)}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="status-badge status-unknown">
                                            <span className="status-icon">○</span>
                                            <span className="status-text">No runs</span>
                                          </div>
                                        )}
                                        
                                        {'html_url' in workflow && workflow.html_url && (
                                          <a 
                                            href={workflow.html_url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="action-button"
                                            aria-label={`View workflow run for ${workflowName}`}
                                          >
                                            <span>View Run</span>
                                            <span className="button-icon">→</span>
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <p>No workflow data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
