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
  github_server_id: number;
}

interface BranchStats {
  success: number;
  failure: number;
  pending: number;
  cancelled: number;
  running: number;
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
    running: number;
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
  // Histogram settings from localStorage
  const showHistogram = (() => {
    const stored = localStorage.getItem('gav_showHistogram');
    if (stored === null) return true;
    return stored === 'true';
  })();
  const histogramType = (() => {
    return localStorage.getItem('gav_histogramType') || 'refresh';
  })();

  // Store last N refreshes' overall status counts (N depends on available width)
  const BAR_WIDTH = 4;
  const BAR_GAP = 1;
  const [histogramWidth, setHistogramWidth] = useState(48); // default fallback
  const histogramRef = useRef<HTMLDivElement | null>(null);
  const MAX_HISTORY = Math.floor((histogramWidth + BAR_GAP) / (BAR_WIDTH + BAR_GAP));
  const [refreshHistory, setRefreshHistory] = useState<Array<{success:number;failure:number;pending:number;running:number;cancelled:number;}>>(
    initialStats ? [{...initialStats.overall}] : []
  );
  // Dynamically measure available width for histogram
  useEffect(() => {
    if (!histogramRef.current) return;
    const node = histogramRef.current;
    const updateWidth = () => {
      setHistogramWidth(node.offsetWidth);
    };
    updateWidth();
    // Use ResizeObserver if available
    let ro: ResizeObserver | null = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => updateWidth());
      ro.observe(node);
    } else {
      window.addEventListener('resize', updateWidth);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', updateWidth);
    };
  }, []);
  
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
      setRefreshHistory(prev => {
        if (prev.length === 0 && statsRef.current) {
          return [{...statsRef.current.overall}];
        }
        // If we have cached stats, just return them
        return prev;
      });
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
        // Only add to refresh history if this was a forced refresh
        
        setRefreshHistory(prev => {
          if (force || prev.length === 0) {
            const next = [...prev, {...newStats.overall}];
            return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
          }
          // If we have cached stats, just return them
          return prev;
        });
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
  }, [user, repository, MAX_HISTORY]);

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
    } else if (statsRef.current) {
      // If initialStats provided, seed history
      setRefreshHistory(prev => {
        if (prev.length === 0) {
          return [{...statsRef.current!.overall}];
        }
        // If we have cached stats, just return them
        return prev;
      });
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
      case 'running': return '#007bff';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✓';
      case 'failure': return '✗';
      case 'pending': return '○';
      case 'error': return '⚠';
      case 'running': return '▶';
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
          <div className="controls-left" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            <div className="refresh-info" style={{ width: 80, minWidth: 80, textAlign: 'right', flex: '0 0 80px' }}>
              {isRefreshing ? (
                <span className="refreshing">Refreshing...</span>
              ) : (
                <span className="timer">Next: {formatTime(timeLeft)}</span>
              )}
            </div>
          </div>
          {/* Status history stacked bar chart (only if enabled) */}
          {showHistogram && histogramType === 'refresh' && (
            <div ref={histogramRef} style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', minWidth: 48, margin: '0 8px', maxWidth: '100%' }} title={`Workflow status history (last ${MAX_HISTORY} refreshes)`}>
              {refreshHistory.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-end', height: 28, width: '100%', gap: BAR_GAP }}>
                  {refreshHistory.slice(-MAX_HISTORY).map((hist, idx) => {
                    const total = hist.success + hist.failure + hist.pending + hist.running + hist.cancelled;
                    if (total === 0) return (
                      <div key={idx} style={{ width: BAR_WIDTH, height: 24, background: '#e0e0e0', borderRadius: 2, opacity: 0.5 }} title="No data" />
                    );
                    // Each bar is BAR_WIDTH px wide, 24px tall
                    const barHeight = 24;
                    const getH = (n: number) => Math.round((n / total) * barHeight);
                    // Order: running, pending, success, failure, cancelled (top to bottom)
                    const segments = [
                      { key: 'running', count: hist.running, color: '#2196f3' },
                      { key: 'pending', count: hist.pending, color: '#ffc107' },
                      { key: 'success', count: hist.success, color: '#28a745' },
                      { key: 'failure', count: hist.failure, color: '#dc3545' },
                      { key: 'cancelled', count: hist.cancelled, color: '#6c757d' },
                    ];
                    return (
                      <div key={idx} style={{ width: BAR_WIDTH, height: barHeight, display: 'flex', flexDirection: 'column-reverse', borderRadius: 2, overflow: 'hidden', boxShadow: '0 0 0 1px var(--border-color)' }}>
                        {segments.map(seg => {
                          if (seg.count === 0) return null;
                          const h = getH(seg.count);
                          return <div key={seg.key} style={{ height: h, width: '100%', background: seg.color }} title={`${seg.key}: ${seg.count}`}/>;
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
                  {/* Show running first if present */}
                  {stats.overall.running > 0 ? (
                    <>
                      <span className="status-icon" style={{ color: getStatusColor('running') }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" stroke="#2196f3" strokeWidth="3" fill="none"/><path d="M12 6v6l4 2" stroke="#1976d2"/></svg>
                      </span>
                      <span className="status-text" style={{ color: getStatusColor('running') }}>RUNNING</span>
                    </>
                  ) : stats.status === 'success' && stats.overall.failure === 0 && stats.overall.pending === 0 ? (
                    <>
                      <span className="status-icon" style={{ color: getStatusColor('success') }}>✓</span>
                      <span className="status-text" style={{ color: getStatusColor('success') }}>SUCCESS</span>
                    </>
                  ) : (
                    <>
                      <span className="status-icon" style={{ color: getStatusColor(stats.status) }}>{getStatusIcon(stats.status)}</span>
                      <span className="status-text" style={{ color: getStatusColor(stats.status) }}>{stats.status.toUpperCase()}</span>
                    </>
                  )}
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
