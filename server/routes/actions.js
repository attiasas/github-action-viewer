import express from 'express';
import axios from 'axios';
import { db } from '../database.js';

const router = express.Router();

// RAM-based workflow cache using key structure: gitServer_repository_branch_workflow
const workflowCache = new Map();
const MIN_REFRESH_INTERVAL = 30 * 1000; // Minimum 30 seconds between API calls

// Cache structure for each workflow entry:
// {
//   key: "serverUrl_owner/repo_branch_workflowName",
//   data: {
//     id: number,
//     name: string,
//     status: string,
//     conclusion: string | null,
//     created_at: string,
//     updated_at: string,
//     html_url: string,
//     head_branch: string,
//     head_sha: string,
//     workflow_id: number,
//     run_number: number
//   },
//   lastRefresh: timestamp,
//   error: string | null
// }

// Generate cache key for workflow data
function generateWorkflowKey(serverUrl, repository, branch, workflowName) {
  return `${serverUrl}_${repository}_${branch}_${workflowName}`;
}

// Check if workflow data needs refresh
function shouldRefreshWorkflow(key, minRefreshInterval = MIN_REFRESH_INTERVAL) {
  const entry = workflowCache.get(key);
  if (!entry) return true;
  const now = Date.now();
  return (now - entry.lastRefresh) >= minRefreshInterval;
}

