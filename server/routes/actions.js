import express from 'express';

import { FetchRepositoryWorkflows, FetchWorkflowsLatestRuns } from '../utils/github.js';
import { GetTrackedRepositoryWithServerDetails, GetServerDetails } from '../utils/database.js';

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

// Get (update if needed) workflow data from cache
async function getWorkflowData(serverUrl, apiToken, repository, branch, workflowName, workflowId, workflowPath, minRefreshInterval = MIN_REFRESH_INTERVAL) {
  const key = generateWorkflowKey(serverUrl, repository, branch, workflowName);
  
  // Return cached data if fresh
  if (!shouldRefreshWorkflow(key, minRefreshInterval)) {
    return workflowCache.get(key);
  }

  // Refresh data from API
  try {
    const runs = await FetchWorkflowsLatestRuns(serverUrl, apiToken, repository, branch, workflowId);
    let workflowData = null;

    if (runs.length > 0) {
      // Use the latest run data
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
    // Get repository information from the database
    const repository = await GetTrackedRepositoryWithServerDetails(userId, repoId);

    if (!repository) {
      throw new Error('Repository not found');
    }

    const trackedBranches = JSON.parse(repository.tracked_branches);
    const trackedWorkflows = JSON.parse(repository.tracked_workflows);

    // Get all workflows for the repository
    let allWorkflows = [];
    try {
      allWorkflows = await FetchRepositoryWorkflows(repository.server_url, repository.api_token, repository.repository_name);

      // Filter workflows if tracking specific ones
      if (trackedWorkflows.length > 0) {
        allWorkflows = allWorkflows.filter(workflow => 
          trackedWorkflows.some(tracked => 
            workflow.path.includes(tracked) || workflow.name === tracked
          )
        );
      }
    } catch (error) {
      console.error(`💥 [Backend] Error fetching workflows for ${repository.repository_name}:`, error.message);
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

  console.log(`🚀 [Backend] Fetching workflow runs for user: ${userId}, serverId: ${serverId}, owner: ${owner}, repo: ${repo}, branch: ${branch}, workflowId: ${workflowId}`);

  try {
    const server = await GetServerDetails(userId, serverId);

    if (!server) {
      return res.status(404).json({ error: 'GitHub server not found' });
    }

    const runs = await FetchRepositoryRuns(server.server_url, server.api_token, owner, repo, branch, workflowId);

    console.log(`✅ [Backend] Fetched ${runs.length} workflow runs for ${owner}/${repo}`);

    res.json(runs);
  } catch (error) {
    console.error('❌ [Backend] GitHub API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch workflow runs',
      details: error.response?.data?.message || error.message
    });
  }
});

// Get detailed workflow status for a specific repository
router.get('/workflow-status/:userId/:repoId', async (req, res) => {
  const { userId, repoId } = req.params;
  const forceRefresh = req.query.force === 'true';

  console.log(`📊 [Backend] Getting workflows status for repoId: ${repoId}, user: ${userId}, force: ${forceRefresh}`);

  try {
    // Get repository information
    const repository = await GetTrackedRepositoryWithServerDetails(userId, repoId);

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const trackedBranches = JSON.parse(repository.tracked_branches);
    const trackedWorkflows = JSON.parse(repository.tracked_workflows);

    // Get all workflows for the repository
    let allWorkflows = [];
    try {
      allWorkflows = await FetchRepositoryWorkflows(repository.server_url, repository.api_token, repository.repository_name);

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

    console.log(`✅ [Backend] Detailed workflow status fetched for repoId: ${repoId}`);

    res.json(detailedStatus);

  } catch (error) {
    console.error('❌ [Backend] Error fetching detailed workflow status:', error);
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
  
  console.log(`🔄 [Backend] Single refresh for repoId: ${repoId}, user: ${userId}, force: ${forceRefresh}`);

  try {
    const repoStats = await getRepositoryStats(userId, repoId, forceRefresh);
    console.log(`✅ [Backend] Single refresh completed for repoId: ${repoId}`);
    res.json(repoStats);
  } catch (error) {
    console.error(`❌ [Backend] Single refresh failed for repoId: ${repoId}:`, error);
    res.status(500).json({ 
      error: 'Failed to refresh repository',
      details: error.message 
    });
  }
});

export default router;
