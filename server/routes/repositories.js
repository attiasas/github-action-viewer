import express from 'express';

import { GetUserServer, GetUserTrackedRepositories, AddUserTrackedRepository, UpdateUserTrackedRepository, DeleteUserTrackedRepository } from '../utils/database.js';
import { SearchRepositoriesInServer, GetRepositoryBranches, GetRepositoryWorkflows } from '../utils/github.js';

const router = express.Router();

// Search repositories on a specific GitHub server
router.get('/search', async (req, res) => {
  const { q, userId, serverId } = req.query;
  console.log(`🔍 [${req.requestId}] Searching repositories for user ${userId} on server ${serverId}: ${q}`);
  if (!q || !userId || !serverId) {
    console.warn(`⚠️ [${req.requestId}] Missing required parameters`);
    return res.status(400).json({ error: 'Query, userId, and serverId are required' });
  }
  try {
    // Get GitHub server credentials
    const server = await GetUserServer(serverId, userId);
    if (!server) {
      console.warn(`⚠️ [${req.requestId}] GitHub server not found`);
      return res.status(404).json({ error: 'GitHub server not found' });
    }
    const response = await SearchRepositoriesInServer(server.serverUrl, server.apiToken, q);
    console.log(`✅ [${req.requestId}] ${response.total_count} repositories found`);
    res.json(response);
  } catch (error) {
    if (error.response) {
      let errorMessage = 'Failed to search repositories';
      
      const statusCode = error.response.status;
      const rateLimitRemaining = error.response.headers['x-ratelimit-remaining'];
      const rateLimitReset = error.response.headers['x-ratelimit-reset'];

      if (statusCode === 403) {
        if (rateLimitRemaining === '0') {
          const resetTime = new Date(parseInt(rateLimitReset) * 1000);
          errorMessage = `GitHub API rate limit exceeded. Resets at ${resetTime.toLocaleTimeString()}`;
        } else {
          errorMessage = 'Access forbidden. Check token permissions (requires "repo" scope) or repository access rights.';
        }
      } else if (statusCode === 401) {
        errorMessage = 'Invalid or expired GitHub token. Please check your authentication credentials.';
      }
      console.error(`❌ [${req.requestId}] ${errorMessage}:`, error.response.data);
      return res.status(statusCode).json({
        error: errorMessage,
        details: error.response.data.message || error.message,
        rateLimitInfo: statusCode === 403 ? {remaining: rateLimitRemaining, reset: rateLimitReset} : undefined
      });
    }
    console.error(`❌ [${req.requestId}] Error searching repositories:`, error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get repository workflows
router.get('/:owner/:repo/workflows', async (req, res) => {
  const { owner, repo } = req.params;
  const { userId, serverId } = req.query;
  console.log(`🚀 [${req.requestId}] Fetching workflows for ${owner}/${repo} on server ${serverId} for user ${userId}`);
  if (!userId || !serverId) {
    console.warn(`⚠️ [${req.requestId}] Missing required parameters`);
    return res.status(400).json({ error: 'userId and serverId are required' });
  }
  try {
    const server = await GetUserServer(serverId, userId);
    if (!server) {
      console.warn(`⚠️ [${req.requestId}] GitHub server not found`);
      return res.status(404).json({ error: 'GitHub server not found' });
    }
    const workflows = await GetRepositoryWorkflows(server.serverUrl, server.apiToken, owner, repo);
    console.log(`✅ [${req.requestId}] ${workflows.length} workflows found`);
    res.json(workflows);
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error fetching workflows:`, error.message);
    return res.status(error.response?.status || 500).json({
      error: 'Failed to fetch workflows',
      details: error.response?.data?.message || error.message
    });
  }
});

// Get repository branches
router.get('/:owner/:repo/branches', async (req, res) => {
  const { owner, repo } = req.params;
  const { userId, serverId } = req.query;
  console.log(`🌿 [${req.requestId}] Fetching branches for repository: ${owner}/${repo}`);
  if (!userId || !serverId) {
    console.warn(`⚠️ [${req.requestId}] Missing required parameters`);
    return res.status(400).json({ error: 'userId and serverId are required' });
  }
  try {
    const server = await GetUserServer(serverId, userId);
    if (!server) {
      console.warn(`⚠️ [${req.requestId}] GitHub server not found`);
      return res.status(404).json({ error: 'GitHub server not found' });
    }
    const branches = await GetRepositoryBranches(server.serverUrl, server.apiToken, owner, repo);
    console.log(`✅ [${req.requestId}] ${branches.length} branches found`);
    res.json(branches);
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error fetching branches:`, error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch branches',
      details: error.response?.data?.message || error.message
    });
  }
});

// Add repository to user's tracking list
router.post('/track', async (req, res) => {
  const { userId, githubServerId, repositoryName, repositoryUrl, trackedBranches, trackedWorkflows, autoRefreshInterval, displayName } = req.body;
  console.log(`📌 [${req.requestId}] Adding repository to tracking list for user ${userId}: ${repositoryName}`);
  if (!userId || !githubServerId || !repositoryName || !repositoryUrl || !trackedBranches || !trackedWorkflows) {
    console.warn(`⚠️ [${req.requestId}] Missing required fields for tracking repository`);
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    const repositoryId = await AddUserTrackedRepository(
      userId,
      githubServerId,
      repositoryName,
      repositoryUrl,
      trackedBranches,
      trackedWorkflows,
      autoRefreshInterval,
      displayName
    );
    console.log(`✅ [${req.requestId}] Repository added to tracking list: ${repositoryId}`);
    res.json({ success: true, message: 'Repository added to tracking list', repositoryId: repositoryId });
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error adding repository to tracking list:`, error.message);
    res.status(500).json({ error: 'Failed to add repository to tracking list' });
  }
});

// Get user's tracked repositories
router.get('/tracked/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`📋 [${req.requestId}] Fetching tracked repositories for user: ${userId}`);
  try {
    const repositories = await GetUserTrackedRepositories(userId);
    console.log(`✅ [${req.requestId}] ${repositories.length} tracked repositories found for user`);
    res.json(repositories);
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error fetching tracked repositories:`, error.message);
    res.status(500).json({ error: 'Failed to fetch tracked repositories' });
  }
});

// Remove repository from tracking
router.delete('/tracked/:userId/:repoId', async (req, res) => {
  const { userId, repoId } = req.params;
  console.log(`🗑️ [${req.requestId}] Removing repository ${repoId} from tracking for user: ${userId}`);
  try {
    if (!await DeleteUserTrackedRepository(repoId, userId)) {
      console.warn(`⚠️ [${req.requestId}] Repository not found for user`);
      return res.status(404).json({ error: 'Repository not found' });
    }
    console.log(`✅ [${req.requestId}] Repository removed from tracking`);
    res.json({ success: true, message: 'Repository removed from tracking' });
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error removing repository from tracking:`, error.message);
    res.status(500).json({ error: 'Failed to remove repository from tracking' });
  }
});

// Update repository tracking settings
router.put('/tracked/:userId/:repoId', async (req, res) => {
  const { userId, repoId } = req.params;
  const { tracked_workflows, tracked_branches } = req.body;
  console.log(`✏️ [${req.requestId}] Updating tracking settings for repository ${repoId} for user: ${userId}`, req.body);
  if (!Array.isArray(tracked_workflows) || !Array.isArray(tracked_branches)) {
    console.warn(`⚠️ [${req.requestId}] Invalid tracking settings format`);
    return res.status(400).json({ error: 'tracked_workflows and tracked_branches must be arrays' });
  }
  try {
    if (!await UpdateUserTrackedRepository(repoId, userId, tracked_branches, tracked_workflows)) {
      console.warn(`⚠️ [${req.requestId}] Repository not found for user`);
      return res.status(404).json({ error: 'Repository not found' });
    }
    console.log(`✅ [${req.requestId}] Repository tracking settings updated`);
    res.json({
      success: true,
      message: 'Repository tracking settings updated',
      tracked_workflows,
      tracked_branches
    });
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error updating tracking settings:`, error.message);
    return res.status(500).json({ error: 'Failed to update tracking settings' });
  }
});

export default router;
