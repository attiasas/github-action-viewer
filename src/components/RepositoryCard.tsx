import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import WorkflowDetailModal from './WorkflowDetailModal';
import './RepositoryCard.css';

interface Repository {
  id: number;
  repository_name: string;
  repository_url: string;
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

interface RepositoryCardProps {
  repository: Repository;
  onRemove: (repoId: number) => void;
  onStatsUpdate?: (stats: ActionStatistics) => void;
  initialStats?: ActionStatistics;
  forceRefresh?: boolean; // Trigger from parent
  onForceRefreshComplete?: () => void;
}

export default function RepositoryCard({ 
  repository, 
  onRemove, 
  onStatsUpdate,
  initialStats,
  forceRefresh,
  onForceRefreshComplete
}: RepositoryCardProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<ActionStatistics | null>(initialStats || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(repository.auto_refresh_interval);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<number>(0);
  const forceRefreshHandledRef = useRef(false);
  const onStatsUpdateRef = useRef(onStatsUpdate);
  const statsRef = useRef(stats);

  // Update refs when props change
  useEffect(() => {
    onStatsUpdateRef.current = onStatsUpdate;
  }, [onStatsUpdate]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  // Get repository stats from cache or server
  const getRepositoryStats = useCallback(async (force = false) => {
    if (!user) return null;

    // Check if we need to refresh based on timing
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshRef.current;
    const minInterval = repository.auto_refresh_interval * 1000;
    
    if (!force && statsRef.current && timeSinceLastRefresh < minInterval) {
      // Return cached stats
      return statsRef.current;
    }

    try {
      setIsRefreshing(true);
      setError(null);

      const encodedUserId = encodeURIComponent(user.id);
      const url = force 
        ? `/api/actions/refresh/${encodedUserId}/${repository.id}?force=true`
        : `/api/actions/refresh/${encodedUserId}/${repository.id}`;

      const response = await fetch(url, { method: 'POST' });

      if (response.ok) {
        const newStats = await response.json();
        setStats(newStats);
        lastRefreshRef.current = now;
        
        // Notify parent if callback provided
        if (onStatsUpdateRef.current) {
          onStatsUpdateRef.current(newStats);
        }
        
        return newStats;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      setError(errorMessage);
      console.error(`Error refreshing repository ${repository.repository_name}:`, error);
      return null;
    } finally {
      setIsRefreshing(false);
    }
  }, [user, repository]);

  // Auto-refresh timer
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Time to refresh
          getRepositoryStats(false);
          return repository.auto_refresh_interval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [repository.auto_refresh_interval, getRepositoryStats]);

  // Handle force refresh from parent
  useEffect(() => {
    if (forceRefresh && !forceRefreshHandledRef.current) {
      forceRefreshHandledRef.current = true;
      setTimeLeft(repository.auto_refresh_interval); // Reset timer
      getRepositoryStats(true).finally(() => {
        if (onForceRefreshComplete) {
          onForceRefreshComplete();
        }
        // Reset the flag after a delay to allow future force refreshes
        setTimeout(() => {
          forceRefreshHandledRef.current = false;
        }, 1000);
      });
    }
  }, [forceRefresh, getRepositoryStats, onForceRefreshComplete, repository.auto_refresh_interval]);

  // Initial load
  useEffect(() => {
    if (!statsRef.current) {
      getRepositoryStats(false);
    }
  }, [getRepositoryStats]);

  // Handle card click to open modal
  const handleCardClick = useCallback((event: React.MouseEvent) => {
    // Don't open modal if clicking on buttons or links
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }
    setShowDetailModal(true);
  }, []);

  // Manual refresh handler
  const handleManualRefresh = useCallback(() => {
    setTimeLeft(repository.auto_refresh_interval); // Reset timer
    getRepositoryStats(true);
  }, [getRepositoryStats, repository.auto_refresh_interval]);

  // Remove repository handler
  const handleRemove = useCallback(async () => {
    if (!user || !window.confirm(`Are you sure you want to remove ${repository.display_name || repository.repository_name}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/repositories/tracked/${encodeURIComponent(user.id)}/${repository.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        onRemove(repository.id);
      } else {
        throw new Error('Failed to remove repository');
      }
    } catch (error) {
      console.error('Error removing repository:', error);
      setError('Failed to remove repository');
    }
  }, [user, repository, onRemove]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return '#28a745';
      case 'failure': return '#dc3545';
      case 'pending': return '#ffc107';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✓';
      case 'failure': return '✗';
      case 'pending': return '○';
      case 'error': return '⚠';
      default: return '?';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <div 
        className={`repository-card ${stats?.status || 'unknown'} clickable`}
        onClick={handleCardClick}
      >
        <div className="repository-controls">
          <div className="controls-left">
            <button 
              className="refresh-btn"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              title="Refresh now"
            >
              <svg 
                width="16" 
                height="16" 
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
            
            <div className="refresh-info">
              {isRefreshing ? (
                <span className="refreshing">Refreshing...</span>
              ) : (
                <span className="timer">Next: {formatTime(timeLeft)}</span>
              )}
            </div>
          </div>
          
          <button 
            className="remove-btn"
            onClick={handleRemove}
            title="Remove repository"
          >
            ×
          </button>
        </div>

        <div className="card-content">
          <div className="repository-status">
            {error ? (
              <div className="error-message">
                <span className="error-icon">⚠</span>
                <span>{error}</span>
              </div>
            ) : stats ? (
              <div className={`status-summary ${stats.status}`}>
                <div className="repository-info">
                  <h3 className="repository-name">
                    <a href={repository.repository_url} target="_blank" rel="noopener noreferrer" style={{ color: getStatusColor(stats.status) }}>
                      {repository.display_name || repository.repository_name}
                    </a>
                  </h3>
                  {repository.display_name && repository.display_name !== repository.repository_name && (
                    <div className="repository-meta">
                      <span className="server-name" style={{ color: getStatusColor(stats.status) }}>{repository.repository_name}</span>
                    </div>
                  )}
                </div>
                <div className="status-section">
                  <span className="status-icon" style={{ color: getStatusColor(stats.status) }}>
                    {stats.status === 'success' && stats.overall.failure === 0 && stats.overall.pending === 0 ? '✓' : getStatusIcon(stats.status)}
                  </span>
                  <span className="status-text" style={{ color: getStatusColor(stats.status) }}>
                    {stats.status === 'success' && stats.overall.failure === 0 && stats.overall.pending === 0 ? 'SUCCESS' : stats.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="loading">Loading...</div>
            )}
          </div>
        </div>

        <div className="card-footer">
          <span className="click-hint-text">Click for detailed workflow information</span>
        </div>
      </div>

      {/* Workflow Detail Modal */}
      <WorkflowDetailModal
        repository={repository}
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
      />
    </>
  );
}
