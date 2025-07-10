import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RepositorySearch from '../components/RepositorySearch';
import RepositoryList from '../components/RepositoryList';
import './DashboardPage.css';

interface Repository {
  id: number;
  repository_name: string;
  repository_url: string;
  github_server_id: number;
  tracked_branches: string[];
  tracked_workflows: string[];
  auto_refresh_interval: number;
  display_name?: string;
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
  status: string; // New field for overall repository status
  isRefreshing?: boolean; // Optional field for tracking refresh state
  hasError?: boolean; // Optional field for error state
  error?: string; // Optional field for error message
}

export default function DashboardPage() {
  const { user, logout, githubServers, loadGitHubServers } = useAuth();
  const location = useLocation();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [actionStats, setActionStats] = useState<ActionStatistics[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(true); // Start as true for initial loading
  const [isValidatingServers, setIsValidatingServers] = useState(false);
  const hasInitiallyLoaded = useRef(false);

  // Load action statistics with real-time updates
  const loadActionStats = useCallback(async (forceRefresh = false, reposToUse?: Repository[]) => {
    if (!user) return;
    
    console.log(`🚀 [Dashboard] BULK REFRESH CALL STARTING ${forceRefresh ? '(FORCE) ' : ''}for all repositories (user: ${user.id})`);
    
    setIsLoadingStats(true);
    try {
      // Use provided repositories (required parameter now)
      const reposToRefresh = reposToUse || [];
      
      if (reposToRefresh.length === 0) {
        // No repositories to refresh
        console.log(`📊 [Dashboard] No repositories to refresh`);
        setIsLoadingStats(false);
        return;
      }
      
      console.log(`📊 [Dashboard] Starting individual refresh for ${reposToRefresh.length} repositories`);
      
      // Mark all repositories as refreshing in the UI without changing their position
      setActionStats(prevStats => {
        const updatedStats = [...prevStats];
        
        // Only update existing repositories to refreshing state
        // New repositories will be added when their refresh completes
        reposToRefresh.forEach(repo => {
          const existingIndex = updatedStats.findIndex(stat => stat.repoId === repo.id);
          
          if (existingIndex >= 0) {
            // Update existing repository to refreshing state without changing position
            updatedStats[existingIndex] = {
              ...updatedStats[existingIndex],
              status: 'refreshing',
              isRefreshing: true
            };
          }
          // Don't add new repositories here - wait for refresh completion
          // This prevents position changes during bulk refresh operations
        });
        
        return updatedStats;
      });
      
      const startTime = Date.now();
      let completedCount = 0;
      
      // Refresh each repository individually and update UI immediately
      const refreshPromises = reposToRefresh.map(async (repo, index) => {
        try {
          console.log(`📋 [Dashboard] Refreshing repository ${repo.repository_name} (${index + 1}/${reposToRefresh.length})`);
          
          const encodedUserId = encodeURIComponent(user.id);
          const url = forceRefresh 
            ? `/api/actions/refresh/${encodedUserId}/${repo.id}?force=true`
            : `/api/actions/refresh/${encodedUserId}/${repo.id}`;
          
          const repoStartTime = Date.now();
          const response = await fetch(url, { method: 'POST' });
          const repoEndTime = Date.now();
          
          if (response.ok) {
            const repoStats = await response.json();
            completedCount++;
            
            console.log(`✅ [Dashboard] Repository ${repo.repository_name} completed (${completedCount}/${reposToRefresh.length}) (took ${repoEndTime - repoStartTime}ms)`);
            
            // Update UI immediately for this specific repository
            setActionStats(prevStats => {
              const updatedStats = [...prevStats];
              const repoIndex = updatedStats.findIndex(stat => stat.repoId === repo.id);
              
              if (repoIndex >= 0) {
                // Update existing repository in place
                updatedStats[repoIndex] = { ...repoStats, isRefreshing: false };
              } else {
                // Add new repository at the end (only when refresh completes)
                updatedStats.push({ ...repoStats, isRefreshing: false });
              }
              
              return updatedStats;
            });
          } else {
            completedCount++;
            console.error(`❌ [Dashboard] Repository ${repo.repository_name} failed (${completedCount}/${reposToRefresh.length}): ${response.status} ${response.statusText}`);
            
            // Update UI with error state for this repository
            setActionStats(prevStats => {
              const updatedStats = [...prevStats];
              const repoIndex = updatedStats.findIndex(stat => stat.repoId === repo.id);
              
              if (repoIndex >= 0) {
                updatedStats[repoIndex] = {
                  ...updatedStats[repoIndex],
                  status: 'error',
                  hasError: true,
                  error: `HTTP ${response.status}: ${response.statusText}`,
                  isRefreshing: false
                } as ActionStatistics;
              }
              
              return updatedStats;
            });
          }
        } catch (error) {
          completedCount++;
          console.error(`💥 [Dashboard] Repository ${repo.repository_name} error (${completedCount}/${reposToRefresh.length}):`, error);
          
          // Update UI with error state for this repository
          setActionStats(prevStats => {
            const updatedStats = [...prevStats];
            const repoIndex = updatedStats.findIndex(stat => stat.repoId === repo.id);
            
            if (repoIndex >= 0) {
              updatedStats[repoIndex] = {
                ...updatedStats[repoIndex],
                status: 'error',
                hasError: true,
                error: error instanceof Error ? error.message : 'Unknown error',
                isRefreshing: false
              } as ActionStatistics;
            }
            
            return updatedStats;
          });
        }
      });
      
      // Wait for all repositories to complete
      await Promise.all(refreshPromises);
      
      const endTime = Date.now();
      console.log(`🏁 [Dashboard] BULK REFRESH CALL COMPLETED for ${reposToRefresh.length} repositories (total call duration: ${endTime - startTime}ms)`);
      
    } catch (error) {
      console.error('💥 [Dashboard] BULK REFRESH CALL ERROR:', error);
    } finally {
      setIsLoadingStats(false);
    }
  }, [user]); // Only depend on user since repositories are passed as parameter

  // Load cached action statistics (used when coming from Settings page)
  const loadCachedActionStats = useCallback(async (repositories: Repository[]) => {
    if (!user || repositories.length === 0) return;
    
    console.log(`🔄 [Dashboard] Loading cached stats for ${repositories.length} repositories from Settings navigation`);
    
    try {
      const response = await fetch(`/api/actions/stats/${encodeURIComponent(user.id)}`);
      if (response.ok) {
        const cachedStats = await response.json();
        console.log(`📊 [Dashboard] Loaded ${cachedStats.length} cached repository stats`);
        setActionStats(cachedStats);
        setIsLoadingStats(false);
        return true; // Successfully loaded cached data
      } else {
        console.warn(`⚠️ [Dashboard] Failed to load cached stats: ${response.status}`);
        return false; // Failed to load cached data
      }
    } catch (error) {
      console.error('💥 [Dashboard] Error loading cached stats:', error);
      return false; // Failed to load cached data
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    
    const initializeData = async () => {
      console.log(`🔄 [Dashboard] Initializing data for user: ${user.id}`);
      
      // Load repositories first
      try {
        const response = await fetch(`/api/repositories/tracked/${encodeURIComponent(user.id)}`);
        if (response.ok) {
          const repos = await response.json();
          setRepositories(repos);
          setError(null);
          
          // Only load stats if we have repositories and haven't loaded yet
          if (repos.length > 0 && !hasInitiallyLoaded.current) {
            console.log(`🔄 [Dashboard] Found ${repos.length} repositories, checking if coming from Settings`);
            hasInitiallyLoaded.current = true;
            
            // Check if coming from Settings page to use cached data
            const isFromSettings = location.state?.fromSettings === true;
            
            if (isFromSettings) {
              console.log(`🔄 [Dashboard] Coming from Settings, attempting to load cached stats`);
              const cachedLoaded = await loadCachedActionStats(repos);
              if (!cachedLoaded) {
                console.log(`🔄 [Dashboard] Failed to load cached stats, falling back to fresh data`);
                // Fallback to fresh data if cached loading fails
                const initialStats: ActionStatistics[] = repos.map((repo: Repository) => ({
                  repository: repo.repository_name,
                  repositoryUrl: repo.repository_url,
                  repoId: repo.id,
                  branches: {},
                  overall: { success: 0, failure: 0, pending: 0, cancelled: 0 },
                  status: 'refreshing',
                  isRefreshing: true
                }));
                setActionStats(initialStats);
                await loadActionStats(true, repos);
              }
            } else {
              console.log(`🔄 [Dashboard] Normal navigation, loading fresh stats`);
              // Normal initialization with fresh data
              const initialStats: ActionStatistics[] = repos.map((repo: Repository) => ({
                repository: repo.repository_name,
                repositoryUrl: repo.repository_url,
                repoId: repo.id,
                branches: {},
                overall: { success: 0, failure: 0, pending: 0, cancelled: 0 },
                status: 'refreshing',
                isRefreshing: true
              }));
              setActionStats(initialStats);
              await loadActionStats(true, repos);
            }
          } else {
            setIsLoadingStats(false);
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          setError(`Failed to load repositories: ${errorData.error || 'Please check your connection'}`);
          setIsLoadingStats(false);
        }
      } catch (error) {
        console.error('Error loading repositories:', error);
        setError('Network error occurred while loading repositories');
        setIsLoadingStats(false);
      }
    };
    
    initializeData();
  }, [user, loadActionStats, loadCachedActionStats, location.state?.fromSettings]); // Include all dependencies

  const handleAddRepositoryClick = async () => {
    if (!user) return;
    
    setIsValidatingServers(true);
    try {
      // Load/refresh GitHub servers to ensure they are up to date
      await loadGitHubServers();
      setShowAddRepoModal(true);
    } catch (error) {
      console.error('Error loading GitHub servers:', error);
      setError('Failed to load GitHub servers. Please check your settings.');
    } finally {
      setIsValidatingServers(false);
    }
  };

  const handleCloseModal = () => {
    setShowAddRepoModal(false);
    setError(null); // Clear any validation errors
  };

  const handleRepositoryAdded = async () => {
    setIsLoadingStats(true); // Set loading state when new repository is added
    
    // Reload repositories
    try {
      const response = await fetch(`/api/repositories/tracked/${encodeURIComponent(user!.id)}`);
      if (response.ok) {
        const repos = await response.json();
        setRepositories(repos);
        
        // Create initial refreshing states for any new repositories
        setActionStats(prevStats => {
          const updatedStats = [...prevStats];
          
          repos.forEach((repo: Repository) => {
            const existingIndex = updatedStats.findIndex(stat => stat.repoId === repo.id);
            
            if (existingIndex < 0) {
              // Add new repository with refreshing state
              updatedStats.push({
                repository: repo.repository_name,
                repositoryUrl: repo.repository_url,
                repoId: repo.id,
                branches: {},
                overall: { success: 0, failure: 0, pending: 0, cancelled: 0 },
                status: 'refreshing',
                isRefreshing: true
              });
            }
          });
          
          return updatedStats;
        });
        
        // Load stats for the updated repositories
        if (repos.length > 0) {
          await loadActionStats(true, repos);
        }
      }
    } catch (error) {
      console.error('Error reloading repositories after addition:', error);
      setIsLoadingStats(false);
    }
    
    handleCloseModal();
  };

  const handleRepositoryRemoved = (repoId: number) => {
    setRepositories(repos => repos.filter(repo => repo.id !== repoId));
    setActionStats(stats => stats.filter(stat => stat.repoId !== repoId));
  };

  const handleActionStatsUpdate = (stats: ActionStatistics[]) => {
    setActionStats(stats);
    setIsLoadingStats(false); // Ensure loading state is cleared when stats are updated
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <img 
              src="/github-actions-viewer.svg" 
              alt="GitHub Actions Viewer" 
              className="app-icon"
            />
            <h1>GitHub Actions Dashboard</h1>
          </div>
          
          <div className="header-right">
            <button 
              onClick={handleAddRepositoryClick}
              disabled={isValidatingServers}
              className="add-repo-button"
            >
              {isValidatingServers ? 'Validating...' : '+ Add Repository'}
            </button>
            <Link to="/settings" className="settings-link" title="Settings">
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="settings-icon"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </Link>
            <div className="user-info-group">
              <span className="user-info">
                Logged in as:<br /><strong>{user?.id}</strong>
              </span>
              <button onClick={logout} className="logout-button">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {error && (
          <div className="error-banner">
            <p>{error}</p>
            <button onClick={() => setError(null)} className="dismiss-error">×</button>
          </div>
        )}

        <div className="repositories-grid-section">
          <h2>Tracked Repositories</h2>
          {repositories.length > 0 ? (
            <RepositoryList 
              repositories={repositories}
              actionStats={actionStats}
              onRepositoryRemoved={handleRepositoryRemoved}
              onActionStatsUpdate={handleActionStatsUpdate}
              gridView={true}
              isInitialLoading={isLoadingStats}
              isBulkRefreshing={isLoadingStats}
            />
          ) : (
            <div className="empty-state">
              <h3>No repositories tracked yet</h3>
              <p>Click the "Add Repository" button in the header to start monitoring GitHub Actions.</p>
            </div>
          )}
        </div>
      </main>

      {/* Add Repository Modal */}
      {showAddRepoModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Repository</h2>
              <button 
                className="modal-close-button"
                onClick={handleCloseModal}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <RepositorySearch 
                onRepositoryAdded={handleRepositoryAdded} 
                existingRepositories={repositories}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
