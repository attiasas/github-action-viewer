import WorkflowIndications from './WorkflowIndications';
import { getIndications } from './indicationsUtils';
import { useState, useEffect, useCallback, useRef } from 'react';
import WorkflowHistogram from './WorkflowHistogram';
import { useAuth } from '../contexts/AuthContext';

import type { TrackedRepository, RepositoryStatus, WorkflowStatus } from '../api/Repositories';
import './WorkflowDetailModal.css';


interface WorkflowDetailModalProps {
  repo: TrackedRepository;
  isOpen: boolean;
  onClose: () => void;
}

export default function WorkflowDetailModal({ repo, isOpen, onClose }: WorkflowDetailModalProps) {
  const { user } = useAuth();
  const [repositoryData, setRepositoryData] = useState<RepositoryStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedWorkflows, setEditedWorkflows] = useState<string[]>([]);
  const [editedBranches, setEditedBranches] = useState<string[]>([]);
  const [newWorkflow, setNewWorkflow] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Selector state for branch and workflow
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  
  // Available options for suggestions
  const [availableWorkflows, setAvailableWorkflows] = useState<Array<{name: string, path: string}>>([]);
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [showWorkflowSuggestions, setShowWorkflowSuggestions] = useState(false);
  const [showBranchSuggestions, setShowBranchSuggestions] = useState(false);
  const [selectedWorkflowIndex, setSelectedWorkflowIndex] = useState(-1);
  const [selectedBranchIndex, setSelectedBranchIndex] = useState(-1);
  const [workflowDropdownAbove, setWorkflowDropdownAbove] = useState(false);
  const [branchDropdownAbove, setBranchDropdownAbove] = useState(false);
  
  // Refs for dropdown positioning
  const workflowInputRef = useRef<HTMLInputElement>(null);
  const branchInputRef = useRef<HTMLInputElement>(null);

  // Expand/collapse state for latest runs section
  const [showLatestRuns, setShowLatestRuns] = useState(true);
  // Load detailed workflow status using new API
  const loadWorkflowDetails = useCallback(async () => {
    if (!user || !isOpen) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/workflows/status/${encodeURIComponent(user.id)}/${repo.repository.id}`);
      if (response.ok) {
        const data = await response.json();
        setRepositoryData(data);
      } else {
        throw new Error('Failed to load workflow details');
      }
    } catch (error) {
      console.error('Error loading workflow details:', error);
      setError(error instanceof Error ? error.message : 'Failed to load workflow details');
    } finally {
      setIsLoading(false);
    }
  }, [user, isOpen, repo.repository.id]);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadWorkflowDetails();
    }
  }, [isOpen, loadWorkflowDetails]);

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

  // Initialize edit state when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      setEditedWorkflows([...repo.repository.trackedWorkflowsPaths]);
      setEditedBranches([...repo.repository.trackedBranches]);
    }
  }, [isEditMode, repo.repository.trackedWorkflowsPaths, repo.repository.trackedBranches]);

  // Edit mode functions
  const enterEditMode = () => {
    setIsEditMode(true);
  };

  const exitEditMode = () => {
    setIsEditMode(false);
    setNewWorkflow('');
    setNewBranch('');
    setShowWorkflowSuggestions(false);
    setShowBranchSuggestions(false);
    setSelectedWorkflowIndex(-1);
    setSelectedBranchIndex(-1);
  };

  // Fetch available workflows and branches for suggestions
  const fetchAvailableOptions = useCallback(async () => {
    if (!user || !repo) return;

    try {
      // Extract owner and repo from repository name
      const [owner, repoName] = repo.repository.name.split('/');

      // Fetch workflows
      const workflowsResponse = await fetch(`/api/repositories/${owner}/${repoName}/workflows?userId=${encodeURIComponent(user.id)}&serverId=${repo.serverId}`);
      if (workflowsResponse.ok) {
        const workflowsData = await workflowsResponse.json();
        const workflowItems = workflowsData.workflows?.map((w: { name: string, path: string }) => ({
          name: w.name,
          path: w.path
        })) || [];
        setAvailableWorkflows(workflowItems);
      }

      // Fetch branches
      const branchesResponse = await fetch(`/api/repositories/${owner}/${repoName}/branches?userId=${encodeURIComponent(user.id)}&serverId=${repo.serverId}`);
      if (branchesResponse.ok) {
        const branchesData = await branchesResponse.json();
        const branchNames = branchesData.map((b: { name: string }) => b.name) || [];
        setAvailableBranches(branchNames);
      }
    } catch (error) {
      console.error('Error fetching available options:', error);
    }
  }, [user, repo]);

  // Fetch available options when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      fetchAvailableOptions();
    }
  }, [isEditMode, fetchAvailableOptions]);

  // Filter suggestions based on input
  const getFilteredWorkflowSuggestions = () => {
    if (!newWorkflow.trim()) return availableWorkflows;
    return availableWorkflows.filter(workflow => {
      const searchLower = newWorkflow.toLowerCase();
      const nameMatch = workflow.name.toLowerCase().includes(searchLower);
      const pathMatch = workflow.path.toLowerCase().includes(searchLower);
      
      // Check if this workflow is already tracked (by name or path)
      const isTrackedByName = editedWorkflows.includes(workflow.name);
      const isTrackedByPath = editedWorkflows.includes(workflow.path);
      const isTrackedByPathMatch = editedWorkflows.some(tracked => 
        workflow.path.includes(tracked) || tracked.includes(workflow.path)
      );
      
      return (nameMatch || pathMatch) && !isTrackedByName && !isTrackedByPath && !isTrackedByPathMatch;
    });
  };

  const getFilteredBranchSuggestions = () => {
    if (!newBranch.trim()) return availableBranches;
    return availableBranches.filter(branch => 
      branch.toLowerCase().includes(newBranch.toLowerCase()) &&
      !editedBranches.includes(branch)
    );
  };

  // Render workflow suggestion item
  const renderWorkflowSuggestion = (workflow: {name: string, path: string}) => {
    return (
      <div className="workflow-suggestion">
        <div 
          className="workflow-name clickable-option"
          onClick={(e) => {
            e.stopPropagation();
            selectWorkflowByName(workflow);
          }}
          title="Click to track by workflow name"
        >
          {workflow.name}
          <span className="workflow-format-label">name</span>
        </div>
        <div 
          className="workflow-path clickable-option"
          onClick={(e) => {
            e.stopPropagation();
            selectWorkflowByPath(workflow);
          }}
          title="Click to track by workflow path"
        >
          {workflow.path}
          <span className="workflow-format-label">path</span>
        </div>
      </div>
    );
  };

  // Check if dropdown should appear above input (to avoid being cut off)
  const checkDropdownPosition = (inputRef: React.RefObject<HTMLInputElement | null>, setDropdownAbove: (above: boolean) => void) => {
    if (!inputRef.current) return;
    
    const inputRect = inputRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - inputRect.bottom;
    const spaceAbove = inputRect.top;
    
    // If there's less than 180px below but more space above, show dropdown above
    const shouldShowAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    setDropdownAbove(shouldShowAbove);
  };

  // Handle input changes with suggestion visibility
  const handleWorkflowInputChange = (value: string) => {
    setNewWorkflow(value);
    const shouldShow = value.trim().length > 0 && availableWorkflows.length > 0;
    setShowWorkflowSuggestions(shouldShow);
    setSelectedWorkflowIndex(-1);
    
    if (shouldShow) {
      setTimeout(() => checkDropdownPosition(workflowInputRef, setWorkflowDropdownAbove), 0);
    }
  };

  const handleBranchInputChange = (value: string) => {
    setNewBranch(value);
    const shouldShow = value.trim().length > 0 && availableBranches.length > 0;
    setShowBranchSuggestions(shouldShow);
    setSelectedBranchIndex(-1);
    
    if (shouldShow) {
      setTimeout(() => checkDropdownPosition(branchInputRef, setBranchDropdownAbove), 0);
    }
  };

  // Handle keyboard navigation for suggestions
  const handleWorkflowKeyDown = (e: React.KeyboardEvent) => {
    if (!showWorkflowSuggestions) {
      if (e.key === 'Enter') {
        addWorkflow();
      }
      return;
    }

    const suggestions = getFilteredWorkflowSuggestions();
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedWorkflowIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedWorkflowIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedWorkflowIndex >= 0 && suggestions[selectedWorkflowIndex]) {
        selectWorkflowSuggestion(suggestions[selectedWorkflowIndex]);
      } else {
        addWorkflow();
      }
    } else if (e.key === 'Escape') {
      setShowWorkflowSuggestions(false);
      setSelectedWorkflowIndex(-1);
    }
  };

  const handleBranchKeyDown = (e: React.KeyboardEvent) => {
    if (!showBranchSuggestions) {
      if (e.key === 'Enter') {
        addBranch();
      }
      return;
    }

    const suggestions = getFilteredBranchSuggestions();
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedBranchIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedBranchIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedBranchIndex >= 0 && suggestions[selectedBranchIndex]) {
        selectBranchSuggestion(suggestions[selectedBranchIndex]);
      } else {
        addBranch();
      }
    } else if (e.key === 'Escape') {
      setShowBranchSuggestions(false);
      setSelectedBranchIndex(-1);
    }
  };

  // Handle suggestion selection by format
  const selectWorkflowByName = (workflow: {name: string, path: string}) => {
    setNewWorkflow(workflow.name);
    setShowWorkflowSuggestions(false);
    setSelectedWorkflowIndex(-1);
  };

  const selectWorkflowByPath = (workflow: {name: string, path: string}) => {
    setNewWorkflow(workflow.path);
    setShowWorkflowSuggestions(false);
    setSelectedWorkflowIndex(-1);
  };

  // Handle suggestion selection (default behavior)
  const selectWorkflowSuggestion = (workflow: {name: string, path: string}) => {
    selectWorkflowByName(workflow);
  };

  const selectBranchSuggestion = (branch: string) => {
    setNewBranch(branch);
    setShowBranchSuggestions(false);
    setSelectedBranchIndex(-1);
  };

  const addWorkflow = () => {
    if (newWorkflow.trim() && !editedWorkflows.includes(newWorkflow.trim())) {
      setEditedWorkflows([...editedWorkflows, newWorkflow.trim()]);
      setNewWorkflow('');
      setShowWorkflowSuggestions(false);
    }
  };

  const removeWorkflow = (workflow: string) => {
    setEditedWorkflows(editedWorkflows.filter(w => w !== workflow));
  };

  const addBranch = () => {
    if (newBranch.trim() && !editedBranches.includes(newBranch.trim())) {
      setEditedBranches([...editedBranches, newBranch.trim()]);
      setNewBranch('');
      setShowBranchSuggestions(false);
    }
  };

  const removeBranch = (branch: string) => {
    setEditedBranches(editedBranches.filter(b => b !== branch));
  };

  const saveChanges = async () => {
    if (!user) return;

    console.log('Saving changes:', {
      userId: user.id,
      repositoryId: repo.repository.id,
      editedWorkflows,
      editedBranches
    });

    setIsSaving(true);
    try {
      const url = `/api/repositories/tracked/${encodeURIComponent(user.id)}/${repo.repository.id}`;
      const payload = {
        tracked_workflows: editedWorkflows,
        tracked_branches: editedBranches,
      };
      
      console.log('API Request:', { url, payload });
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('API Response status:', response.status, response.statusText);

      if (response.ok) {
        // Update the repository object
        repo.repository.trackedWorkflowsPaths = [...editedWorkflows];
        repo.repository.trackedBranches = [...editedBranches];

        // Reload workflow details to reflect changes
        await loadWorkflowDetails();
        setIsEditMode(false);
        setNewWorkflow('');
        setNewBranch('');
        setShowWorkflowSuggestions(false);
        setShowBranchSuggestions(false);
        setSelectedWorkflowIndex(-1);
        setSelectedBranchIndex(-1);
      } else {
        const errorData = await response.text();
        console.error('API Error Response:', errorData);
        throw new Error(`Failed to save changes: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error saving changes:', error);
      alert(`Failed to save changes: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  // Find workflow details for display
  const findWorkflowDetails = (trackedItem: string) => {
    // Find workflow object that matches either name or path
    const workflowObj = availableWorkflows.find(w => 
      w.name === trackedItem || w.path === trackedItem
    );
    
    if (workflowObj) {
      return workflowObj;
    }
    
    // If not found in available workflows, create a fallback object
    // This handles cases where the tracked item might be a partial path or custom name
    const isPath = trackedItem.includes('/') || trackedItem.includes('.');
    return {
      name: isPath ? trackedItem.split('/').pop()?.replace(/\.(yml|yaml)$/, '') || trackedItem : trackedItem,
      path: isPath ? trackedItem : `Unknown path for: ${trackedItem}`
    };
  };

  // Render tracked workflow item
  const renderTrackedWorkflow = (workflow: string, index: number) => {
    const workflowDetails = findWorkflowDetails(workflow);
    
    return (
      <div key={index} className="tracked-item">
        <div className="tracked-workflow-info">
          <div className="workflow-name">{workflowDetails.name}</div>
          <div className="workflow-path">{workflowDetails.path}</div>
        </div>
        <button 
          className="remove-item-button"
          onClick={() => removeWorkflow(workflow)}
          title="Remove workflow"
        >
          ×
        </button>
      </div>
    );
  };

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
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

  const getStatusIcon = (status: string, conclusion: string | null) => {
    if (conclusion === 'success') return '✓';
    if (conclusion === 'failure') return '✗';
    if (conclusion === 'cancelled') return '⊘';
    if (status === 'in_progress') return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2196f3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
        <circle cx="12" cy="12" r="10" stroke="#2196f3" strokeWidth="3" fill="none"/>
        <path d="M12 6v6l4 2" stroke="#1976d2"/>
      </svg>
    );
    if (status === 'queued') return '○';
    if (status === 'pending') return '○';
    if (status === 'completed' && !conclusion) return '○';
    if (status === 'completed') return '○';
    return '?';
  };

  const normalizeStatus = (status: string, conclusion: string | null) => {
    if (conclusion === 'success') return 'success';
    if (conclusion === 'failure') return 'failure';
    if (conclusion === 'cancelled') return 'cancelled';
    if (status === 'in_progress') return 'running';
    if (status === 'queued' || status === 'pending') return 'pending';
    if (status === 'completed' && !conclusion) return 'pending'; // Treat completed without conclusion as pending
    if (status === 'completed') return 'pending'; // Default completed to pending until we have a conclusion
    return 'unknown';
  };

  const truncateSha = (sha: string) => {
    return sha?.substring(0, 7) || '';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="workflow-detail-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'auto',
          minWidth: 540,
          maxWidth: '90vw',
          maxHeight: '95vh',
          height: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="modal-header">
          <div className="modal-title">
            <h2>
              <a href={repo.repository.url} target="_blank" rel="noopener noreferrer">
                {repo.repository.displayName || repo.repository.name}
              </a>
            </h2>
            <span className="modal-subtitle">Workflow Details</span>
          </div>
          <div className="modal-actions">
            {!isEditMode ? (
              <>
                <button className="modal-edit-button" onClick={enterEditMode} title="Edit tracked workflows and branches">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  className="modal-refresh-button"
                  onClick={async () => {
                    if (!user) return;
                    setIsLoading(true);
                    setError(null);
                    try {
                      const response = await fetch(`/api/workflows/refresh/${encodeURIComponent(user.id)}/${repo.repository.id}`, { method: 'POST' });
                      if (response.ok) {
                        const data = await response.json();
                        setRepositoryData(data);
                      } else {
                        throw new Error('Failed to refresh workflows');
                      }
                    } catch (error) {
                      console.error('Error refreshing workflows:', error);
                      setError(error instanceof Error ? error.message : 'Failed to refresh workflows');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  title="Refresh"
                >
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
              </>
            ) : (
              <>
                <button className="modal-save-button" onClick={saveChanges} disabled={isSaving} title="Save changes">
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button className="modal-cancel-button" onClick={exitEditMode} title="Cancel editing">
                  Cancel
                </button>
              </>
            )}
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
          ) : isEditMode ? (
            <div className="edit-mode">
              <div className="edit-section">
                <h3>Tracked Workflows</h3>
                <div className="tracked-items">
                  {editedWorkflows.map((workflow, index) => 
                    renderTrackedWorkflow(workflow, index)
                  )}
                  {editedWorkflows.length === 0 && (
                    <p className="empty-state">No workflows tracked (all workflows will be monitored)</p>
                  )}
                </div>
                <div className="add-item-form">
                  <div className={`input-with-suggestions ${showWorkflowSuggestions ? 'has-suggestions' : ''} ${workflowDropdownAbove ? 'dropdown-above' : ''}`}>
                    <input
                      ref={workflowInputRef}
                      type="text"
                      value={newWorkflow}
                      onChange={(e) => handleWorkflowInputChange(e.target.value)}
                      onKeyDown={handleWorkflowKeyDown}
                      onFocus={() => {
                        const shouldShow = newWorkflow.trim().length > 0 && availableWorkflows.length > 0;
                        setShowWorkflowSuggestions(shouldShow);
                        if (shouldShow) {
                          setTimeout(() => checkDropdownPosition(workflowInputRef, setWorkflowDropdownAbove), 0);
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowWorkflowSuggestions(false), 150)}
                      placeholder="Enter workflow name..."
                      className="add-item-input"
                    />
                    {showWorkflowSuggestions && (
                      <div className="suggestions-dropdown">
                        {getFilteredWorkflowSuggestions().slice(0, 10).map((workflow, index) => (
                          <div
                            key={index}
                            className={`suggestion-item ${selectedWorkflowIndex === index ? 'suggestion-selected' : ''}`}
                            onMouseDown={() => selectWorkflowSuggestion(workflow)}
                            onMouseEnter={() => setSelectedWorkflowIndex(index)}
                          >
                            {renderWorkflowSuggestion(workflow)}
                          </div>
                        ))}
                        {getFilteredWorkflowSuggestions().length === 0 && (
                          <div className="suggestion-item suggestion-empty">
                            No matching workflows found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button 
                    className="add-item-button"
                    onClick={addWorkflow}
                    disabled={!newWorkflow.trim() || editedWorkflows.includes(newWorkflow.trim())}
                  >
                    Add Workflow
                  </button>
                </div>
              </div>

              <div className="edit-section">
                <h3>Tracked Branches</h3>
                <div className="tracked-items">
                  {editedBranches.map((branch, index) => (
                    <div key={index} className="tracked-item">
                      <span>{branch}</span>
                      <button 
                        className="remove-item-button"
                        onClick={() => removeBranch(branch)}
                        title="Remove branch"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {editedBranches.length === 0 && (
                    <p className="empty-state">No branches tracked</p>
                  )}
                </div>
                <div className="add-item-form">
                  <div className={`input-with-suggestions ${showBranchSuggestions ? 'has-suggestions' : ''} ${branchDropdownAbove ? 'dropdown-above' : ''}`}>
                    <input
                      ref={branchInputRef}
                      type="text"
                      value={newBranch}
                      onChange={(e) => handleBranchInputChange(e.target.value)}
                      onKeyDown={handleBranchKeyDown}
                      onFocus={() => {
                        const shouldShow = newBranch.trim().length > 0 && availableBranches.length > 0;
                        setShowBranchSuggestions(shouldShow);
                        if (shouldShow) {
                          setTimeout(() => checkDropdownPosition(branchInputRef, setBranchDropdownAbove), 0);
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowBranchSuggestions(false), 150)}
                      placeholder="Enter branch name..."
                      className="add-item-input"
                    />
                    {showBranchSuggestions && (
                      <div className="suggestions-dropdown">
                        {getFilteredBranchSuggestions().slice(0, 10).map((branch, index) => (
                          <div
                            key={index}
                            className={`suggestion-item ${selectedBranchIndex === index ? 'suggestion-selected' : ''}`}
                            onMouseDown={() => selectBranchSuggestion(branch)}
                            onMouseEnter={() => setSelectedBranchIndex(index)}
                          >
                            {branch}
                          </div>
                        ))}
                        {getFilteredBranchSuggestions().length === 0 && (
                          <div className="suggestion-item suggestion-empty">
                            No matching branches found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button 
                    className="add-item-button"
                    onClick={addBranch}
                    disabled={!newBranch.trim() || editedBranches.includes(newBranch.trim())}
                  >
                    Add Branch
                  </button>
                </div>
              </div>
            </div>
          ) : repositoryData ? (
            <>
              {!isEditMode && repositoryData && (
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <label htmlFor="branch-selector">Branch: </label>
                  <select
                    id="branch-selector"
                    value={selectedBranch || ''}
                    onChange={e => setSelectedBranch(e.target.value || null)}
                  >
                    <option value="">All</option>
                    {repo.repository.trackedBranches.map(branch => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="workflow-selector">Workflow: </label>
                  <select
                    id="workflow-selector"
                    value={selectedWorkflow || ''}
                    onChange={e => setSelectedWorkflow(e.target.value || null)}
                  >
                    <option value="">All</option>
                    {repo.repository.trackedWorkflowsPaths.map(workflow => (
                      <option key={workflow} value={workflow}>{workflow}</option>
                    ))}
                  </select>
                </div>
              </div>
              )}
              {(() => {
                // Compute filteredRuns for display
                const filteredRuns: Array<{ branch: string, workflowKey: string, workflow: WorkflowStatus }> = [];
                Object.entries(repositoryData.branches)
                  .filter(([branchName]) => !selectedBranch || branchName === selectedBranch)
                  .forEach(([branchName, branchData]) => {
                    Object.entries(branchData.workflows)
                      .filter(([workflowKey, workflowRuns]) => {
                        const runs = workflowRuns as WorkflowStatus[];
                        const wf = runs[0] as WorkflowStatus;
                        if (!selectedWorkflow) return true;
                        return (
                          workflowKey === selectedWorkflow ||
                          wf.name === selectedWorkflow ||
                          wf.workflow_path === selectedWorkflow
                        );
                      })
                      .forEach(([workflowKey, workflowRuns]) => {
                        const runs = workflowRuns as WorkflowStatus[];
                        if (runs.length === 0) return; // Skip empty workflows
                        // Use the first run as the representative workflow status
                        const wf = runs[0] as WorkflowStatus;
                        if (wf.status !== 'no_runs') {
                          filteredRuns.push({ branch: branchName, workflowKey, workflow: wf });
                        }
                      });
                  });
                // Order filteredRuns by normalized status, then by updatedAt (descending)
                const statusOrder = ['running', 'failure', 'pending', 'cancelled', 'unknown', 'success'];
                filteredRuns.sort((a, b) => {
                  const statusA = normalizeStatus(a.workflow.status, a.workflow.conclusion);
                  const statusB = normalizeStatus(b.workflow.status, b.workflow.conclusion);
                  const statusDiff = statusOrder.indexOf(statusA) - statusOrder.indexOf(statusB);
                  if (statusDiff !== 0) return statusDiff;
                  // Secondary sort: most recent updatedAt first
                  const dateA = a.workflow.updatedAt ? new Date(a.workflow.updatedAt).getTime() : 0;
                  const dateB = b.workflow.updatedAt ? new Date(b.workflow.updatedAt).getTime() : 0;
                  return dateB - dateA;
                });
                // Color map for status
                const statusColors: Record<string, string> = {
                  success: '#e6f4ea',
                  failure: '#fdecea',
                  pending: '#fff3cd', 
                  cancelled: '#f5f5f5',
                  running: '#e3f2fd',
                  unknown: '#f5f5f5',
                };
                const statusBorderColors: Record<string, string> = {
                  success: '#43a047',
                  failure: '#e53935',
                  pending: '#888',
                  cancelled: '#888',
                  running: '#1976d2',
                  unknown: '#888',
                };
                // --- Collect all runs for analytics ---
                const allRunsForAnalytics: Array<{ branch: string, workflowKey: string, workflow: WorkflowStatus[] }> = [];
                Object.entries(repositoryData.branches)
                  .filter(([branchName]) => !selectedBranch || branchName === selectedBranch)
                  .forEach(([branchName, branchData]) => {
                    Object.entries(branchData.workflows)
                      .filter(([workflowKey, workflowRuns]) => {
                        if (!selectedWorkflow) return true;
                        const runs = workflowRuns as WorkflowStatus[];
                        const wf = runs[0] as WorkflowStatus;
                        return (
                          workflowKey === selectedWorkflow ||
                          (wf && (wf.name === selectedWorkflow || wf.workflow_path === selectedWorkflow))
                        );
                      })
                      .forEach(([workflowKey, workflowRuns]) => {
                        allRunsForAnalytics.push({ branch: branchName, workflowKey, workflow: workflowRuns as WorkflowStatus[] });
                      });
                  });
                // --- End collect all runs for analytics ---
                // --- Compute indications for analytics ---
                const indications = getIndications(allRunsForAnalytics);
                return ( 
                  <div className="latest-runs-list" style={{ width: '100%', marginTop: '1rem' }}>
                    {/* --- Indications Section --- */}
                    {indications && indications.length > 0 && (
                      <WorkflowIndications indications={indications} />
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', userSelect: 'none' }}>
                      <button
                        type="button"
                        aria-expanded={showLatestRuns}
                        aria-controls="latest-runs-section"
                        onClick={() => setShowLatestRuns(v => !v)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '1.1em',
                          padding: 0,
                          color: '#1976d2',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title={showLatestRuns ? 'Hide latest runs' : 'Show latest runs'}
                      >
                        <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: showLatestRuns ? 'rotate(90deg)' : 'rotate(0deg)', marginRight: 6 }}>
                          ▶
                        </span>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, flex: 'none', color: 'inherit' }}>
                          Workflows Latest Runs Status
                        </h3>
                      </button>
                      {/* Status count for filtered branch/workflow */}
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {(() => {
                          // Compute stats for filtered branches and workflows
                          const stats = { success: 0, failure: 0, pending: 0, cancelled: 0, running: 0 };
                          let runCount = 0;
                          // Collect filtered runs for display
                          const filteredRuns: Array<{ branch: string, workflowKey: string, workflow: WorkflowStatus }> = [];
                          Object.entries(repositoryData.branches)
                            .filter(([branchName]) => !selectedBranch || branchName === selectedBranch)
                            .forEach(([branchName, branchData]) => {
                              Object.entries(branchData.workflows)
                                .filter(([workflowKey, workflowRuns]) => {
                                  const runs = workflowRuns as WorkflowStatus[];
                                  if (runs.length === 0) return false; // Skip empty workflows
                                  // Check if workflow matches selected workflow
                                  const wf = runs[0] as WorkflowStatus;
                                  if (!selectedWorkflow) return true;
                                  return (
                                    workflowKey === selectedWorkflow ||
                                    wf.name === selectedWorkflow ||
                                    wf.workflow_path === selectedWorkflow
                                  );
                                })
                                .forEach(([workflowKey, workflowRuns]) => {
                                  const runs = workflowRuns as WorkflowStatus[];
                                  if (runs.length === 0) return; // Skip empty workflows
                                  // Use the first run as the representative workflow status
                                  const wf = runs[0] as WorkflowStatus;
                                  if (wf.status !== 'no_runs') {
                                    runCount++;
                                    filteredRuns.push({ branch: branchName, workflowKey, workflow: wf });
                                  }
                                  const normalizedStatus = normalizeStatus(wf.status, wf.conclusion);
                                  if (normalizedStatus === 'success') stats.success++;
                                  else if (normalizedStatus === 'failure') stats.failure++;
                                  else if (normalizedStatus === 'pending') stats.pending++;
                                  else if (normalizedStatus === 'cancelled') stats.cancelled++;
                                  else if (normalizedStatus === 'running') stats.running++;
                                });
                            });
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className="run-count" style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                                <span>{runCount}</span>
                                <span style={{ marginLeft: 4, fontWeight: 'normal' }}>run{runCount !== 1 ? 's' : ''}</span>
                              </span>
                              <div className="branch-stats">
                                {stats.running > 0 && <span className="stat running" style={{ color: '#1976d2', fontWeight: 'bold' }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2196f3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 2 }}>
                                    <circle cx="12" cy="12" r="10" stroke="#2196f3" strokeWidth="3" fill="none"/>
                                    <path d="M12 6v6l4 2" stroke="#1976d2"/>
                                  </svg>
                                  {stats.running}
                                </span>}
                                {stats.success > 0 && <span className="stat success">✓{stats.success}</span>}
                                {stats.failure > 0 && <span className="stat failure">✗{stats.failure}</span>}
                                {stats.pending > 0 && <span className="stat pending">○{stats.pending}</span>}
                                {stats.cancelled > 0 && <span className="stat cancelled">⊘{stats.cancelled}</span>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    {showLatestRuns && (
                      filteredRuns.length === 0 ? (
                        <div style={{ color: '#888', fontStyle: 'italic', marginTop: 4 }}>No runs found.</div>
                      ) : (
                        <ul id="latest-runs-section" style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0 0' }}>
                          {filteredRuns.slice(0, 10).map(({ branch, workflowKey, workflow }, idx) => {
                            const normalizedStatus = normalizeStatus(workflow.status, workflow.conclusion);
                            // Color logic for status icon background and color
                            const badgeBg: Record<string, string> = {
                              success: 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)',
                              failure: 'linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%)',
                              pending: 'linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%)',
                              cancelled: 'linear-gradient(135deg, #e2e3e5 0%, #d6d8db 100%)',
                              running: 'linear-gradient(90deg, rgba(33,150,243,0.12) 0%, rgba(33,150,243,0.06) 100%)',
                              unknown: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                            };
                            const badgeColor: Record<string, string> = {
                              success: '#155724',
                              failure: '#721c24',
                              pending: '#856404',
                              cancelled: '#495057',
                              running: '#1976d2',
                              unknown: '#6c757d',
                            };
                            return (
                              <li
                                key={branch + workflowKey + idx}
                                className={`latest-run-entry status-${normalizedStatus}`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '8px 12px',
                                  marginBottom: '6px',
                                  borderRadius: '8px',
                                  background: statusColors[normalizedStatus] || '#f5f5f5',
                                  border: `1.5px solid ${statusBorderColors[normalizedStatus] || '#888'}`,
                                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                  transition: 'background 0.2s',
                                }}
                              >
                                  <span
                                  className={`run-status-badge status-${normalizedStatus}`}
                                  style={{
                                    minWidth: 26,
                                    textAlign: 'center',
                                    fontSize: '1.2em',
                                    background: badgeBg[normalizedStatus],
                                    color: badgeColor[normalizedStatus],
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '1.5px solid transparent',
                                  }}
                                  >
                                  {getStatusIcon(workflow.status, workflow.conclusion)}
                                  </span>
                                  <span style={{ display: 'inline-block', width: '4px' }} />
                                  <span
                                    style={{ fontWeight: 600, fontSize: '1.05em', color: '#222', flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.5em' }}
                                    title={workflow.name || workflowKey}
                                  >
                                      {workflow.name || workflowKey}
                                    <span style={{ color: '#888', fontSize: '0.97em', fontWeight: 500, background: '#f0f0f0', borderRadius: '4px', padding: '2px 6px' }}>{branch}</span>
                                  </span>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                                  {workflow.updatedAt && (
                                    <span style={{ color: '#1976d2', fontSize: '0.97em', fontWeight: 500 }} title={new Date(workflow.updatedAt).toLocaleString()}>
                                      {formatRelativeTime(workflow.updatedAt)}
                                    </span>
                                  )}
                                  {workflow.commit && (
                                    <a
                                      href={`${repo.repository.url}/commit/${workflow.commit}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ color: '#1976d2', textDecoration: 'none', fontWeight: 500, fontSize: '0.97em', background: '#e3f2fd', borderRadius: '4px', padding: '2px 6px', marginLeft: '0.5em' }}
                                      title={workflow.commit}
                                    >
                                      {truncateSha(workflow.commit)}
                                    </a>
                                  )}
                                  {workflow.url && (
                                    <a
                                      href={workflow.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ marginLeft: 6, color: '#1976d2', textDecoration: 'none', fontWeight: 600, fontSize: '0.97em', borderRadius: '4px', padding: '2px 8px', background: '#e3f2fd', transition: 'background 0.2s' }}
                                    >
                                      View
                                    </a>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )
                    )}
                    {/* --- Analytics Section --- */}
                    <WorkflowHistogram runs={allRunsForAnalytics} />
                  </div>
                );
              })()}
            </>
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
