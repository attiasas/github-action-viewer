import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './WorkflowDetailModal.css';

interface Repository {
  id: number;
  repository_name: string;
  repository_url: string;
  display_name?: string;
  tracked_workflows: string[];
  tracked_branches: string[];
  github_server_id: number;
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
  workflow_path?: string;
}

interface DetailedWorkflowStatus {
  repository: string;
  repositoryUrl: string;
  repoId: number;
  branches: Record<string, {
    workflows: Record<string, WorkflowRun | { status: 'no_runs'; conclusion: null; name: string; workflow_id: number; workflow_path?: string; }>;
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
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedWorkflows, setEditedWorkflows] = useState<string[]>([]);
  const [editedBranches, setEditedBranches] = useState<string[]>([]);
  const [newWorkflow, setNewWorkflow] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
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

  // Initialize edit state when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      setEditedWorkflows([...repository.tracked_workflows]);
      setEditedBranches([...repository.tracked_branches]);
    }
  }, [isEditMode, repository.tracked_workflows, repository.tracked_branches]);

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
    if (!user || !repository) return;

    try {
      // Extract owner and repo from repository name
      const [owner, repo] = repository.repository_name.split('/');
      
      // Fetch workflows
      const workflowsResponse = await fetch(`/api/repositories/${owner}/${repo}/workflows?userId=${encodeURIComponent(user.id)}&serverId=${repository.github_server_id}`);
      if (workflowsResponse.ok) {
        const workflowsData = await workflowsResponse.json();
        const workflowItems = workflowsData.workflows?.map((w: { name: string, path: string }) => ({
          name: w.name,
          path: w.path
        })) || [];
        setAvailableWorkflows(workflowItems);
      }

      // Fetch branches
      const branchesResponse = await fetch(`/api/repositories/${owner}/${repo}/branches?userId=${encodeURIComponent(user.id)}&serverId=${repository.github_server_id}`);
      if (branchesResponse.ok) {
        const branchesData = await branchesResponse.json();
        const branchNames = branchesData.map((b: { name: string }) => b.name) || [];
        setAvailableBranches(branchNames);
      }
    } catch (error) {
      console.error('Error fetching available options:', error);
    }
  }, [user, repository]);

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
      repositoryId: repository.id,
      editedWorkflows,
      editedBranches
    });

    setIsSaving(true);
    try {
      const url = `/api/repositories/tracked/${encodeURIComponent(user.id)}/${repository.id}`;
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
        repository.tracked_workflows = [...editedWorkflows];
        repository.tracked_branches = [...editedBranches];
        
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
    if (status === 'queued') return 'Pending';
    if (status === 'pending') return 'Pending';
    if (status === 'completed' && !conclusion) return 'Pending'; // Completed but no conclusion means still pending
    if (status === 'completed') return 'Pending'; // Default completed to pending until we have a conclusion
    // Fallback for any unexpected values - treat as pending if no conclusion
    return conclusion ? (conclusion.charAt(0).toUpperCase() + conclusion.slice(1)) : 'Pending';
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

  // Add missing getStatusPriority and truncateSha for workflow sorting and commit display
  const getStatusPriority = (status: string, conclusion: string | null) => {
    if (status === 'in_progress') return 1;
    if (conclusion === 'failure') return 2;
    if (conclusion === 'cancelled') return 3;
    if (conclusion === 'success') return 4;
    if (status === 'queued' || status === 'pending') return 5;
    return 6;
  };

  const truncateSha = (sha: string) => {
    return sha?.substring(0, 7) || '';
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
            {!isEditMode ? (
              <>
                <button className="modal-edit-button" onClick={enterEditMode} title="Edit tracked workflows and branches">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
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
                        <span className="branch-name" title={branchName}>{branchName}</span>
                      </h3>
                      {!branchData.error && (
                        <div className="branch-summary">
                          <span className="workflow-count">
                            {Object.keys(branchData.workflows).length} workflow{Object.keys(branchData.workflows).length !== 1 ? 's' : ''}
                          </span>
                          <div className="branch-stats">
                            {(() => {
                              const stats = { success: 0, failure: 0, pending: 0, cancelled: 0, running: 0 };
                              Object.values(branchData.workflows).forEach(workflow => {
                                const normalizedStatus = normalizeStatus(workflow.status, workflow.conclusion);
                                if (normalizedStatus === 'success') stats.success++;
                                else if (normalizedStatus === 'failure') stats.failure++;
                                else if (normalizedStatus === 'pending') stats.pending++;
                                else if (normalizedStatus === 'cancelled') stats.cancelled++;
                                else if (normalizedStatus === 'running') stats.running++;
                              });
                              return (
                                <>
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
                                          <div className="workflow-title-section">
                                            <h4 className="workflow-name">{workflowName}</h4>
                                            {'html_url' in workflow && workflow.html_url && (
                                              <a 
                                                href={workflow.html_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="action-button compact"
                                                aria-label={`View workflow run for ${workflowName}`}
                                              >
                                                <span>View Run</span>
                                                <span className="button-icon">→</span>
                                              </a>
                                            )}
                                          </div>
                                        </div>

                                        {workflow.workflow_path && (
                                          <div className="workflow-path">
                                            <span className="meta-label">Path:</span>
                                            <a 
                                              href={`${repository.repository_url}/blob/${branchName}/${workflow.workflow_path}`}
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="path-link"
                                              title={workflow.workflow_path}
                                            >
                                              {workflow.workflow_path}
                                            </a>
                                          </div>
                                        )}
                                        
                                        <div className="workflow-meta">
                                          {'run_number' in workflow && (
                                            <div className="meta-item">
                                              <span className="meta-label">Run:</span>
                                              <span className="workflow-run-number">
                                                #{workflow.run_number}
                                              </span>
                                            </div>
                                          )}
                                          
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
