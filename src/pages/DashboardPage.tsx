import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RepositorySearch from '../components/RepositorySearch';
import RepositoryList from '../components/RepositoryList';
import './DashboardPage.css';

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
  status: string; // New field for overall repository status
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [actionStats, setActionStats] = useState<ActionStatistics[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);

  // Load tracked repositories
  const loadRepositories = useCallback(async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/repositories/tracked/${user.id}`);
      if (response.ok) {
        const repos = await response.json();
        setRepositories(repos);
        setError(null);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setError(`Failed to load repositories: ${errorData.error || 'Please check your connection'}`);
      }
    } catch (error) {
      console.error('Error loading repositories:', error);
      setError('Network error occurred while loading repositories');
    }
  }, [user]);

  // Load action statistics
  const loadActionStats = useCallback(async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/actions/stats/${user.id}`);
      if (response.ok) {
        const stats = await response.json();
        setActionStats(stats);
      } else {
        console.error('Failed to load action statistics');
      }
    } catch (error) {
      console.error('Error loading action statistics:', error);
    }
  }, [user]);

  useEffect(() => {
    loadRepositories();
    loadActionStats();
  }, [loadRepositories, loadActionStats]);

  const handleRepositoryAdded = () => {
    loadRepositories();
    loadActionStats();
    setShowAddRepoModal(false);
  };

  const handleRepositoryRemoved = (repoId: number) => {
    setRepositories(repos => repos.filter(repo => repo.id !== repoId));
    setActionStats(stats => stats.filter(stat => stat.repoId !== repoId));
  };

  const handleActionStatsUpdate = (stats: ActionStatistics[]) => {
    setActionStats(stats);
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <h1>GitHub Actions Dashboard</h1>
          </div>
          
          <div className="header-right">
            <button 
              onClick={() => setShowAddRepoModal(true)} 
              className="add-repo-button"
            >
              + Add Repository
            </button>
            <Link to="/settings" className="settings-link">
              Settings
            </Link>
            <div className="user-info-group">
              <span className="user-info">
                Logged in as: <strong>{user?.id}</strong>
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
        <div className="modal-overlay" onClick={() => setShowAddRepoModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Repository</h2>
              <button 
                className="modal-close-button"
                onClick={() => setShowAddRepoModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <RepositorySearch onRepositoryAdded={handleRepositoryAdded} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
