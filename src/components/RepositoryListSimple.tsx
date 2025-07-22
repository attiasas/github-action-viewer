import { useState, useEffect, useCallback } from 'react';
import RepositoryCard from './RepositoryCard';
import type { TrackedRepository, RepositoryStatus } from '../api/Repositories';
import './RepositoryListSimple.css';


interface RepositoryListProps {
  repositories: TrackedRepository[];
  onRepositoryRemoved: (repoId: number) => void;
  onActionStatsUpdate: (stats: RepositoryStatus[]) => void;
  gridView?: boolean;
  triggerForceRefresh?: boolean; // Signal from parent to force refresh all
  triggerNonForceRefresh?: boolean; // Signal from parent to trigger non-forced refresh all
}

export default function RepositoryListSimple(props: RepositoryListProps) {
  const {
    repositories,
    onRepositoryRemoved,
    onActionStatsUpdate,
    gridView = false,
    triggerForceRefresh = false,
    triggerNonForceRefresh = false
  } = props;

// ...existing code...
  const [repositoryStats, setRepositoryStats] = useState<Record<number, RepositoryStatus>>({});
  const [repositoryOrder, setRepositoryOrder] = useState<number[]>([]);
  const [pendingForceRefresh, setPendingForceRefresh] = useState<Set<number>>(new Set());
  const [pendingNonForceRefresh, setPendingNonForceRefresh] = useState<Set<number>>(new Set());

  // Initialize repository order
  useEffect(() => {
    const newOrder = repositories
      .map(repo => repo.repository.id)
      .sort((a, b) => {
        const statsA = repositoryStats[a];
        const statsB = repositoryStats[b];
        // Sort by status priority: running, failure, pending, success, unknown
        const getPriority = (stats?: RepositoryStatus) => {
          if (!stats) return 5;
          switch (stats.status) {
            case 'running': return 1;
            case 'failure': return 2;
            case 'pending': return 3;
            case 'success': return 4;
            default: return 5;
          }
        };
        const priorityA = getPriority(statsA);
        const priorityB = getPriority(statsB);
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        // Secondary sort by repository name
        const repoA = repositories.find(r => r.repository.id === a);
        const repoB = repositories.find(r => r.repository.id === b);
        return (repoA?.repository.name || '').localeCompare(repoB?.repository.name || '');
      });

    setRepositoryOrder(newOrder);
  }, [repositories, repositoryStats]);

  // Handle stats update from individual repository cards
  const handleStatsUpdate = useCallback((stats: RepositoryStatus) => {
    setRepositoryStats(prev => {
      const updated = { ...prev, [stats.id]: stats };
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
      setPendingForceRefresh(new Set(repositories.map(r => r.repository.id)));
    }
  }, [triggerForceRefresh, repositories]);

  // Handle non-force refresh trigger from parent
  useEffect(() => {
    if (triggerNonForceRefresh) {
      setPendingNonForceRefresh(new Set(repositories.map(r => r.repository.id)));
    }
  }, [triggerNonForceRefresh, repositories]);

  // Handle force refresh completion from individual cards
  const handleForceRefreshComplete = useCallback((repoId: number) => {
    setPendingForceRefresh(prev => {
      const updated = new Set(prev);
      updated.delete(repoId);
      return updated;
    });
  }, []);

  // Handle non-force refresh completion from individual cards
  const handleNonForceRefreshComplete = useCallback((repoId: number) => {
    setPendingNonForceRefresh(prev => {
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
        const repository = repositories.find(r => r.repository.id === repoId);
        if (!repository) return null;

        return (
          <RepositoryCard
            key={repoId}
            repo={repository}
            onRemove={handleRepositoryRemoved}
            onStatsUpdate={handleStatsUpdate}
            initialStats={repositoryStats[repoId]}
            forceRefresh={pendingForceRefresh.has(repoId)}
            onForceRefreshComplete={() => handleForceRefreshComplete(repoId)}
            nonForceRefresh={pendingNonForceRefresh.has(repoId)}
            onNonForceRefreshComplete={() => handleNonForceRefreshComplete(repoId)}
          />
        );
      })}
    </div>
  );
}
