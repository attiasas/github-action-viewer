import express from 'express';
import axios from 'axios';
import { db } from '../database.js';

const router = express.Router();

// Cache system for GitHub API responses
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute cache TTL
const MIN_REFRESH_INTERVAL = 30 * 1000; // Minimum 30 seconds between API calls per repo

// Cache entry structure: { data, timestamp, lastApiCall }
function getCacheKey(userId, repoId) {
  return `stats_${userId}_${repoId}`;
}

function isDataFresh(cacheEntry, minRefreshInterval = MIN_REFRESH_INTERVAL) {
  if (!cacheEntry) return false;
  const now = Date.now();
  return (now - cacheEntry.timestamp) < CACHE_TTL && 
         (now - cacheEntry.lastApiCall) < minRefreshInterval;
}

function shouldMakeApiCall(cacheEntry) {
  if (!cacheEntry) return true;
  const now = Date.now();
  return (now - cacheEntry.lastApiCall) >= MIN_REFRESH_INTERVAL;
}

// Batch processing queue
const batchQueue = new Map(); // userId -> { repositories, timeout }
const BATCH_DELAY = 2000; // 2 seconds to collect requests

// Handle batched requests to minimize API calls
async function handleBatchedRequest(userId, repositories, req, res) {
  const cacheKey = `stats_${userId}`;
  const cacheEntry = cache.get(cacheKey);
  
  // If we have fresh cached data, return it immediately
  if (isDataFresh(cacheEntry)) {
    return res.json(cacheEntry.data);
  }

  // If there's already a batch in progress, wait for it
  if (batchQueue.has(userId)) {
    const batch = batchQueue.get(userId);
    batch.waitingResponses = batch.waitingResponses || [];
    batch.waitingResponses.push(res);
    return;
  }

  // Start a new batch
  batchQueue.set(userId, {
    repositories,
    waitingResponses: [res],
    timeout: setTimeout(async () => {
      await processBatch(userId);
    }, BATCH_DELAY)
  });
}

// Process a batch of repositories
async function processBatch(userId) {
  const batch = batchQueue.get(userId);
  if (!batch) return;

  try {
    const stats = await processRepositoriesStats(batch.repositories, false);
    
    // Cache the results
    const cacheKey = `stats_${userId}`;
    cache.set(cacheKey, {
      data: stats,
      timestamp: Date.now(),
      lastApiCall: Date.now()
    });

    // Respond to all waiting requests
    batch.waitingResponses.forEach(res => {
      if (!res.headersSent) {
        res.json(stats);
      }
    });
  } catch (error) {
    console.error('Error processing batch:', error);
    batch.waitingResponses.forEach(res => {
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Failed to fetch action statistics',
          details: error.message 
        });
      }
    });
  } finally {
    batchQueue.delete(userId);
  }
}

