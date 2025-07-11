import { useState, useEffect, useCallback } from 'react';
import RepositoryCard from './RepositoryCard';
import './RepositoryListSimple.css';

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

interface RepositoryListProps {
  repositories: Repository[];
  onRepositoryRemoved: (repoId: number) => void;
  onActionStatsUpdate: (stats: ActionStatistics[]) => void;
  gridView?: boolean;
  triggerForceRefresh?: boolean; // Signal from parent to force refresh all
}

export default function RepositoryList({ 
  repositories, 
  onRepositoryRemoved,
  onActionStatsUpdate,
  gridView = false,
  triggerForceRefresh = false
}: RepositoryListProps) {
  const [repositoryStats, setRepositoryStats] = useState<Record<number, ActionStatistics>>({});
  const [repositoryOrder, setRepositoryOrder] = useState<number[]>([]);
  const [pendingForceRefresh, setPendingForceRefresh] = useState<Set<number>>(new Set());

  // Initialize repository order
  useEffect(() => {
    const newOrder = repositories
      .map(repo => repo.id)
      .sort((a, b) => {
        const statsA = repositoryStats[a];
        const statsB = repositoryStats[b];
        
        // Sort by status priority: failure, pending, success, unknown
        const getPriority = (stats?: ActionStatistics) => {
          if (!stats) return 4;
          switch (stats.status) {
            case 'failure': return 1;
            case 'pending': return 2; 
            case 'success': return 3;
            default: return 4;
          }
        };
        
        const priorityA = getPriority(statsA);
        const priorityB = getPriority(statsB);
        
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        
        // Secondary sort by repository name
        const repoA = repositories.find(r => r.id === a);
        const repoB = repositories.find(r => r.id === b);
        return (repoA?.repository_name || '').localeCompare(repoB?.repository_name || '');
      });

    setRepositoryOrder(newOrder);
  }, [repositories, repositoryStats]);

  // Handle stats update from individual repository cards
  const handleStatsUpdate = useCallback((stats: ActionStatistics) => {
    setRepositoryStats(prev => {
      const updated = { ...prev, [stats.repoId]: stats };
      return updated;
    });
  }, []);

  // Notify parent when repository stats change
  useEffect(() => {
    const allStats = Object.values(repositoryStats);
    if (allStats.length > 0) {
      onActionStatsUpdate(allStats);
    }
  }, [repositoryStats, onActionStatsUpdate]);

  // Handle repository removal
  const handleRepositoryRemoved = useCallback((repoId: number) => {
    setRepositoryStats(prev => {
      const updated = { ...prev };
      delete updated[repoId];
      return updated;
    });
    
    setRepositoryOrder(prev => prev.filter(id => id !== repoId));
    onRepositoryRemoved(repoId);
  }, [onRepositoryRemoved]);

  // Handle force refresh trigger from parent
  useEffect(() => {
    if (triggerForceRefresh) {
      setPendingForceRefresh(new Set(repositories.map(r => r.id)));
    }
  }, [triggerForceRefresh, repositories]);

  // Handle force refresh completion from individual cards
  const handleForceRefreshComplete = useCallback((repoId: number) => {
    setPendingForceRefresh(prev => {
      const updated = new Set(prev);
      updated.delete(repoId);
      return updated;
    });
  }, []);

  if (repositories.length === 0) {
    return (
      <div className="repository-list-empty">
        <div className="empty-state">
          <h3>No repositories configured</h3>
          <p>Add a repository to start monitoring GitHub Actions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`repository-list ${gridView ? 'grid-view' : 'list-view'}`}>
      {repositoryOrder.map(repoId => {
        const repository = repositories.find(r => r.id === repoId);
        if (!repository) return null;

        return (
          <RepositoryCard
            key={repoId}
            repository={repository}
            onRemove={handleRepositoryRemoved}
            onStatsUpdate={handleStatsUpdate}
            initialStats={repositoryStats[repoId]}
            forceRefresh={pendingForceRefresh.has(repoId)}
            onForceRefreshComplete={() => handleForceRefreshComplete(repoId)}
          />
        );
      })}
    </div>
  );
}
