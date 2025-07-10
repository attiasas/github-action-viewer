import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './RepositoryList.css';

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
  hasPermissionError?: boolean;
  permissionError?: string;
  hasError?: boolean;
  error?: string;
  isCached?: boolean;
  isRefreshing?: boolean; // New field to track if repository is being refreshed
}

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  head_branch: string;
  head_sha: string;
  workflow_id: number;
  run_number: number;
}

interface DetailedWorkflowStatus {
  repository: string;
  repositoryUrl: string;
  repoId: number;
  isRefreshing?: boolean; // New field to track if data is being refreshed
  branches: Record<string, {
    workflows: Record<string, WorkflowRun | { status: 'no_runs'; conclusion: null; name: string; workflow_id: number; }>;
    error: string | null;
  }>;
}

interface RepositoryListProps {
  repositories: Repository[];
  actionStats: ActionStatistics[];
  onRepositoryRemoved: (repoId: number) => void;
  onActionStatsUpdate: (stats: ActionStatistics[]) => void;
  gridView?: boolean;
  isInitialLoading?: boolean; // New prop to indicate initial loading state
  isBulkRefreshing?: boolean; // New prop to indicate bulk refresh is in progress
}

interface RepositoryTimer {
  timeLeft: number;
  intervalId: NodeJS.Timeout | null;
  isActive: boolean; // New field to track if timer should be active
}

