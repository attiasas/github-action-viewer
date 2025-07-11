import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RepositorySearch from '../components/RepositorySearch';
import RepositoryListSimple from '../components/RepositoryListSimple';
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
  workflows: Record<string, {
    status: string;
    conclusion: string | null;
    created_at?: string;
    html_url?: string;
    normalizedStatus?: string;
  }>;
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
  status: string;
  hasPermissionError?: boolean;
  hasError?: boolean;
  error?: string;
}

export default function DashboardPage() {
  const { user, logout, loadGitHubServers } = useAuth();
  const location = useLocation();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [actionStats, setActionStats] = useState<ActionStatistics[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);
  const [triggerForceRefresh, setTriggerForceRefresh] = useState(false);
  
  const hasInitiallyLoaded = useRef(false);

  // Load repositories from database
  const loadRepositories = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch(`/api/repositories?userId=${encodeURIComponent(user.id)}`);
      if (response.ok) {
        const data = await response.json();
        setRepositories(data);
      } else {
        throw new Error('Failed to load repositories');
      }
    } catch (error) {
      console.error('Error loading repositories:', error);
      setError('Failed to load repositories');
    }
  }, [user]);

  // Handle repository added
  const handleRepositoryAdded = useCallback(() => {
    setShowAddRepoModal(false);
    // Reload repositories to get the updated list
    loadRepositories();
  }, [loadRepositories]);

  // Handle repository removed
  const handleRepositoryRemoved = useCallback((repoId: number) => {
    setRepositories(prev => prev.filter(repo => repo.id !== repoId));
  }, []);

  // Handle action stats update from RepositoryList
  const handleActionStatsUpdate = useCallback((stats: ActionStatistics[]) => {
    setActionStats(stats);
  }, []);

  // Force refresh all repositories
  const handleForceRefreshAll = useCallback(() => {
    setTriggerForceRefresh(true);
    // Reset the trigger after a short delay
    setTimeout(() => setTriggerForceRefresh(false), 100);
  }, []);

  // Close modal handler
  const handleCloseModal = useCallback(() => {
    setShowAddRepoModal(false);
  }, []);

  // Initial load
  useEffect(() => {
    if (user && !hasInitiallyLoaded.current) {
      hasInitiallyLoaded.current = true;
      loadGitHubServers();
      loadRepositories();
    }
  }, [user, loadGitHubServers, loadRepositories]);

  // Handle URL hash for modal state
  useEffect(() => {
    if (location.hash === '#add-repository') {
      setShowAddRepoModal(true);
    }
  }, [location.hash]);

  if (!user) {
    return <div>Please log in to access the dashboard.</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <h1>GitHub Actions Viewer</h1>
            <div className="header-actions">
              <button 
                className="add-repo-button"
                onClick={() => setShowAddRepoModal(true)}
              >
                Add Repository
              </button>
              <button 
                className="refresh-all-button"
                onClick={handleForceRefreshAll}
                title="Force refresh all repositories"
              >
                🔄 Refresh All
              </button>
            </div>
          </div>
          <div className="header-right">
            <Link to="/settings" className="settings-link">
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

        <div className="repositories-section">
          <h2>Tracked Repositories ({repositories.length})</h2>
          <RepositoryListSimple 
            repositories={repositories}
            onRepositoryRemoved={handleRepositoryRemoved}
            onActionStatsUpdate={handleActionStatsUpdate}
            gridView={true}
            triggerForceRefresh={triggerForceRefresh}
          />
        </div>

        {/* Stats summary */}
        {actionStats.length > 0 && (
          <div className="stats-summary">
            <h3>Overall Status</h3>
            <div className="summary-stats">
              <div className="stat-item success">
                <span className="stat-value">{actionStats.filter(s => s.status === 'success').length}</span>
                <span className="stat-label">Success</span>
              </div>
              <div className="stat-item failure">
                <span className="stat-value">{actionStats.filter(s => s.status === 'failure').length}</span>
                <span className="stat-label">Failure</span>
              </div>
              <div className="stat-item pending">
                <span className="stat-value">{actionStats.filter(s => s.status === 'pending').length}</span>
                <span className="stat-label">Pending</span>
              </div>
              <div className="stat-item error">
                <span className="stat-value">{actionStats.filter(s => s.status === 'error').length}</span>
                <span className="stat-label">Error</span>
              </div>
            </div>
          </div>
        )}
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
