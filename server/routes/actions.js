import express from 'express';
import axios from 'axios';
import { db } from '../database.js';

const router = express.Router();

// Unified cache system for all workflow data
const unifiedCache = new Map();
const refreshLocks = new Map(); // Track ongoing refreshes to prevent duplicate calls
const CACHE_TTL = 60 * 1000; // 1 minute cache TTL
const MIN_REFRESH_INTERVAL = 30 * 1000; // Minimum 30 seconds between API calls per repo

// Unified cache structure: 
// userId -> {
//   repositories: {
//     repoId: {
//       repository: string,
//       repositoryUrl: string,
//       repoId: number,
//       serverName: string,
//       serverUrl: string,
//       branches: {
//         branchName: {
//           workflows: {
//             workflowName: WorkflowData
//           },
//           error: string | null
//         }
//       },
//       lastRefresh: timestamp,
//       isRefreshing: boolean
//     }
//   },
//   lastRefresh: timestamp
// }

function getUserCache(userId) {
  if (!unifiedCache.has(userId)) {
    unifiedCache.set(userId, {
      repositories: {},
      lastRefresh: 0
    });
  }
  return unifiedCache.get(userId);
}

function getRepositoryCache(userId, repoId) {
  const userCache = getUserCache(userId);
  return userCache.repositories[repoId] || null;
}

function isRepositoryCacheFresh(userId, repoId, minRefreshInterval = MIN_REFRESH_INTERVAL) {
  const repoCache = getRepositoryCache(userId, repoId);
  if (!repoCache) return false;
  const now = Date.now();
  return (now - repoCache.lastRefresh) < Math.max(CACHE_TTL, minRefreshInterval);
}

function shouldRefreshRepository(userId, repoId, minRefreshInterval = MIN_REFRESH_INTERVAL) {
  const repoCache = getRepositoryCache(userId, repoId);
  if (!repoCache) return true;
  const now = Date.now();
  return (now - repoCache.lastRefresh) >= minRefreshInterval;
}