export default function RepositoryList({ 
  repositories, 
  actionStats, 
  onRepositoryRemoved, 
  onActionStatsUpdate,
  gridView = false,
  isInitialLoading = false,
  isBulkRefreshing = false
}: RepositoryListProps) {
  const { user } = useAuth();
  const [showConfigModal, setShowConfigModal] = useState<number | null>(null);
  const [showWorkflowStatus, setShowWorkflowStatus] = useState<number | null>(null);
  const [workflowStatusData, setWorkflowStatusData] = useState<DetailedWorkflowStatus | null>(null);
  const [isLoadingWorkflowStatus, setIsLoadingWorkflowStatus] = useState(false);
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});
  const [isRemoving, setIsRemoving] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repositoryTimers, setRepositoryTimers] = useState<Record<number, RepositoryTimer>>({});
  const [pendingRefreshes, setPendingRefreshes] = useState<Set<number>>(new Set()); // Track pending refreshes
  const refreshQueueRef = useRef<{ repoId: number; scheduledTime: number }[]>([]); // Queue for staggered refreshes
  const bulkRefreshEndTimeRef = useRef<number>(0); // Track when bulk refresh ended to add grace period
  const refreshStartTimesRef = useRef<Record<number, number>>({}); // Track when each repository started refreshing

  // Enhanced function to refresh a single repository with deduplication
  const refreshSingleRepository = useCallback(async (repoId: number, force = false) => {
    if (!user) return;
    
    const repo = repositories.find(r => r.id === repoId);
    const repoName = repo?.repository_name || `repo-${repoId}`;
    
    // Check if already refreshing to prevent duplicates
    if (pendingRefreshes.has(repoId)) {
      console.log(`⏭️ [Frontend] Skipping refresh for repository: ${repoName} (already in progress)`);
      return;
    }
    
    console.log(`🎯 [Frontend] SINGLE REFRESH CALL STARTING for repository: ${repoName} (ID: ${repoId}, force: ${force})`);
    
    // Mark as pending
    setPendingRefreshes(prev => new Set(prev).add(repoId));
    
    // Track when this repository started refreshing
    refreshStartTimesRef.current[repoId] = Date.now();
    
    // Mark the repository as refreshing in the UI immediately
    const markAsRefreshing = () => {
      const currentStats = [...actionStats];
      const repoIndex = currentStats.findIndex(stat => stat.repoId === repoId);
      if (repoIndex >= 0) {
        currentStats[repoIndex] = {
          ...currentStats[repoIndex],
          isRefreshing: true
        };
        onActionStatsUpdate(currentStats);
      }
    };
    
    // Mark as refreshing immediately for immediate UI feedback
    markAsRefreshing();
    
    try {
      const encodedUserId = encodeURIComponent(user.id);
      const url = force 
        ? `/api/actions/refresh/${encodedUserId}/${repoId}?force=true`
        : `/api/actions/refresh/${encodedUserId}/${repoId}`;
      
      const startTime = Date.now();
      const response = await fetch(url, { method: 'POST' });
      const endTime = Date.now();
      
      if (response.ok) {
        const updatedRepoStats = await response.json();
        
        console.log(`🏁 [Frontend] SINGLE REFRESH CALL COMPLETED for repository: ${repoName} (total call duration: ${endTime - startTime}ms)`);
        
        // Ensure refreshing state is cleared and force UI update
        updatedRepoStats.isRefreshing = false;
        
        // Update the specific repository in actionStats
        const currentStats = [...actionStats];
        const repoIndex = currentStats.findIndex(stat => stat.repoId === repoId);
        
        if (repoIndex >= 0) {
          currentStats[repoIndex] = updatedRepoStats;
        } else {
          currentStats.push(updatedRepoStats);
        }
        
        // Force update immediately
        onActionStatsUpdate(currentStats);
        console.log(`✅ [Frontend] UI updated for repository: ${repoName} - refreshing state cleared`);
        
        // Activate timer for this repository
        setRepositoryTimers(prev => {
          const updated = { ...prev };
          if (updated[repoId] && !updated[repoId].isActive) {
            updated[repoId] = {
              ...updated[repoId],
              isActive: true
            };
          }
          return updated;
        });
      } else {
        console.error(`💥 [Frontend] SINGLE REFRESH CALL FAILED for repository: ${repoName} (${response.status}: ${response.statusText})`);
        
        // Clear refreshing state on error
        const currentStats = [...actionStats];
        const repoIndex = currentStats.findIndex(stat => stat.repoId === repoId);
        if (repoIndex >= 0) {
          currentStats[repoIndex] = {
            ...currentStats[repoIndex],
            isRefreshing: false,
            status: 'error',
            hasError: true,
            error: `HTTP ${response.status}: ${response.statusText}`
          } as ActionStatistics;
          onActionStatsUpdate(currentStats);
          console.log(`❌ [Frontend] Error UI updated for repository: ${repoName} - refreshing state cleared`);
        }
      }
    } catch (error) {
      console.error(`💥 [Frontend] SINGLE REFRESH CALL ERROR for repository: ${repoName}:`, error);
      
      // Clear refreshing state on error
      const currentStats = [...actionStats];
      const repoIndex = currentStats.findIndex(stat => stat.repoId === repoId);
      if (repoIndex >= 0) {
        currentStats[repoIndex] = {
          ...currentStats[repoIndex],
          isRefreshing: false,
          status: 'error',
          hasError: true,
          error: error instanceof Error ? error.message : 'Network error'
        } as ActionStatistics;
        onActionStatsUpdate(currentStats);
        console.log(`❌ [Frontend] Network error UI updated for repository: ${repoName} - refreshing state cleared`);
      }
    } finally {
      // Remove from pending refreshes
      setPendingRefreshes(prev => {
        const newSet = new Set(prev);
        newSet.delete(repoId);
        return newSet;
      });
      
      // Clean up refresh start time tracking
      delete refreshStartTimesRef.current[repoId];
      
      console.log(`🔧 [Frontend] Cleanup completed for repository: ${repoName} - removed from pending refreshes`);
    }
  }, [user, actionStats, onActionStatsUpdate, repositories, pendingRefreshes]);

  // Reset timer for a specific repository (after manual refresh)
  const resetRepositoryTimer = useCallback((repoId: number) => {
    setRepositoryTimers(prev => {
      const repo = repositories.find(r => r.id === repoId);
      if (!repo || !prev[repoId]) return prev;
      
      return {
        ...prev,
        [repoId]: {
          ...prev[repoId],
          timeLeft: repo.auto_refresh_interval,
          isActive: true
        }
      };
    });
  }, [repositories]);

  // Function to manually refresh a specific repository
  const manualRefreshRepository = useCallback(async (repoId: number) => {
    const repo = repositories.find(r => r.id === repoId);
    const repoName = repo?.repository_name || `repo-${repoId}`;
    
    console.log(`🔄 [Frontend] MANUAL REFRESH triggered for repository: ${repoName} (ID: ${repoId})`);
    setIsRefreshing(repoId);
    
    try {
      // Reset the timer for this repository
      resetRepositoryTimer(repoId);
      
      // Mark the repository as refreshing in the UI immediately
      const currentStats = [...actionStats];
      const repoIndex = currentStats.findIndex(stat => stat.repoId === repoId);
      if (repoIndex >= 0) {
        currentStats[repoIndex] = {
          ...currentStats[repoIndex],
          isRefreshing: true
        };
        onActionStatsUpdate(currentStats);
      }
      
      // Trigger a force refresh for only this repository
      await refreshSingleRepository(repoId, true);
      
      console.log(`✅ [Frontend] MANUAL REFRESH completed for repository: ${repoName}`);
    } catch (error) {
      console.error(`💥 [Frontend] MANUAL REFRESH error for repository: ${repoName}:`, error);
      
      // Clear refreshing state on error
      const currentStats = [...actionStats];
      const repoIndex = currentStats.findIndex(stat => stat.repoId === repoId);
      if (repoIndex >= 0) {
        currentStats[repoIndex] = {
          ...currentStats[repoIndex],
          isRefreshing: false
        };
        onActionStatsUpdate(currentStats);
      }
    } finally {
      setIsRefreshing(null);
    }
  }, [resetRepositoryTimer, refreshSingleRepository, actionStats, onActionStatsUpdate, repositories]);

  // Function to process queued refreshes with staggering
  const processRefreshQueue = useCallback(async () => {
    const queue = refreshQueueRef.current;
    if (queue.length === 0) return;
    
    // Sort by scheduled time
    queue.sort((a, b) => a.scheduledTime - b.scheduledTime);
    
    const now = Date.now();
    const readyToRefresh = queue.filter(item => item.scheduledTime <= now);
    
    if (readyToRefresh.length > 0) {
      console.log(`🔄 [Frontend] Processing ${readyToRefresh.length} queued timer refreshes`);
      
      // Remove processed items from queue
      refreshQueueRef.current = queue.filter(item => item.scheduledTime > now);
      
      // Process refreshes with a small delay between each to avoid overwhelming
      for (let i = 0; i < readyToRefresh.length; i++) {
        const { repoId } = readyToRefresh[i];
        
        // Add a small stagger delay (100ms between each)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        await refreshSingleRepository(repoId, true);
      }
    }
  }, [refreshSingleRepository]);

  // Initialize timers when repositories change
  useEffect(() => {
    const newTimers: Record<number, RepositoryTimer> = {};
    
    repositories.forEach(repo => {
      newTimers[repo.id] = {
        timeLeft: repo.auto_refresh_interval,
        intervalId: null,
        isActive: false // Start inactive until first stats are loaded
      };
    });
    
    setRepositoryTimers(newTimers);
  }, [repositories]);

  // Activate timers when actionStats are updated from parent
  useEffect(() => {
    if (actionStats.length > 0) {
      setRepositoryTimers(prev => {
        const updated = { ...prev };
        let hasChanges = false;
        
        actionStats.forEach(stat => {
          if (updated[stat.repoId] && !updated[stat.repoId].isActive) {
            // Find the repository to get its refresh interval
            const repo = repositories.find(r => r.id === stat.repoId);
            if (repo) {
              updated[stat.repoId] = {
                ...updated[stat.repoId],
                isActive: true,
                timeLeft: repo.auto_refresh_interval // Reset timer when first activated
              };
              hasChanges = true;
              console.log(`⏰ [Frontend] Timer activated for repository: ${repo.repository_name} (reset to ${repo.auto_refresh_interval}s)`);
            }
          }
        });
        
        return hasChanges ? updated : prev;
      });
    }
  }, [actionStats, repositories]);

  // Enhanced timer system with staggered refresh queue
  useEffect(() => {
    const globalInterval = setInterval(() => {
      setRepositoryTimers(prev => {
        const updated = { ...prev };
        let hasChanges = false;
        const expiredRepos: number[] = [];
        
        repositories.forEach(repo => {
          if (updated[repo.id] && updated[repo.id].isActive) {
            const newTimeLeft = updated[repo.id].timeLeft - 1;
            
            if (newTimeLeft <= 0) {
              // Timer expired - reset timer and queue for refresh
              updated[repo.id] = {
                ...updated[repo.id],
                timeLeft: repo.auto_refresh_interval
              };
              
              // Check if we're in grace period after bulk refresh
              const isInGracePeriod = bulkRefreshEndTimeRef.current > 0 && 
                                    (Date.now() - bulkRefreshEndTimeRef.current) < 10000; // 10 second grace period
              
              if (!isBulkRefreshing && !pendingRefreshes.has(repo.id) && !isInGracePeriod) {
                expiredRepos.push(repo.id);
                console.log(`⏰ [Frontend] TIMER EXPIRED for repository: ${repo.repository_name} (ID: ${repo.id}), adding to refresh queue`);
              } else if (isBulkRefreshing) {
                console.log(`⏰ [Frontend] TIMER REFRESH skipped for repository: ${repo.repository_name} (bulk refresh in progress)`);
              } else if (isInGracePeriod) {
                console.log(`⏰ [Frontend] TIMER REFRESH skipped for repository: ${repo.repository_name} (in grace period after bulk refresh)`);
              } else {
                console.log(`⏰ [Frontend] TIMER REFRESH skipped for repository: ${repo.repository_name} (already refreshing)`);
              }
              hasChanges = true;
            } else {
              updated[repo.id] = {
                ...updated[repo.id],
                timeLeft: newTimeLeft
              };
              hasChanges = true;
            }
          }
        });
        
        // Handle expired timers with staggered scheduling
        if (expiredRepos.length > 0) {
          console.log(`⏰ [Frontend] Scheduling ${expiredRepos.length} repositories for staggered refresh`);
          
          // Add to queue with staggered timing (200ms intervals)
          expiredRepos.forEach((repoId, index) => {
            const scheduledTime = Date.now() + (index * 200); // 200ms stagger
            refreshQueueRef.current.push({ repoId, scheduledTime });
          });
        }
        
        return hasChanges ? updated : prev;
      });
    }, 1000);
    
    return () => clearInterval(globalInterval);
  }, [repositories, isBulkRefreshing, pendingRefreshes]);

  // Process refresh queue every 100ms
  useEffect(() => {
    const queueInterval = setInterval(() => {
      processRefreshQueue();
    }, 100);
    
    return () => clearInterval(queueInterval);
  }, [processRefreshQueue]);

  // Cleanup stuck refreshing states - runs every 5 seconds
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      
      // Clear pending refreshes that have been pending for more than 30 seconds
      setPendingRefreshes(prev => {
        const newSet = new Set(prev);
        let hasChanges = false;
        
        prev.forEach(repoId => {
          const refreshStartTime = refreshStartTimesRef.current[repoId];
          const repo = repositories.find(r => r.id === repoId);
          
          // If repository has been refreshing for more than 30 seconds, clear it
          if (refreshStartTime && (now - refreshStartTime) > 30000) {
            console.log(`🧹 [Frontend] Clearing stuck refreshing state for repository: ${repo?.repository_name || `repo-${repoId}`} (timeout: 30 seconds)`);
            
            // Update the repository stats to clear refreshing state
            const currentStats = [...actionStats];
            const repoIndex = currentStats.findIndex(s => s.repoId === repoId);
            if (repoIndex >= 0) {
              currentStats[repoIndex] = {
                ...currentStats[repoIndex],
                isRefreshing: false,
                status: currentStats[repoIndex].status === 'refreshing' ? 'unknown' : currentStats[repoIndex].status
              };
              onActionStatsUpdate(currentStats);
            }
            
            // Clean up tracking
            delete refreshStartTimesRef.current[repoId];
            newSet.delete(repoId);
            hasChanges = true;
          }
        });
        
        return hasChanges ? newSet : prev;
      });
      
      // Also check for any repositories stuck in refreshing state without being in pendingRefreshes
      const currentStats = [...actionStats];
      let needsUpdate = false;
      
      currentStats.forEach((stat, index) => {
        if (stat.isRefreshing && !pendingRefreshes.has(stat.repoId)) {
          const repo = repositories.find(r => r.id === stat.repoId);
          console.log(`🧹 [Frontend] Found orphaned refreshing state for repository: ${repo?.repository_name || `repo-${stat.repoId}`} - clearing`);
          
          currentStats[index] = {
            ...stat,
            isRefreshing: false,
            status: stat.status === 'refreshing' ? 'unknown' : stat.status
          };
          needsUpdate = true;
        }
      });
      
      if (needsUpdate) {
        onActionStatsUpdate(currentStats);
      }
      
      // Clean up old items from refresh queue (older than 5 minutes)
      const oldQueueLength = refreshQueueRef.current.length;
      refreshQueueRef.current = refreshQueueRef.current.filter(
        item => (now - item.scheduledTime) < 5 * 60 * 1000
      );
      
      if (refreshQueueRef.current.length !== oldQueueLength) {
        console.log(`🧹 [Frontend] Cleaned up ${oldQueueLength - refreshQueueRef.current.length} old refresh queue items`);
      }
    }, 5000); // Run every 5 seconds (more frequent cleanup to catch orphaned states)
    
    return () => clearInterval(cleanupInterval);
  }, [repositories, actionStats, onActionStatsUpdate, pendingRefreshes]);

  // Format time left display
  const formatTimeLeft = (seconds: number): string => {
    if (seconds <= 0) return '0s';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  // Calculate repository status based on latest runs or use backend status
  const getRepositoryStatus = (repoId: number): string => {
    const stat = actionStats.find(s => s.repoId === repoId);
    if (!stat) return 'unknown';
    
    // Check all possible refreshing states to prevent flickering during multiple refreshes
    if (stat.isRefreshing || isRefreshing === repoId || pendingRefreshes.has(repoId)) {
      return 'refreshing';
    }
    
    // Use the backend-calculated status if available
    if (stat.status) {
      return stat.status;
    }
    
    // Fallback to legacy calculation (should not be needed with updated backend)
    const branchStatuses = Object.values(stat.branches)
      .filter(branch => branch.latestRun && !branch.error)
      .map(branch => branch.latestRun?.conclusion || branch.latestRun?.status || 'unknown');
    
    if (branchStatuses.length === 0) return 'unknown';
    
    // Priority: failure > pending/cancelled > success
    if (branchStatuses.some(status => status === 'failure')) return 'failure';
    if (branchStatuses.some(status => status === 'pending' || status === 'in_progress' || status === 'cancelled')) return 'pending';
    if (branchStatuses.every(status => status === 'success')) return 'success';
    
    return 'unknown';
  };

  // Get the base status of a repository (ignoring refreshing state) for sorting purposes
  const getBaseRepositoryStatus = (repoId: number): string => {
    const stat = actionStats.find(s => s.repoId === repoId);
    if (!stat) return 'unknown';
    
    // Use the backend-calculated status if available (but not refreshing)
    if (stat.status && stat.status !== 'refreshing') {
      return stat.status;
    }
    
    // Fallback to legacy calculation
    const branchStatuses = Object.values(stat.branches)
      .filter(branch => branch.latestRun && !branch.error)
      .map(branch => branch.latestRun?.conclusion || branch.latestRun?.status || 'unknown');
    
    if (branchStatuses.length === 0) return 'unknown';
    
    // Priority: failure > pending/cancelled > success
    if (branchStatuses.some(status => status === 'failure')) return 'failure';
    if (branchStatuses.some(status => status === 'pending' || status === 'in_progress' || status === 'cancelled')) return 'pending';
    if (branchStatuses.every(status => status === 'success')) return 'success';
    
    return 'unknown';
  };

  // Get CSS class name for repository status
  const getStatusClassName = (repoId: number): string => {
    const stat = actionStats.find(s => s.repoId === repoId);
    if (!stat) return 'status-unknown';
    
    // Check all possible refreshing states to prevent flickering
    if (stat.isRefreshing || isRefreshing === repoId || pendingRefreshes.has(repoId)) {
      return 'status-refreshing';
    }
    
    // Use the actual status
    const status = stat.status || 'unknown';
    return `status-${status}`;
  };

  // Get display name for a repository (use custom display name if available, otherwise repository name)
  const getRepositoryDisplayName = (repo: Repository): string => {
    return repo.display_name && repo.display_name.trim() ? repo.display_name : repo.repository_name;
  };

  const removeRepository = async (repoId: number) => {
    if (!user) return;

    setIsRemoving(repoId);
    setError(null);
    try {
      const response = await fetch(`/api/repositories/tracked/${encodeURIComponent(user.id)}/${repoId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onRepositoryRemoved(repoId);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setError(`Failed to remove repository: ${errorData.error || 'Please try again'}`);
      }
    } catch (error) {
      console.error('Error removing repository:', error);
      setError('Network error occurred while removing repository');
    } finally {
      setIsRemoving(null);
    }
  };

  const openConfigModal = (repoId: number) => {
    setShowConfigModal(repoId);
  };

  const closeConfigModal = () => {
    setShowConfigModal(null);
  };

  const openWorkflowStatus = async (repoId: number, forceRefresh: boolean = false) => {
    setShowWorkflowStatus(repoId);
    setIsLoadingWorkflowStatus(true);
    setWorkflowStatusData(null);
    setExpandedBranches({});
    
    if (!user) return;
    
    try {
      const encodedUserId = encodeURIComponent(user.id);
      const url = forceRefresh 
        ? `/api/actions/workflow-status/${encodedUserId}/${repoId}?force=true`
        : `/api/actions/workflow-status/${encodedUserId}/${repoId}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setWorkflowStatusData(data);
        
        // Initialize expanded branches state - expand all if only one branch, otherwise collapse all
        const branchNames = Object.keys(data.branches);
        const initialExpandedState: Record<string, boolean> = {};
        branchNames.forEach(branchName => {
          initialExpandedState[branchName] = branchNames.length === 1;
        });
        setExpandedBranches(initialExpandedState);
        
        // If the data shows it's still refreshing, poll for updates
        if (data.isRefreshing) {
          console.log('🔄 Repository is refreshing, will poll for updates');
          pollForWorkflowStatusUpdates(repoId);
        }
      } else {
        console.error('Failed to fetch workflow status');
      }
    } catch (error) {
      console.error('Error fetching workflow status:', error);
    } finally {
      setIsLoadingWorkflowStatus(false);
    }
  };

  // Poll for workflow status updates when repository is refreshing
  const pollForWorkflowStatusUpdates = async (repoId: number) => {
    if (!user || showWorkflowStatus !== repoId) return;
    
    try {
      const encodedUserId = encodeURIComponent(user.id);
      const response = await fetch(`/api/actions/workflow-status/${encodedUserId}/${repoId}`);
      if (response.ok) {
        const data = await response.json();
        setWorkflowStatusData(data);
        
        // If still refreshing, continue polling
        if (data.isRefreshing) {
          setTimeout(() => pollForWorkflowStatusUpdates(repoId), 2000); // Poll every 2 seconds
        } else {
          // Refresh completed, also update this specific repository stats
          console.log('🔄 Repository refresh completed, updating repository stats');
          await refreshSingleRepository(repoId);
        }
      }
    } catch (error) {
      console.error('Error polling for workflow status updates:', error);
    }
  };

  const refreshWorkflowStatus = async (repoId: number) => {
    if (!user) return;
    
    const repo = repositories.find(r => r.id === repoId);
    const repoName = repo?.repository_name || `repo-${repoId}`;
    
    console.log(`🔄 [Frontend] POPUP REFRESH triggered for repository: ${repoName} (ID: ${repoId})`);
    
    setIsLoadingWorkflowStatus(true);
    try {
      const encodedUserId = encodeURIComponent(user.id);
      const response = await fetch(`/api/actions/workflow-status/${encodedUserId}/${repoId}?force=true`);
      if (response.ok) {
        const data = await response.json();
        setWorkflowStatusData(data);
        
        // If the data shows it's refreshing, start polling for updates
        if (data.isRefreshing) {
          console.log(`🔄 [Frontend] Repository ${repoName} refresh started via POPUP, will poll for updates`);
          pollForWorkflowStatusUpdates(repoId);
        } else {
          // Refresh completed immediately, also update this specific repository stats
          console.log(`🔄 [Frontend] Repository ${repoName} refresh completed via POPUP, updating repository stats`);
          await refreshSingleRepository(repoId);
          
          // Reset the timer for this specific repository
          resetRepositoryTimer(repoId);
        }
        
      } else {
        console.error(`💥 [Frontend] Failed to refresh workflow status for ${repoName}: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`💥 [Frontend] Error refreshing workflow status for ${repoName}:`, error);
    } finally {
      setIsLoadingWorkflowStatus(false);
    }
  };

  const closeWorkflowStatus = () => {
    setShowWorkflowStatus(null);
    setWorkflowStatusData(null);
    setExpandedBranches({});
  };

  const toggleBranch = (branchName: string) => {
    setExpandedBranches(prev => ({
      ...prev,
      [branchName]: !prev[branchName]
    }));
  };

  // Calculate overall branch status based on workflows
  const getBranchStatus = (branchData: { workflows: Record<string, WorkflowRun | { status: 'no_runs'; conclusion: null; name: string; workflow_id: number; }>; error: string | null; }) => {
    if (branchData.error) return 'error';
    
    const workflows = Object.values(branchData.workflows);
    if (workflows.length === 0) return 'unknown';
    
    const statuses = workflows.map(workflow => {
      const status = workflow.status;
      const conclusion = 'conclusion' in workflow ? workflow.conclusion : null;
      return conclusion || status;
    });
    
    // Priority: failure/action_required > pending/in_progress > cancelled > success > no_runs
    if (statuses.some(status => status === 'failure')) return 'failure';
    if (statuses.some(status => status === 'action_required')) return 'action_required';
    if (statuses.some(status => status === 'pending' || status === 'in_progress')) return 'pending';
    if (statuses.some(status => status === 'cancelled')) return 'cancelled';
    if (statuses.some(status => status === 'success')) return 'success';
    if (statuses.every(status => status === 'no_runs')) return 'no_runs';
    
    return 'unknown';
  };

  // Sort workflows by status priority within a branch
  const getSortedWorkflows = (workflows: Record<string, WorkflowRun | { status: 'no_runs'; conclusion: null; name: string; workflow_id: number; }>) => {
    const statusPriority: Record<string, number> = {
      'failure': 1,
      'action_required': 2,
      'pending': 3,
      'in_progress': 4,
      'cancelled': 5,
      'success': 6,
      'no_runs': 7,
      'unknown': 8
    };
    
    return Object.entries(workflows).sort(([workflowNameA, workflowA], [workflowNameB, workflowB]) => {
      const statusA = workflowA.conclusion || workflowA.status;
      const statusB = workflowB.conclusion || workflowB.status;
      
      const priorityA = statusPriority[statusA] || 8;
      const priorityB = statusPriority[statusB] || 8;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same status, sort by workflow name alphabetically
      return workflowNameA.localeCompare(workflowNameB);
    });
  };

  // Sort branches by status priority
  const getSortedBranches = (branches: Record<string, { workflows: Record<string, WorkflowRun | { status: 'no_runs'; conclusion: null; name: string; workflow_id: number; }>; error: string | null; }>) => {
    const statusPriority: Record<string, number> = {
      'failure': 1,
      'action_required': 2,
      'pending': 3,
      'cancelled': 4,
      'success': 5,
      'no_runs': 6,
      'error': 7,
      'unknown': 8
    };
    
    return Object.entries(branches).sort(([branchNameA, branchDataA], [branchNameB, branchDataB]) => {
      const statusA = getBranchStatus(branchDataA);
      const statusB = getBranchStatus(branchDataB);
      
      const priorityA = statusPriority[statusA] || 8;
      const priorityB = statusPriority[statusB] || 8;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same status, sort by branch name alphabetically
      return branchNameA.localeCompare(branchNameB);
    });
  };

  // Sort repositories by status priority (failure first, then pending, success, unknown)
  // but preserve order during refresh to prevent jumping
  const getSortedRepositories = () => {
    const statusPriority: Record<string, number> = {
      'failure': 1,
      'pending': 2,
      'success': 3,
      'unknown': 4
    };
    
    return [...repositories].sort((a, b) => {
      // Get the actual status, but use non-refreshing status for sorting to prevent jumping
      const rawStatusA = getRepositoryStatus(a.id);
      const rawStatusB = getRepositoryStatus(b.id);
      
      // Use the underlying status for sorting (ignore refreshing state)
      const statusA = rawStatusA === 'refreshing' ? getBaseRepositoryStatus(a.id) : rawStatusA;
      const statusB = rawStatusB === 'refreshing' ? getBaseRepositoryStatus(b.id) : rawStatusB;
      
      const priorityA = statusPriority[statusA] || 4;
      const priorityB = statusPriority[statusB] || 4;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same status, sort by repository name
      return a.repository_name.localeCompare(b.repository_name);
    });
  };

  // Track when repositories become refreshing from external updates (e.g., dashboard bulk refresh)
  useEffect(() => {
    actionStats.forEach(stat => {
      if (stat.isRefreshing && !refreshStartTimesRef.current[stat.repoId]) {
        // Repository is refreshing but we haven't tracked it yet - it must be from external update
        refreshStartTimesRef.current[stat.repoId] = Date.now();
        const repo = repositories.find(r => r.id === stat.repoId);
        console.log(`📊 [Frontend] Tracking external refresh start for repository: ${repo?.repository_name || `repo-${stat.repoId}`}`);
      } else if (!stat.isRefreshing && refreshStartTimesRef.current[stat.repoId]) {
        // Repository is no longer refreshing - clean up tracking
        delete refreshStartTimesRef.current[stat.repoId];
      }
    });
  }, [actionStats, repositories]);

  if (repositories.length === 0) {
    return (
      <div className="repository-list empty">
        <p>No repositories are being tracked yet.</p>
      </div>
    );
  }

  const sortedRepositories = getSortedRepositories();

  return (
    <div className={`repository-list ${gridView ? 'grid-view' : ''} ${pendingRefreshes.size > 1 ? 'bulk-refreshing' : ''}`}>
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="dismiss-error">×</button>
        </div>
      )}
      <div className={gridView ? "repository-grid" : "repository-items"}>
        {sortedRepositories.map(repo => {
          const status = getRepositoryStatus(repo.id);
          const stat = actionStats.find(s => s.repoId === repo.id);
        return (
          <div key={repo.id} className={`repository-item status-${status}`}>
            <div className="repository-header-full">
              <div className="repo-actions-left">
                <button 
                  className="remove-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRepository(repo.id);
                  }}
                  disabled={isRemoving === repo.id}
                  title="Remove repository"
                >
                  {isRemoving === repo.id ? '...' : '✗'}
                </button>
                <button 
                  className="config-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openConfigModal(repo.id);
                  }}
                  title="Repository Configuration"
                >
                  ⚙️
                </button>
                <button 
                  className="refresh-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    manualRefreshRepository(repo.id);
                  }}
                  disabled={isRefreshing === repo.id || status === 'refreshing' || !repositoryTimers[repo.id]?.isActive || isInitialLoading}
                  title={!repositoryTimers[repo.id]?.isActive || isInitialLoading
                    ? "Loading repository data..." 
                    : status === 'refreshing' || isRefreshing === repo.id
                    ? "Repository is being refreshed..."
                    : "Refresh this repository"}
                >
                  {isRefreshing === repo.id || status === 'refreshing' || !repositoryTimers[repo.id]?.isActive || isInitialLoading ? '⏳' : '🔄'}
                </button>
                {repo.tracked_workflows.length > 0 && (
                  <span>Workflows: {repo.tracked_workflows.length}</span>
                )}
                <span>
                  Refresh: {isRefreshing === repo.id || status === 'refreshing'
                    ? 'Refreshing...'
                    : (repositoryTimers[repo.id] 
                        ? (repositoryTimers[repo.id].isActive 
                            ? formatTimeLeft(repositoryTimers[repo.id].timeLeft) 
                            : 'Loading...')
                        : repo.auto_refresh_interval + 's')}
                </span>
              </div>
              
              <div className="repo-status-right">
                <div className={`status-indicator status-${status}`} title={`Status: ${status}`}></div>
              </div>
            </div>
            
            <div className="repo-content" onClick={() => openWorkflowStatus(repo.id)}>
              <div className="repo-title-section">
                <h4>
                  <a 
                    href={repo.repository_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    onClick={(e) => e.stopPropagation()}
                    className={getStatusClassName(repo.id)}
                  >
                    {getRepositoryDisplayName(repo)}
                  </a>
                  {stat?.isCached && (
                    <span className="cache-indicator" title="Data from cache - click refresh for latest">
                      📋
                    </span>
                  )}
                </h4>
              </div>
            </div>
          </div>
        );
      })}
      </div>

      {/* Configuration Modal */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={closeConfigModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Repository Configuration</h3>
              <button 
                className="modal-close-button"
                onClick={closeConfigModal}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {(() => {
                const repo = repositories.find(r => r.id === showConfigModal);
                if (!repo) return null;
                
                return (
                  <div className="config-details">
                    <div className="config-item">
                      <strong>Repository:</strong>
                      <p>
                        <a 
                          href={repo.repository_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={getStatusClassName(repo.id)}
                        >
                          {getRepositoryDisplayName(repo)}
                        </a>
                      </p>
                    </div>
                    <div className="config-item">
                      <strong>Tracked Branches:</strong>
                      <ul>
                        {repo.tracked_branches.map(branch => (
                          <li key={branch}>{branch}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="config-item">
                      <strong>Tracked Workflows ({repo.tracked_workflows.length > 0 ? repo.tracked_workflows.length : 'All'}):</strong>
                      {repo.tracked_workflows.length > 0 ? (
                        <ul>
                          {repo.tracked_workflows.map(workflow => (
                            <li key={workflow}>{workflow}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="default-config">All workflows in the repository are being tracked</p>
                      )}
                    </div>
                    <div className="config-item">
                      <strong>Auto-refresh Interval:</strong>
                      <p>{repo.auto_refresh_interval} seconds</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Workflow Status Popup */}
      {showWorkflowStatus !== null && (
        <div className="modal-overlay" onClick={closeWorkflowStatus}>
          <div className="modal-content workflow-status-popup" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {workflowStatusData ? (
                  <>
                    {(() => {
                      const repo = repositories.find(r => r.id === showWorkflowStatus);
                      return repo ? getRepositoryDisplayName(repo) : workflowStatusData.repository;
                    })()} - Workflow Status
                    {workflowStatusData.isRefreshing ? (
                      <span className="refreshing-indicator" title="Refreshing workflow data...">🔄</span>
                    ) : (
                      <span className="cache-indicator" title="Data from cache">📋</span>
                    )}
                  </>
                ) : 'Workflow Status'}
              </h3>
              <div className="modal-header-actions">
                {!isLoadingWorkflowStatus && showWorkflowStatus !== null && (
                  <button 
                    className="refresh-button"
                    onClick={() => refreshWorkflowStatus(showWorkflowStatus)}
                    disabled={workflowStatusData?.isRefreshing}
                    title={workflowStatusData?.isRefreshing ? "Repository is being refreshed..." : "Force refresh workflow status"}
                  >
                    {workflowStatusData?.isRefreshing ? '⏳' : '🔄'}
                  </button>
                )}
                <button 
                  className="modal-close-button"
                  onClick={closeWorkflowStatus}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="modal-body">
              {isLoadingWorkflowStatus ? (
                <div className="loading-indicator">
                  <p>Loading workflow status...</p>
                </div>
              ) : workflowStatusData ? (
                <div className="workflow-status-details">
                  <div className="branch-workflow-groups">
                    {getSortedBranches(workflowStatusData.branches).map(([branchName, branchData]) => {
                      const branchStatus = getBranchStatus(branchData);
                      
                      return (
                        <div key={branchName} className="branch-group">
                          <div 
                            className="branch-header" 
                            onClick={() => toggleBranch(branchName)}
                          >
                            <div className="branch-title">
                              <div className={`branch-status-circle status-${branchStatus}`}></div>
                              <h5 className="branch-name">{branchName}</h5>
                            </div>
                            <span className={`branch-toggle ${expandedBranches[branchName] ? 'expanded' : ''}`}>
                              ▼
                            </span>
                          </div>
                        {expandedBranches[branchName] && (
                          <div className="branch-content">
                            {branchData.error ? (
                              <div className="error-message">
                                <span className="error-indicator">❌</span>
                                <span>Error: {branchData.error}</span>
                              </div>
                            ) : (
                              <div className="workflow-list">
                                {getSortedWorkflows(branchData.workflows).map(([workflowName, workflow]) => {
                                  const status = workflow.status;
                                  const conclusion = workflow.conclusion;
                                  const displayStatus = conclusion || status;
                                  
                                  return (
                                    <div key={workflowName} className={`workflow-item status-${displayStatus}`}>
                                      <div className="workflow-header">
                                        <span className="workflow-name">{workflowName}</span>
                                        <span className={`status-badge status-${displayStatus}`}>
                                          {displayStatus === 'success' ? '✅ ' : 
                                           displayStatus === 'failure' ? '❌ ' : 
                                           displayStatus === 'cancelled' ? '⏹️ ' : 
                                           displayStatus === 'in_progress' ? '⏳ ' : 
                                           displayStatus === 'pending' ? '⏳ ' : 
                                           displayStatus === 'no_runs' ? '➖ ' : 
                                           displayStatus === 'action_required' ? '⚠️ ' : '❓ '}
                                          {displayStatus.replace('_', ' ')}
                                        </span>
                                      </div>
                                      <div className="workflow-details">
                                        {workflow.status !== 'no_runs' && 'html_url' in workflow && (
                                          <>
                                            <div className="workflow-info">
                                              <span className="info-label">Run:</span>
                                              <a 
                                                href={workflow.html_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="run-link"
                                              >
                                                #{workflow.run_number}
                                              </a>
                                            </div>
                                            <div className="workflow-info">
                                              <span className="info-label">Updated:</span>
                                              <span className="info-value">
                                                {new Date(workflow.updated_at).toLocaleString()}
                                              </span>
                                            </div>
                                            <div className="workflow-info">
                                              <span className="info-label">SHA:</span>
                                              <span className="info-value sha">
                                                {workflow.head_sha.substring(0, 7)}
                                              </span>
                                            </div>
                                          </>
                                        )}
                                        {workflow.status === 'no_runs' && (
                                          <div className="workflow-info">
                                            <span className="info-value">No runs found for this workflow on this branch</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    })}
                  </div>
                </div>
              ) : (
                <div className="error-message">
                  <p>Failed to load workflow status. Please try again.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