// Process repositories stats with caching and rate limiting
async function processRepositoriesStats(repositories, force = false) {
  const stats = [];
  const now = Date.now();

  // Group repositories by server to optimize API calls
  const reposByServer = {};
  repositories.forEach(repo => {
    const serverKey = `${repo.server_url}_${repo.api_token}`;
    if (!reposByServer[serverKey]) {
      reposByServer[serverKey] = [];
    }
    reposByServer[serverKey].push(repo);
  });

  // Process each server group
  for (const serverKey in reposByServer) {
    const serverRepos = reposByServer[serverKey];
    
    // Add delay between different servers to spread API load
    if (Object.keys(reposByServer).length > 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Process repositories for this server with staggered requests
    for (let i = 0; i < serverRepos.length; i++) {
      const repo = serverRepos[i];
      const repoKey = getCacheKey('repo', repo.id);
      const cacheEntry = cache.get(repoKey);

      // Check if we should skip this repo due to rate limiting or fresh cache
      if (!force && isDataFresh(cacheEntry, repo.auto_refresh_interval * 1000)) {
        stats.push(cacheEntry.data);
        continue;
      }

      if (!force && !shouldMakeApiCall(cacheEntry)) {
        // Rate limited, use cached data if available
        if (cacheEntry && cacheEntry.data) {
          stats.push({ ...cacheEntry.data, isCached: true });
          continue;
        }
      }

      try {
        // Add staggered delay between repos on same server
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const repoStats = await processRepositoryStats(repo);
        stats.push(repoStats);

        // Cache individual repository stats
        cache.set(repoKey, {
          data: repoStats,
          timestamp: now,
          lastApiCall: now
        });

      } catch (error) {
        console.error(`Error processing repository ${repo.repository_name}:`, error.message);
        
        // Use cached data if available, otherwise add error state
        const cacheEntry = cache.get(repoKey);
        if (cacheEntry && cacheEntry.data) {
          stats.push({ ...cacheEntry.data, hasError: true });
        } else {
          stats.push({
            repository: repo.repository_name,
            repositoryUrl: repo.repository_url,
            repoId: repo.id,
            serverName: repo.server_name,
            serverUrl: repo.server_url,
            branches: {},
            overall: { success: 0, failure: 0, pending: 0, cancelled: 0 },
            status: 'error',
            hasError: true,
            error: error.message
          });
        }
      }
    }
  }

  return stats;
}

// Process a single repository's stats
async function processRepositoryStats(repo) {
  const [owner, repoName] = repo.repository_name.split('/');
  const trackedBranches = JSON.parse(repo.tracked_branches);
  const trackedWorkflows = JSON.parse(repo.tracked_workflows);

  const baseUrl = repo.server_url.replace(/\/$/, '');
  const apiUrl = baseUrl.includes('github.com') 
    ? 'https://api.github.com' 
    : `${baseUrl}/api/v3`;

  const repoStats = {
    repository: repo.repository_name,
    repositoryUrl: repo.repository_url,
    repoId: repo.id,
    serverName: repo.server_name,
    serverUrl: repo.server_url,
    branches: {},
    overall: { success: 0, failure: 0, pending: 0, cancelled: 0 }
  };

  // Check for permission errors first
  let hasPermissionError = false;
  let permissionError = null;

  // Get all workflows for the repository
  let allWorkflows = [];
  try {
    const workflowsResponse = await axios.get(`${apiUrl}/repos/${owner}/${repoName}/actions/workflows`, {
      headers: {
        'Authorization': `token ${repo.api_token}`,
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
    console.error(`Error fetching workflows for ${repo.repository_name}:`, error.message);
    if (error.response?.status === 403 || error.response?.status === 401) {
      hasPermissionError = true;
      permissionError = `Access denied to ${repo.repository_name}. Please check your token permissions.`;
    } else if (error.response?.status === 404) {
      hasPermissionError = true;
      permissionError = `Repository ${repo.repository_name} not found or not accessible.`;
    }
  }

  // Track latest workflow runs for overall repository status calculation
  const latestWorkflowRuns = [];

  for (const branch of trackedBranches) {
    repoStats.branches[branch] = { 
      success: 0, 
      failure: 0, 
      pending: 0, 
      cancelled: 0,
      workflows: {}
    };

    try {
      const response = await axios.get(`${apiUrl}/repos/${owner}/${repoName}/actions/runs`, {
        params: { branch, per_page: 100 },
        headers: {
          'Authorization': `token ${repo.api_token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      const runs = response.data.workflow_runs;

      // Group runs by workflow_id to find latest run for each workflow
      const workflowRuns = {};
      runs.forEach(run => {
        if (!workflowRuns[run.workflow_id]) {
          workflowRuns[run.workflow_id] = [];
        }
        workflowRuns[run.workflow_id].push(run);
      });

      // For each tracked workflow, find the latest run and count its status
      for (const workflow of allWorkflows) {
        const workflowId = workflow.id;
        const workflowName = workflow.name;
        const runs = workflowRuns[workflowId] || [];
        
        if (runs.length > 0) {
          // Sort by created_at to get the latest run
          runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          const latestRun = runs[0];
          
          const status = latestRun.conclusion || latestRun.status;
          const normalizedStatus = status === 'success' ? 'success' 
            : status === 'failure' ? 'failure'
            : status === 'cancelled' ? 'cancelled'
            : 'pending';
          
          // Count this workflow's latest run status for the branch
          repoStats.branches[branch][normalizedStatus]++;
          
          // Store workflow details for this branch
          repoStats.branches[branch].workflows[workflowName] = {
            status: latestRun.status,
            conclusion: latestRun.conclusion,
            created_at: latestRun.created_at,
            html_url: latestRun.html_url,
            normalizedStatus
          };

          // Add to latest workflow runs for overall repo status
          latestWorkflowRuns.push({
            branch,
            workflow: workflowName,
            status: normalizedStatus,
            run: latestRun
          });
        }
      }

      // Store overall latest run info for the branch
      if (runs.length > 0) {
        repoStats.branches[branch].latestRun = runs[0];
      }

    } catch (error) {
      console.error(`Error fetching runs for ${repo.repository_name}/${branch}:`, error.message);
      repoStats.branches[branch].error = error.message;
      
      if (error.response?.status === 403 || error.response?.status === 401) {
        hasPermissionError = true;
        permissionError = `Access denied to ${repo.repository_name}. Please check your token permissions.`;
      } else if (error.response?.status === 404) {
        hasPermissionError = true;
        permissionError = `Repository ${repo.repository_name} not found or not accessible.`;
      }
    }
  }

  // Calculate overall repository status based on latest workflow runs only
  repoStats.overall = { success: 0, failure: 0, pending: 0, cancelled: 0 };
  let hasFailure = false;
  let hasPending = false;

  latestWorkflowRuns.forEach(workflowRun => {
    repoStats.overall[workflowRun.status]++;
    if (workflowRun.status === 'failure') {
      hasFailure = true;
    } else if (workflowRun.status === 'pending') {
      hasPending = true;
    }
  });

  // Set repository status based on latest workflow runs
  if (hasPermissionError) {
    repoStats.status = 'error';
    repoStats.hasPermissionError = true;
    repoStats.permissionError = permissionError;
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

// Helper function to generate repository stats from detailed workflow status
function generateRepositoryStatsFromDetailed(detailedStatus, repository) {
  const repoStats = {
    repository: detailedStatus.repository,
    repositoryUrl: detailedStatus.repositoryUrl,
    repoId: detailedStatus.repoId,
    serverName: repository.server_name,
    serverUrl: repository.server_url,
    branches: {},
    overall: { success: 0, failure: 0, pending: 0, cancelled: 0 }
  };

  // Track latest workflow runs for overall repository status calculation
  const latestWorkflowRuns = [];
  let hasFailure = false;
  let hasPending = false;
  let hasPermissionError = false;

  // Convert detailed branch data to repository stats format
  Object.entries(detailedStatus.branches).forEach(([branchName, branchData]) => {
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
  if (hasPermissionError) {
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

  try {
    // Get user's tracked repositories with GitHub server information
    const repositories = await new Promise((resolve, reject) => {
      db.all(
        `SELECT ur.*, gs.server_url, gs.api_token 
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

    // Check if this request should be batched
    if (!force && repositories.length > 1) {
      return handleBatchedRequest(userId, repositories, req, res);
    }

    // Process repositories immediately (single repo or forced)
    const stats = await processRepositoriesStats(repositories, force);
    
    // Cache the results
    const cacheKey = `stats_${userId}`;
    cache.set(cacheKey, {
      data: stats,
      timestamp: Date.now(),
      lastApiCall: Date.now()
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching action stats:', error);
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
        `SELECT ur.*, gs.server_url, gs.api_token 
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

    const [owner, repoName] = repository.repository_name.split('/');
    const trackedBranches = JSON.parse(repository.tracked_branches);
    const trackedWorkflows = JSON.parse(repository.tracked_workflows);

    // Create a cache key for this detailed request
    const detailCacheKey = `detailed-${userId}-${repoId}`;
    
    // Check if we have recent cached data (unless force refresh is requested)
    if (!forceRefresh) {
      const cachedData = cache.get(detailCacheKey);
      if (cachedData) {
        console.log(`📋 Cache hit for detailed workflow status: ${repository.repository_name}`);
        return res.json(cachedData);
      }
    } else {
      console.log(`🔄 Force refresh requested for detailed workflow status: ${repository.repository_name}`);
    }

    console.log(`🔄 Cache miss for detailed workflow status, fetching: ${repository.repository_name}`);

    const baseUrl = repository.server_url.replace(/\/$/, '');
    const apiUrl = baseUrl.includes('github.com') 
      ? 'https://api.github.com' 
      : `${baseUrl}/api/v3`;

    const detailedStatus = {
      repository: repository.repository_name,
      repositoryUrl: repository.repository_url,
      repoId: repository.id,
      branches: {}
    };

    // Fetch the detailed workflow status directly (no need for batching on individual requests)
    try {
      // Get all workflows for the repository first
      let allWorkflows = [];
      try {
        const workflowsResponse = await axios.get(`${apiUrl}/repos/${owner}/${repoName}/actions/workflows`, {
          headers: {
            'Authorization': `token ${repository.api_token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        allWorkflows = workflowsResponse.data.workflows;
      } catch (error) {
        console.error('Error fetching workflows:', error.message);
      }

      // Filter workflows if tracking specific ones
      if (trackedWorkflows.length > 0) {
        allWorkflows = allWorkflows.filter(workflow => 
          trackedWorkflows.some(tracked => 
            workflow.path.includes(tracked) || workflow.name === tracked
          )
        );
      }

      // For each branch, get the latest run for each workflow
      for (const branch of trackedBranches) {
        detailedStatus.branches[branch] = {
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
              
              detailedStatus.branches[branch].workflows[workflowName] = {
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
              detailedStatus.branches[branch].workflows[workflowName] = {
                status: 'no_runs',
                conclusion: null,
                name: workflowName,
                workflow_id: workflow.id
              };
            }
          }

        } catch (error) {
          console.error(`Error fetching detailed runs for ${repository.repository_name}/${branch}:`, error.message);
          detailedStatus.branches[branch].error = error.message;
        }

        // Add delay between branch requests to avoid rate limiting
        if (trackedBranches.indexOf(branch) < trackedBranches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Cache the detailed result for 2 minutes (shorter than main cache since it's more detailed)
      cache.set(detailCacheKey, detailedStatus);
      
      // If this was a force refresh, also update the main repository stats cache
      // to keep them in sync for the repository list display
      if (forceRefresh) {
        console.log(`🔄 Updating main repository stats cache due to detailed force refresh: ${repository.repository_name}`);
        
        // Generate repository stats from the detailed data
        const repoStats = generateRepositoryStatsFromDetailed(detailedStatus, repository);
        
        // Update individual repository cache
        const repoKey = getCacheKey('repo', repository.id);
        cache.set(repoKey, {
          data: repoStats,
          timestamp: Date.now(),
          lastApiCall: Date.now()
        });
        
        // Invalidate the main user stats cache to force refresh
        const userStatsKey = `stats_${userId}`;
        cache.delete(userStatsKey);
      }

      res.json(detailedStatus);

    } catch (error) {
      console.error('Error fetching detailed workflow status:', error);
      res.status(500).json({ 
        error: 'Failed to fetch detailed workflow status',
        details: error.message 
      });
    }

  } catch (error) {
    console.error('Error fetching detailed workflow status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch detailed workflow status',
      details: error.message 
    });
  }
});

export default router;