// Get or update workflow data from cache
async function getWorkflowData(serverUrl, apiToken, repository, branch, workflowName, workflowId, workflowPath, minRefreshInterval = MIN_REFRESH_INTERVAL) {
  const key = generateWorkflowKey(serverUrl, repository, branch, workflowName);
  
  // Return cached data if fresh
  if (!shouldRefreshWorkflow(key, minRefreshInterval)) {
    return workflowCache.get(key);
  }

  // Refresh data from API
  try {
    const [owner, repoName] = repository.split('/');
    const baseUrl = serverUrl.replace(/\/$/, '');
    const apiUrl = baseUrl.includes('github.com') 
      ? 'https://api.github.com' 
      : `${baseUrl}/api/v3`;

    // Get latest run for this workflow on this branch
    const response = await axios.get(`${apiUrl}/repos/${owner}/${repoName}/actions/workflows/${workflowId}/runs`, {
      params: { branch, per_page: 1 },
      headers: {
        'Authorization': `token ${apiToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const runs = response.data.workflow_runs;
    let workflowData = null;

    if (runs.length > 0) {
      const latestRun = runs[0];
      workflowData = {
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
      workflowData = {
        status: 'no_runs',
        conclusion: null,
        name: workflowName,
        workflow_id: workflowId,
        workflow_path: workflowPath
      };
    }

    // Cache the result
    const cacheEntry = {
      key,
      data: workflowData,
      lastRefresh: Date.now(),
      error: null
    };
    
    workflowCache.set(key, cacheEntry);
    return cacheEntry;

  } catch (error) {
    // Cache the error
    const errorEntry = {
      key,
      data: null,
      lastRefresh: Date.now(),
      error: error.message
    };
    
    workflowCache.set(key, errorEntry);
    return errorEntry;
  }
}

// Get repository statistics from workflow cache
async function getRepositoryStats(userId, repoId, forceRefresh = false) {
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
      throw new Error('Repository not found');
    }

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

    // Build repository stats
    const repoStats = {
      repository: repository.repository_name,
      repositoryUrl: repository.repository_url,
      repoId: repository.id,
      serverName: repository.server_name,
      serverUrl: repository.server_url,
      branches: {},
      overall: { success: 0, failure: 0, pending: 0, cancelled: 0, running: 0 }
    };

    const minRefreshInterval = forceRefresh ? 0 : (repository.auto_refresh_interval * 1000);
    let hasFailure = false;
    let hasPending = false;
    let hasRunning = false;
    let hasPermissionError = false;

    // Process each branch
    for (const branch of trackedBranches) {
      repoStats.branches[branch] = {
        success: 0,
        failure: 0,
        pending: 0,
        cancelled: 0,
        running: 0,
        workflows: {}
      };

      try {
        // Process each workflow in the branch
        for (const workflow of allWorkflows) {
          const workflowEntry = await getWorkflowData(
            repository.server_url,
            repository.api_token,
            repository.repository_name,
            branch,
            workflow.name,
            workflow.id,
            workflow.path,
            minRefreshInterval
          );

          if (workflowEntry.error) {
            repoStats.branches[branch].error = workflowEntry.error;
            if (workflowEntry.error.includes('Access denied') || workflowEntry.error.includes('not found')) {
              hasPermissionError = true;
            }
            continue;
          }

          const workflowData = workflowEntry.data;
          if (workflowData && workflowData.status !== 'no_runs') {
            const status = workflowData.conclusion || workflowData.status;
            const normalizedStatus = status === 'success' ? 'success' 
              : status === 'failure' ? 'failure'
              : status === 'cancelled' ? 'cancelled'
              : status === 'in_progress' ? 'running'
              : 'pending';

            // Count this workflow's status for the branch
            repoStats.branches[branch][normalizedStatus]++;
            repoStats.overall[normalizedStatus]++;

            // Store workflow details
            repoStats.branches[branch].workflows[workflow.name] = {
              status: workflowData.status,
              conclusion: workflowData.conclusion,
              created_at: workflowData.created_at,
              html_url: workflowData.html_url,
              normalizedStatus
            };

            // Track status flags
            if (normalizedStatus === 'failure') {
              hasFailure = true;
            } else if (normalizedStatus === 'running') {
              hasRunning = true;
            } else if (normalizedStatus === 'pending') {
              hasPending = true;
            }
          }
        }
      } catch (error) {
        console.error(`Error processing branch ${branch}:`, error.message);
        repoStats.branches[branch].error = error.message;
      }
    }

    // Set repository status
    if (hasPermissionError) {
      repoStats.status = 'error';
      repoStats.hasPermissionError = true;
    } else if (hasFailure) {
      repoStats.status = 'failure';
    } else if (hasRunning) {
      repoStats.status = 'running';
    } else if (hasPending) {
      repoStats.status = 'pending';
    } else if (repoStats.overall.success > 0) {
      repoStats.status = 'success';
    } else {
      repoStats.status = 'unknown';
    }

    return repoStats;

  } catch (error) {
    console.error('Error getting repository stats:', error);
    throw error;
  }
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
  const { force } = req.query;
  
  console.log(`📊 [Backend] Getting stats for user: ${userId} (force: ${force === 'true'})`);

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

    console.log(`📊 [Backend] Processing ${repositories.length} repositories for user: ${userId}`);
    const stats = [];

    // Process each repository
    for (const repository of repositories) {
      try {
        const repoStats = await getRepositoryStats(userId, repository.id, force === 'true');
        stats.push(repoStats);
      } catch (error) {
        console.error(`❌ [Backend] Error processing repository ${repository.repository_name}:`, error);
        // Add error entry for this repository
        stats.push({
          repository: repository.repository_name,
          repositoryUrl: repository.repository_url,
          repoId: repository.id,
          serverName: repository.server_name,
          serverUrl: repository.server_url,
          branches: {},
          overall: { success: 0, failure: 0, pending: 0, cancelled: 0, running: 0 },
          status: 'error',
          hasError: true,
          error: error.message
        });
      }
    }

    console.log(`✅ [Backend] Completed stats for user: ${userId} - processed ${stats.length} repositories`);
    res.json(stats);
  } catch (error) {
    console.error(`💥 [Backend] Stats call failed for user: ${userId}:`, error);
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

    // Build detailed workflow status
    const detailedStatus = {
      repository: repository.repository_name,
      repositoryUrl: repository.repository_url,
      repoId: repository.id,
      branches: {}
    };

    const minRefreshInterval = forceRefresh ? 0 : (repository.auto_refresh_interval * 1000);

    // Process each branch
    for (const branch of trackedBranches) {
      detailedStatus.branches[branch] = {
        workflows: {},
        error: null
      };

      try {
        // Process each workflow in the branch
        for (const workflow of allWorkflows) {
          const workflowEntry = await getWorkflowData(
            repository.server_url,
            repository.api_token,
            repository.repository_name,
            branch,
            workflow.name,
            workflow.id,
            workflow.path,
            minRefreshInterval
          );

          if (workflowEntry.error) {
            detailedStatus.branches[branch].error = workflowEntry.error;
            continue;
          }

          // Add workflow path to the data
          const workflowData = workflowEntry.data;
          if (workflowData) {
            workflowData.workflow_path = workflow.path;
          }

          detailedStatus.branches[branch].workflows[workflow.name] = workflowData;
        }
      } catch (error) {
        console.error(`Error processing branch ${branch}:`, error.message);
        detailedStatus.branches[branch].error = error.message;
      }
    }

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
  
  console.log(`� [Backend] Single refresh for repoId: ${repoId}, user: ${userId}, force: ${forceRefresh}`);

  try {
    const repoStats = await getRepositoryStats(userId, repoId, forceRefresh);
    console.log(`✅ [Backend] Single refresh completed for repoId: ${repoId}`);
    res.json(repoStats);
  } catch (error) {
    console.error(`💥 [Backend] Single refresh failed for repoId: ${repoId}:`, error);
    res.status(500).json({ 
      error: 'Failed to refresh repository',
      details: error.message 
    });
  }
});

// Simple authentication middleware for test/demo
router.use((req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

export default router;
