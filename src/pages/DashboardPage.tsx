import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { TrackedRepository, RepositoryStatus } from '../api/Repositories';
import RepositorySearch from '../components/repositories/RepositorySearch';
import RepositoryListSimple from '../components/repositories/RepositoryListSimple';
import './DashboardPage.css';


export default function DashboardPage() {
  const { user, logout, loadGitHubServers } = useAuth();
  const location = useLocation();
  const [repositories, setRepositories] = useState<TrackedRepository[]>([]);
  const [actionStats, setActionStats] = useState<RepositoryStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);
  const [triggerForceRefresh, setTriggerForceRefresh] = useState(false);
  const [triggerNonForceRefresh, setTriggerNonForceRefresh] = useState(false);
  const hasInitiallyLoaded = useRef(false);

  // Load repositories from database
  const loadRepositories = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch(`/api/repositories/tracked/${encodeURIComponent(user.id)}`);
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
    setRepositories(prev => prev.filter(repo => repo.repository.id !== repoId));
  }, []);

  // Handle action stats update from RepositoryList
  const handleActionStatsUpdate = useCallback((stats: RepositoryStatus[]) => {
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

  // Initial load: load servers/repos, then trigger force refresh (unless from settings)
  useEffect(() => {
    if (user && !hasInitiallyLoaded.current) {
      hasInitiallyLoaded.current = true;
      loadGitHubServers(true);
      loadRepositories();
      // After a short delay, trigger force refresh for all repos (unless from settings)
      setTimeout(() => {
        // Only trigger if not returning from settings
        if (!(location.state && location.state.fromSettings)) {
          setTriggerForceRefresh(true);
          setTimeout(() => setTriggerForceRefresh(false), 100);
        }
      }, 200);
    }
  }, [user, loadGitHubServers, loadRepositories, location.state]);

  // Detect return from settings and trigger non-forced refresh for all repositories
  useEffect(() => {
    if (location.state && location.state.fromSettings) {
      // Clear the state so it doesn't trigger again
      window.history.replaceState({}, document.title);
      // Wait for repositories to be loaded, then trigger a non-forced refresh
      setTimeout(() => {
        setTriggerNonForceRefresh(true);
        setTimeout(() => setTriggerNonForceRefresh(false), 100);
      }, 100);
    }
  }, [location.state]);

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
            <img 
              src="/github-actions-viewer.svg" 
              alt="GitHub Actions Viewer" 
              className="app-icon"
            />
            <h1>GitHub Actions Viewer</h1>
          </div>
          <div className="header-right">
            <button 
              className="add-repo-button"
              onClick={() => setShowAddRepoModal(true)}
            >
              Add Repository
            </button>
            <button 
              className="refresh-all-button icon-only"
              onClick={handleForceRefreshAll}
              title="Force refresh all repositories"
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
          <div className="repositories-header">
            <h2>Tracked Repositories ({repositories.length})</h2>
            {actionStats.length > 0 && (
              <div className="status-summary-inline">
                <div className="status-counts">
                  <span className="status-item success">
                    ✓ {actionStats.filter(s => s.status === 'success').length}
                  </span>
                  <span className="status-item failure">
                    ✗ {actionStats.filter(s => s.status === 'failure').length}
                  </span>
                  <span className="status-item pending">
                    ○ {actionStats.filter(s => s.status === 'pending').length}
                  </span>
                </div>
                {actionStats.filter(s => s.status === 'error').length > 0 && (
                  <div className="error-indicator">
                    <span className="error-count">
                      ⚠ {actionStats.filter(s => s.status === 'error').length} error{actionStats.filter(s => s.status === 'error').length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <RepositoryListSimple 
            repositories={repositories}
            onRepositoryRemoved={handleRepositoryRemoved}
            onActionStatsUpdate={handleActionStatsUpdate}
            gridView={true}
            triggerForceRefresh={triggerForceRefresh}
            triggerNonForceRefresh={triggerNonForceRefresh}
          />
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
