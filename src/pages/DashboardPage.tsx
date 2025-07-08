import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RepositorySearch from '../components/RepositorySearch';
import RepositoryList from '../components/RepositoryList';
import ActionStats from '../components/ActionStats';
import TokenValidator from '../components/TokenValidator';
import './DashboardPage.css';

interface Repository {
  id: number;
  repository_name: string;
  repository_url: string;
  tracked_branches: string[];
  tracked_workflows: string[];
  auto_refresh_interval: number;
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

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [actionStats, setActionStats] = useState<ActionStatistics[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(300); // 5 minutes default
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/actions/stats/${user.id}`);
      if (response.ok) {
        const stats = await response.json();
        setActionStats(stats);
        setLastRefresh(new Date());
        setError(null);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setError(`Failed to load action statistics: ${errorData.error || 'Please check your connection'}`);
      }
    } catch (error) {
      console.error('Error loading action stats:', error);
      setError('Network error occurred while loading action statistics');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load user settings
  const loadSettings = useCallback(async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/users/settings/${user.id}`);
      if (response.ok) {
        const settings = await response.json();
        setRefreshInterval(settings.default_refresh_interval);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }, [user]);

  useEffect(() => {
    loadRepositories();
    loadSettings();
  }, [loadRepositories, loadSettings]);

  useEffect(() => {
    loadActionStats();
  }, [repositories, loadActionStats]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0 && repositories.length > 0) {
      const interval = setInterval(loadActionStats, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, repositories.length, loadActionStats]);

  const handleRepositoryAdded = () => {
    loadRepositories();
  };

  const handleRepositoryRemoved = (repoId: number) => {
    setRepositories(repos => repos.filter(repo => repo.id !== repoId));
    setActionStats(stats => stats.filter(stat => stat.repoId !== repoId));
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>GitHub Actions Dashboard</h1>
          <div className="header-info">
            <span className="user-info">
              Logged in as: <strong>{user?.id}</strong>
            </span>
            <div className="header-actions">
              <Link to="/settings" className="settings-link">
                Settings
              </Link>
              <button onClick={logout} className="logout-button">
                Logout
              </button>
            </div>
          </div>
        </div>
        
        <div className="dashboard-controls">
          <div className="refresh-info">
            {lastRefresh && (
              <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
            )}
            <span>Auto-refresh: {refreshInterval}s</span>
          </div>
          <button onClick={loadActionStats} disabled={isLoading} className="refresh-button">
            {isLoading ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {error && (
          <div className="error-banner">
            <p>{error}</p>
            <button onClick={() => setError(null)} className="dismiss-error">×</button>
          </div>
        )}

        <div className="dashboard-section">
          <h2>GitHub Token Status</h2>
          <TokenValidator />
        </div>

        <div className="dashboard-section">
          <h2>Add Repository</h2>
          <RepositorySearch onRepositoryAdded={handleRepositoryAdded} />
        </div>

        {repositories.length > 0 && (
          <>
            <div className="dashboard-section">
              <h2>Action Statistics Overview</h2>
              <ActionStats stats={actionStats} isLoading={isLoading} />
            </div>

            <div className="dashboard-section">
              <h2>Tracked Repositories</h2>
              <RepositoryList 
                repositories={repositories}
                actionStats={actionStats}
                onRepositoryRemoved={handleRepositoryRemoved}
              />
            </div>
          </>
        )}

        {repositories.length === 0 && (
          <div className="empty-state">
            <h3>No repositories tracked yet</h3>
            <p>Use the search above to add repositories and start monitoring their GitHub Actions.</p>
          </div>
        )}
      </main>
    </div>
  );
}