// Refresh workflow data for a specific repository
async function refreshRepositoryWorkflows(userId, repository, force = false) {
  const repoId = repository.id;
  const userCache = getUserCache(userId);
  const refreshKey = `${userId}_${repoId}`;
  
  console.log(`🔄 [Backend] Starting workflow refresh for repository: ${repository.repository_name} (ID: ${repoId}, force: ${force}, user: ${userId})`);
  
  // Check if already refreshing
  if (refreshLocks.has(refreshKey)) {
    console.log(`⏳ [Backend] Repository ${repository.repository_name} is already being refreshed, returning existing cache`);
    return getRepositoryCache(userId, repoId);
  }

  // Check if we need to refresh
  if (!force && isRepositoryCacheFresh(userId, repoId, repository.auto_refresh_interval * 1000)) {
    console.log(`📋 [Backend] Using fresh cache for repository: ${repository.repository_name} (no refresh needed)`);
    return getRepositoryCache(userId, repoId);
  }

  if (!force && !shouldRefreshRepository(userId, repoId, repository.auto_refresh_interval * 1000)) {
    console.log(`⏱️ [Backend] Rate limited, using existing cache for repository: ${repository.repository_name}`);
    const repoCache = getRepositoryCache(userId, repoId);
    if (repoCache) {
      return { ...repoCache, isCached: true };
    }
  }

  // Set refresh lock
  refreshLocks.set(refreshKey, true);
  const refreshStartTime = Date.now();

  try {
    console.log(`🔄 [Backend] Fetching fresh workflow data for repository: ${repository.repository_name}`);
    
    // Initialize repository cache structure
    const repoCache = {
      repository: repository.repository_name,
      repositoryUrl: repository.repository_url,
      repoId: repository.id,
      serverName: repository.server_name,
      serverUrl: repository.server_url,
      branches: {},
      lastRefresh: Date.now(),
      isRefreshing: true
    };

    userCache.repositories[repoId] = repoCache;

    const [owner, repoName] = repository.repository_name.split('/');
    const trackedBranches = JSON.parse(repository.tracked_branches);
    const trackedWorkflows = JSON.parse(repository.tracked_workflows);

    const baseUrl = repository.server_url.replace(/\/$/, '');
    const apiUrl = baseUrl.includes('github.com') 
      ? 'https://api.github.com' 
      : `${baseUrl}/api/v3`;

    // Get all workflows for the repository
    let allWorkflows = [];
    try {
      const workflowsResponse = await axios.get(`${apiUrl}/repos/${owner}/${repoName}/actions/workflows`, {
        headers: {
          'Authorization': `token ${repository.api_token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      allWorkflows = workflowsResponse.data.workflows;

      // Filter workflows if tracking specific ones
      if (trackedWorkflows.length > 0) {
        allWorkflows = allWorkflows.filter(workflow => 
          trackedWorkflows.some(tracked => 
            workflow.path.includes(tracked) || workflow.name === tracked
          )
        );
      }
    } catch (error) {
      console.error(`Error fetching workflows for ${repository.repository_name}:`, error.message);
    }

    // For each branch, get the latest run for each workflow
    for (const branch of trackedBranches) {
      repoCache.branches[branch] = {
        workflows: {},
        error: null
      };

      try {
        // Get recent runs for this branch
        const runsResponse = await axios.get(`${apiUrl}/repos/${owner}/${repoName}/actions/runs`, {
          params: { branch, per_page: 100 },
          headers: {
            'Authorization': `token ${repository.api_token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        const runs = runsResponse.data.workflow_runs;

        // Group runs by workflow
        const workflowRuns = {};
        runs.forEach(run => {
          if (!workflowRuns[run.workflow_id]) {
            workflowRuns[run.workflow_id] = [];
          }
          workflowRuns[run.workflow_id].push(run);
        });

        // For each workflow, get the latest run
        for (const workflow of allWorkflows) {
          const workflowName = workflow.name;
          const latestRuns = workflowRuns[workflow.id] || [];
          
          if (latestRuns.length > 0) {
            // Sort by created_at to get the latest
            latestRuns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const latestRun = latestRuns[0];
            
            repoCache.branches[branch].workflows[workflowName] = {
              id: latestRun.id,
              name: latestRun.name,
              status: latestRun.status,
              conclusion: latestRun.conclusion,
              created_at: latestRun.created_at,
              updated_at: latestRun.updated_at,
              html_url: latestRun.html_url,
              head_branch: latestRun.head_branch,
              head_sha: latestRun.head_sha,
              workflow_id: latestRun.workflow_id,
              run_number: latestRun.run_number
            };
          } else {
            // No runs found for this workflow on this branch
            repoCache.branches[branch].workflows[workflowName] = {
              status: 'no_runs',
              conclusion: null,
              name: workflowName,
              workflow_id: workflow.id
            };
          }
        }

      } catch (error) {
        console.error(`Error fetching runs for ${repository.repository_name}/${branch}:`, error.message);
        repoCache.branches[branch].error = error.message;
      }

      // Add delay between branch requests to avoid rate limiting
      if (trackedBranches.indexOf(branch) < trackedBranches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Mark as no longer refreshing
    repoCache.isRefreshing = false;
    repoCache.lastRefresh = Date.now();

    const refreshEndTime = Date.now();
    const refreshDuration = refreshEndTime - refreshStartTime;
    console.log(`✅ [Backend] Completed workflow data refresh for repository: ${repository.repository_name} (took ${refreshDuration}ms)`);
    return repoCache;

  } catch (error) {
    const refreshEndTime = Date.now();
    const refreshDuration = refreshEndTime - refreshStartTime;
    console.error(`❌ [Backend] Error refreshing repository ${repository.repository_name} (took ${refreshDuration}ms):`, error.message);
    
    // Create error cache entry
    const errorCache = {
      repository: repository.repository_name,
      repositoryUrl: repository.repository_url,
      repoId: repository.id,
      serverName: repository.server_name,
      serverUrl: repository.server_url,
      branches: {},
      lastRefresh: Date.now(),
      isRefreshing: false,
      hasError: true,
      error: error.message
    };

    userCache.repositories[repoId] = errorCache;
    return errorCache;

  } finally {
    // Remove refresh lock
    refreshLocks.delete(refreshKey);
  }
}

// Calculate repository statistics from unified cache
function calculateRepositoryStats(userId, repoId) {
  const repoCache = getRepositoryCache(userId, repoId);
  if (!repoCache) return null;

  const repoStats = {
    repository: repoCache.repository,
    repositoryUrl: repoCache.repositoryUrl,
    repoId: repoCache.repoId,
    serverName: repoCache.serverName,
    serverUrl: repoCache.serverUrl,
    branches: {},
    overall: { success: 0, failure: 0, pending: 0, cancelled: 0 },
    isRefreshing: repoCache.isRefreshing || false,
    isCached: !repoCache.isRefreshing && (Date.now() - repoCache.lastRefresh) > 10000 // Consider cached if older than 10 seconds
  };

  if (repoCache.hasError) {
    repoStats.status = 'error';
    repoStats.hasError = true;
    repoStats.error = repoCache.error;
    return repoStats;
  }

  // Track latest workflow runs for overall repository status calculation
  const latestWorkflowRuns = [];
  let hasFailure = false;
  let hasPending = false;
  let hasPermissionError = false;

  // Process each branch
  Object.entries(repoCache.branches).forEach(([branchName, branchData]) => {
    repoStats.branches[branchName] = {
      success: 0,
      failure: 0,
      pending: 0,
      cancelled: 0,
      workflows: {}
    };

    if (branchData.error) {
      repoStats.branches[branchName].error = branchData.error;
      if (branchData.error.includes('Access denied') || branchData.error.includes('not found')) {
        hasPermissionError = true;
      }
      return;
    }

    // Process each workflow in the branch
    Object.entries(branchData.workflows).forEach(([workflowName, workflowData]) => {
      if (workflowData.status === 'no_runs') {
        return; // Skip workflows with no runs
      }

      const status = workflowData.conclusion || workflowData.status;
      const normalizedStatus = status === 'success' ? 'success' 
        : status === 'failure' ? 'failure'
        : status === 'cancelled' ? 'cancelled'
        : 'pending';

      // Count this workflow's status for the branch
      repoStats.branches[branchName][normalizedStatus]++;

      // Store workflow details
      repoStats.branches[branchName].workflows[workflowName] = {
        status: workflowData.status,
        conclusion: workflowData.conclusion,
        created_at: workflowData.created_at,
        html_url: workflowData.html_url,
        normalizedStatus
      };

      // Add to latest workflow runs for overall repo status
      latestWorkflowRuns.push({
        branch: branchName,
        workflow: workflowName,
        status: normalizedStatus,
        run: workflowData
      });

      // Track status flags
      if (normalizedStatus === 'failure') {
        hasFailure = true;
      } else if (normalizedStatus === 'pending') {
        hasPending = true;
      }
    });
  });

  // Calculate overall repository status
  latestWorkflowRuns.forEach(workflowRun => {
    repoStats.overall[workflowRun.status]++;
  });

  // Set repository status
  if (repoCache.isRefreshing) {
    repoStats.status = 'refreshing';
  } else if (hasPermissionError) {
    repoStats.status = 'error';
    repoStats.hasPermissionError = true;
  } else if (hasFailure) {
    repoStats.status = 'failure';
  } else if (hasPending) {
    repoStats.status = 'pending';
  } else if (latestWorkflowRuns.length > 0 && latestWorkflowRuns.every(wr => wr.status === 'success')) {
    repoStats.status = 'success';
  } else {
    repoStats.status = 'unknown';
  }

  return repoStats;
}

// Get workflow runs for a specific repository and branch
router.get('/runs/:owner/:repo', async (req, res) => {
  const { owner, repo } = req.params;
  const { userId, serverId, branch, workflowId } = req.query;

  if (!userId || !serverId) {
    return res.status(400).json({ error: 'userId and serverId are required' });
  }

  try {
    const server = await new Promise((resolve, reject) => {
      db.get(
        'SELECT server_url, api_token FROM github_servers WHERE id = ? AND user_id = ?',
        [serverId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!server) {
      return res.status(404).json({ error: 'GitHub server not found' });
    }

    const baseUrl = server.server_url.replace(/\/$/, '');
    const apiUrl = baseUrl.includes('github.com') 
      ? 'https://api.github.com' 
      : `${baseUrl}/api/v3`;

    let url = `${apiUrl}/repos/${owner}/${repo}/actions/runs`;
    const params = { per_page: 50 };
    
    if (branch) params.branch = branch;
    if (workflowId) url = `${apiUrl}/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`;

    const response = await axios.get(url, {
      params,
      headers: {
        'Authorization': `token ${server.api_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('GitHub API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch workflow runs',
      details: error.response?.data?.message || error.message
    });
  }
});

// Get aggregated action statistics for all tracked repositories
router.get('/stats/:userId', async (req, res) => {
  const { userId } = req.params;
  const { force } = req.query; // Allow force refresh
  
  const bulkStartTime = Date.now();
  console.log(`� [Backend] BULK REFRESH CALL STARTED for user: ${userId} (force: ${force === 'true'})`);

  try {
    // Get user's tracked repositories with GitHub server information
    const repositories = await new Promise((resolve, reject) => {
      db.all(
        `SELECT ur.*, gs.server_url, gs.api_token, gs.server_name
         FROM user_repositories ur 
         JOIN github_servers gs ON ur.github_server_id = gs.id 
         WHERE ur.user_id = ?`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    console.log(`📊 [Backend] BULK REFRESH processing ${repositories.length} repositories for user: ${userId}`);
    const stats = [];

    // Process each repository - refresh if needed, then calculate stats
    for (const repository of repositories) {
      const repoStartTime = Date.now();
      try {
        console.log(`📋 [Backend] BULK REFRESH processing repository ${repository.repository_name} (${repositories.indexOf(repository) + 1}/${repositories.length})`);
        
        // Refresh workflow data if needed (this handles caching internally)
        await refreshRepositoryWorkflows(userId, repository, force === 'true');
        
        // Calculate and return repository stats from unified cache
        const repoStats = calculateRepositoryStats(userId, repository.id);
        if (repoStats) {
          stats.push(repoStats);
          const repoEndTime = Date.now();
          console.log(`✅ [Backend] BULK REFRESH completed repository ${repository.repository_name} (took ${repoEndTime - repoStartTime}ms)`);
        }

        // Add small delay between repositories to avoid overwhelming the API
        if (repositories.indexOf(repository) < repositories.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        const repoEndTime = Date.now();
        console.error(`❌ [Backend] BULK REFRESH error processing repository ${repository.repository_name} (took ${repoEndTime - repoStartTime}ms):`, error);
        // Add error entry for this repository
        stats.push({
          repository: repository.repository_name,
          repositoryUrl: repository.repository_url,
          repoId: repository.id,
          serverName: repository.server_name,
          serverUrl: repository.server_url,
          branches: {},
          overall: { success: 0, failure: 0, pending: 0, cancelled: 0 },
          status: 'error',
          hasError: true,
          error: error.message
        });
      }
    }

    const bulkEndTime = Date.now();
    const bulkDuration = bulkEndTime - bulkStartTime;
    console.log(`🏁 [Backend] BULK REFRESH CALL COMPLETED for user: ${userId} - processed ${stats.length} repositories (total call duration: ${bulkDuration}ms)`);

    res.json(stats);
  } catch (error) {
    const bulkEndTime = Date.now();
    const bulkDuration = bulkEndTime - bulkStartTime;
    console.error(`💥 [Backend] BULK REFRESH CALL FAILED for user: ${userId} (call duration: ${bulkDuration}ms):`, error);
    res.status(500).json({ 
      error: 'Failed to fetch action statistics',
      details: error.message 
    });
  }
});

// Get detailed workflow status for a specific repository
router.get('/workflow-status/:userId/:repoId', async (req, res) => {
  const { userId, repoId } = req.params;
  const forceRefresh = req.query.force === 'true';

  try {
    // Get repository information
    const repository = await new Promise((resolve, reject) => {
      db.get(
        `SELECT ur.*, gs.server_url, gs.api_token, gs.server_name
         FROM user_repositories ur 
         JOIN github_servers gs ON ur.github_server_id = gs.id 
         WHERE ur.user_id = ? AND ur.id = ?`,
        [userId, repoId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Refresh workflow data if needed (this handles caching internally)
    await refreshRepositoryWorkflows(userId, repository, forceRefresh);
    
    // Get detailed data from unified cache
    const repoCache = getRepositoryCache(userId, repoId);
    if (!repoCache) {
      return res.status(500).json({ error: 'Failed to load repository data' });
    }

    // Return the detailed workflow status directly from cache
    const detailedStatus = {
      repository: repoCache.repository,
      repositoryUrl: repoCache.repositoryUrl,
      repoId: repoCache.repoId,
      branches: repoCache.branches,
      isRefreshing: repoCache.isRefreshing || false
    };

    res.json(detailedStatus);

  } catch (error) {
    console.error('Error fetching detailed workflow status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch detailed workflow status',
      details: error.message 
    });
  }
});

// Refresh a single repository
router.post('/refresh/:userId/:repoId', async (req, res) => {
  const { userId, repoId } = req.params;
  const forceRefresh = req.query.force === 'true';
  
  const singleRefreshStartTime = Date.now();
  console.log(`🎯 [Backend] SINGLE REFRESH CALL STARTED for repoId: ${repoId}, user: ${userId}, force: ${forceRefresh}`);

  try {
    // Get repository information
    const repository = await new Promise((resolve, reject) => {
      db.get(
        `SELECT ur.*, gs.server_url, gs.api_token, gs.server_name
         FROM user_repositories ur 
         JOIN github_servers gs ON ur.github_server_id = gs.id 
         WHERE ur.user_id = ? AND ur.id = ?`,
        [userId, repoId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!repository) {
      console.error(`💥 [Backend] SINGLE REFRESH CALL FAILED - repository not found: repoId=${repoId}, user=${userId}`);
      return res.status(404).json({ error: 'Repository not found' });
    }

    console.log(`📋 [Backend] SINGLE REFRESH found repository: ${repository.repository_name}`);

    // Refresh workflow data for this specific repository
    await refreshRepositoryWorkflows(userId, repository, forceRefresh);
    
    // Calculate and return repository stats from unified cache
    const repoStats = calculateRepositoryStats(userId, repository.id);
    if (!repoStats) {
      console.error(`💥 [Backend] SINGLE REFRESH CALL FAILED - failed to load repository data after refresh: ${repository.repository_name}`);
      return res.status(500).json({ error: 'Failed to load repository data' });
    }

    const singleRefreshEndTime = Date.now();
    const singleRefreshDuration = singleRefreshEndTime - singleRefreshStartTime;
    console.log(`🏁 [Backend] SINGLE REFRESH CALL COMPLETED for ${repository.repository_name} (total call duration: ${singleRefreshDuration}ms)`);

    res.json(repoStats);

  } catch (error) {
    const singleRefreshEndTime = Date.now();
    const singleRefreshDuration = singleRefreshEndTime - singleRefreshStartTime;
    console.error(`💥 [Backend] SINGLE REFRESH CALL FAILED (call duration: ${singleRefreshDuration}ms):`, error);
    res.status(500).json({ 
      error: 'Failed to refresh repository',
      details: error.message 
    });
  }
});

export default router;
