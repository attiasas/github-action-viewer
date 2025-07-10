import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './RepositorySearch.css';

interface Repository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
}

interface Workflow {
  id: number;
  name: string;
  path: string;
}

interface Branch {
  name: string;
}

interface RepositorySearchProps {
  onRepositoryAdded: () => void;
}

export default function RepositorySearch({ onRepositoryAdded }: RepositorySearchProps) {
  const { user, githubServers } = useAuth();
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Repository[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>(['main']);
  const [refreshInterval, setRefreshInterval] = useState(300);
  const [isLoading, setIsLoading] = useState(false);
  const [customBranch, setCustomBranch] = useState('');
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');

  // Set default server when servers are loaded or component mounts
  useEffect(() => {
    if (githubServers.length > 0) {
      const defaultServer = githubServers.find(server => server.is_default);
      const serverToSelect = defaultServer?.id || githubServers[0].id;
      setSelectedServer(serverToSelect);
    }
  }, [githubServers]);

  const searchRepositories = async () => {
    if (!searchQuery.trim() || !user || !selectedServer) return;

    setIsSearching(true);
    try {
      const response = await fetch(`/api/repositories/search?q=${encodeURIComponent(searchQuery)}&userId=${encodeURIComponent(user.id)}&serverId=${selectedServer}`);
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.items || []);
      } else {
        const errorData = await response.json();
        console.error('Search failed:', response.status, errorData);
        
        if (response.status === 403) {
          alert(`GitHub API Error (403): ${errorData.details || 'Access forbidden. Please check your token permissions and rate limits.'}`);
        } else if (response.status === 401) {
          alert('Authentication failed. Please check your GitHub token.');
        } else {
          alert(`Search failed: ${errorData.error || 'Unknown error'}`);
        }
        
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching repositories:', error);
      alert('Network error occurred while searching repositories.');
    } finally {
      setIsSearching(false);
    }
  };

  const selectRepository = async (repo: Repository) => {
    if (!selectedServer) return;
    
    setSelectedRepo(repo);
    setSelectedWorkflows([]);
    setSelectedBranches(['main']);
    setIsLoading(true);
    setWorkflowError(null);
    setBranchError(null);

    try {
      const [owner, repoName] = repo.full_name.split('/');
      
      // Fetch workflows
      const workflowsResponse = await fetch(`/api/repositories/${owner}/${repoName}/workflows?userId=${user?.id}&serverId=${selectedServer}`);
      if (workflowsResponse.ok) {
        const workflowsData = await workflowsResponse.json();
        console.log('Workflows response:', workflowsData);
        setWorkflows(workflowsData.workflows || []);
        setWorkflowError(null);
      } else {
        const errorData = await workflowsResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to fetch workflows:', workflowsResponse.status, errorData);
        
        let errorMessage = `Failed to load workflows (${workflowsResponse.status})`;
        if (workflowsResponse.status === 403) {
          errorMessage = `Access denied when loading workflows: ${errorData.details || 'Check your token permissions'}`;
        } else if (workflowsResponse.status === 401) {
          errorMessage = 'Authentication failed when loading workflows. Please check your GitHub token.';
        } else if (workflowsResponse.status === 404) {
          errorMessage = 'Repository workflows not found. The repository may be private or not exist.';
        } else if (errorData.details) {
          errorMessage = `Failed to load workflows: ${errorData.details}`;
        }
        
        setWorkflowError(errorMessage);
        setWorkflows([]);
      }

      // Fetch branches
      const branchesResponse = await fetch(`/api/repositories/${owner}/${repoName}/branches?userId=${user?.id}&serverId=${selectedServer}`);
      if (branchesResponse.ok) {
        const branchesData = await branchesResponse.json();
        console.log('Branches response:', branchesData);
        setBranches(branchesData || []);
        setBranchError(null);
        
        // Auto-select main/master branch if available
        const mainBranch = branchesData.find((b: Branch) => 
          b.name === 'main' || b.name === 'master'
        );
        if (mainBranch) {
          setSelectedBranches([mainBranch.name]);
        } else if (branchesData.length > 0) {
          // If no main/master branch, select the first branch
          setSelectedBranches([branchesData[0].name]);
        }
      } else {
        const errorData = await branchesResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to fetch branches:', branchesResponse.status, errorData);
        
        let errorMessage = `Failed to load branches (${branchesResponse.status})`;
        if (branchesResponse.status === 403) {
          errorMessage = `Access denied when loading branches: ${errorData.details || 'Check your token permissions'}`;
        } else if (branchesResponse.status === 401) {
          errorMessage = 'Authentication failed when loading branches. Please check your GitHub token.';
        } else if (branchesResponse.status === 404) {
          errorMessage = 'Repository branches not found. The repository may be private or not exist.';
        } else if (errorData.details) {
          errorMessage = `Failed to load branches: ${errorData.details}`;
        }
        
        setBranchError(errorMessage);
        // Fallback: provide common branch names
        setBranches([
          { name: 'main' },
          { name: 'master' },
          { name: 'develop' },
          { name: 'dev' }
        ]);
        setSelectedBranches(['main']);
      }
    } catch (error) {
      console.error('Error fetching repository details:', error);
      setWorkflowError('Network error occurred while loading workflows');
      setBranchError('Network error occurred while loading branches');
    } finally {
      setIsLoading(false);
    }
  };

  const addRepository = async () => {
    if (!selectedRepo || !user || !selectedServer || selectedBranches.length === 0) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/repositories/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          githubServerId: selectedServer,
          repositoryName: selectedRepo.full_name,
          repositoryUrl: selectedRepo.html_url,
          trackedBranches: selectedBranches,
          trackedWorkflows: selectedWorkflows,
          autoRefreshInterval: refreshInterval,
          displayName: displayName.trim() || null,
        }),
      });

      if (response.ok) {
        setSelectedRepo(null);
        setSearchResults([]);
        setSearchQuery('');
        setDisplayName('');
        onRepositoryAdded();
      }
    } catch (error) {
      console.error('Error adding repository:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleWorkflow = (workflowPath: string) => {
    setSelectedWorkflows(prev => 
      prev.includes(workflowPath)
        ? prev.filter(w => w !== workflowPath)
        : [...prev, workflowPath]
    );
  };

  const toggleBranch = (branchName: string) => {
    setSelectedBranches(prev => 
      prev.includes(branchName)
        ? prev.filter(b => b !== branchName)
        : [...prev, branchName]
    );
  };

  const addCustomBranch = () => {
    if (customBranch.trim() && !selectedBranches.includes(customBranch.trim())) {
      const newBranch = { name: customBranch.trim() };
      setBranches(prev => [...prev, newBranch]);
      setSelectedBranches(prev => [...prev, customBranch.trim()]);
      setCustomBranch('');
    }
  };

  return (
    <div className="repository-search">
      <div className="server-selection">
        <label htmlFor="github-server">GitHub Server:</label>
        <select 
          id="github-server"
          value={selectedServer || ''}
          onChange={(e) => setSelectedServer(e.target.value ? Number(e.target.value) : null)}
          className="server-select"
        >
          <option value="">Select a GitHub server...</option>
          {githubServers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.server_name} ({server.server_url})
              {server.is_default ? ' (Default)' : ''}
            </option>
          ))}
        </select>
        {githubServers.length === 0 && (
          <p className="no-servers-message">
            No GitHub servers configured. Please add a GitHub server in Settings.
          </p>
        )}
      </div>

      <div className="search-input-container">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search repositories..."
          className="search-input"
          onKeyPress={(e) => e.key === 'Enter' && searchRepositories()}
          disabled={!selectedServer}
        />
        <button 
          onClick={searchRepositories} 
          disabled={isSearching || !searchQuery.trim() || !selectedServer}
          className="search-button"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {searchResults.length > 0 && !selectedRepo && (
        <div className="search-results">
          <h4>Search Results:</h4>
          {searchResults.map(repo => (
            <div key={repo.id} className="search-result-item">
              <div className="repo-info">
                <h5>{repo.full_name}</h5>
                {repo.description && <p>{repo.description}</p>}
              </div>
              <button onClick={() => selectRepository(repo)} className="select-button">
                Select
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedRepo && (
        <div className="repository-config">
          <h4>Configure: {selectedRepo.full_name}</h4>
          
          <div className="config-section">
            <h5>Select Branches to Track:</h5>
            {isLoading ? (
              <p>Loading branches...</p>
            ) : branchError ? (
              <div className="error-message">
                <p className="error-text">{branchError}</p>
                <div className="custom-branch-input">
                  <input
                    type="text"
                    value={customBranch}
                    onChange={(e) => setCustomBranch(e.target.value)}
                    placeholder="Enter branch name manually"
                    onKeyPress={(e) => e.key === 'Enter' && addCustomBranch()}
                  />
                  <button type="button" onClick={addCustomBranch} className="add-branch-button">
                    Add Branch
                  </button>
                </div>
              </div>
            ) : branches.length > 0 ? (
              <div className="selection-container">
                <div className="selection-header">
                  <span className="selection-label">
                    {selectedBranches.length > 0 
                      ? `${selectedBranches.length} branch${selectedBranches.length === 1 ? '' : 'es'} selected`
                      : 'No branches selected'
                    }
                  </span>
                  {selectedBranches.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedBranches([])}
                      className="clear-all-button"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="multi-select">
                  <div className="selected-items">
                    {selectedBranches.map(branch => (
                      <div key={branch} className="selected-item">
                        <span>{branch}</span>
                        <button
                          type="button"
                          onClick={() => toggleBranch(branch)}
                          className="remove-item"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {selectedBranches.length === 0 && (
                      <span className="placeholder">Select branches...</span>
                    )}
                  </div>
                  <div className="available-items">
                    {branches
                      .filter(branch => !selectedBranches.includes(branch.name))
                      .map(branch => (
                        <button
                          key={branch.name}
                          type="button"
                          onClick={() => toggleBranch(branch.name)}
                          className="available-item"
                        >
                          + {branch.name}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p>No branches found or failed to load branches.</p>
                <div className="custom-branch-input">
                  <input
                    type="text"
                    value={customBranch}
                    onChange={(e) => setCustomBranch(e.target.value)}
                    placeholder="Enter branch name manually"
                    onKeyPress={(e) => e.key === 'Enter' && addCustomBranch()}
                  />
                  <button type="button" onClick={addCustomBranch} className="add-branch-button">
                    Add Branch
                  </button>
                </div>
              </div>
            )}
            
            {branches.length > 0 && !branchError && (
              <div className="custom-branch-input">
                <input
                  type="text"
                  value={customBranch}
                  onChange={(e) => setCustomBranch(e.target.value)}
                  placeholder="Add another branch manually"
                  onKeyPress={(e) => e.key === 'Enter' && addCustomBranch()}
                />
                <button type="button" onClick={addCustomBranch} className="add-branch-button">
                  Add Branch
                </button>
              </div>
            )}
          </div>

          <div className="config-section">
            <h5>Select Workflows to Track (optional):</h5>
            {isLoading ? (
              <p>Loading workflows...</p>
            ) : workflowError ? (
              <div className="error-message">
                <p className="error-text">{workflowError}</p>
                <p className="fallback-message">All workflow actions will be tracked for this repository.</p>
              </div>
            ) : workflows.length > 0 ? (
              <div className="selection-container">
                <div className="selection-header">
                  <span className="selection-label">
                    {selectedWorkflows.length > 0 
                      ? `${selectedWorkflows.length} workflow${selectedWorkflows.length === 1 ? '' : 's'} selected`
                      : 'All workflows will be tracked'
                    }
                  </span>
                  {selectedWorkflows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedWorkflows([])}
                      className="clear-all-button"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="multi-select">
                  <div className="selected-items">
                    {selectedWorkflows.map(workflowPath => {
                      const workflow = workflows.find(w => w.path === workflowPath);
                      return (
                        <div key={workflowPath} className="selected-item">
                          <span>{workflow?.name || workflowPath}</span>
                          <button
                            type="button"
                            onClick={() => toggleWorkflow(workflowPath)}
                            className="remove-item"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    {selectedWorkflows.length === 0 && (
                      <span className="placeholder">All workflows will be tracked (or select specific ones)</span>
                    )}
                  </div>
                  <div className="available-items">
                    {workflows
                      .filter(workflow => !selectedWorkflows.includes(workflow.path))
                      .map(workflow => (
                        <button
                          key={workflow.id}
                          type="button"
                          onClick={() => toggleWorkflow(workflow.path)}
                          className="available-item"
                        >
                          + {workflow.name}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <p>No workflows found (all actions will be tracked)</p>
            )}
          </div>

          <div className="config-section">
            <h5>Auto-refresh Interval (seconds):</h5>
            <input
              type="number"
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              min="30"
              max="3600"
              className="interval-input"
            />
          </div>

          <div className="config-section">
            <h5>Display Name (optional):</h5>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Custom name for this repository"
              className="display-name-input"
            />
            <small className="input-help">
              Leave empty to use the repository name ({selectedRepo?.full_name})
            </small>
          </div>

          <div className="config-actions">
            <button onClick={addRepository} disabled={isLoading || selectedBranches.length === 0} className="add-button">
              {isLoading ? 'Adding...' : 'Add Repository'}
            </button>
            <button onClick={() => {
              setSelectedRepo(null);
              setDisplayName('');
            }} className="cancel-button">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
