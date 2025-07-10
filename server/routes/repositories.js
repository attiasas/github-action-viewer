import express from 'express';
import axios from 'axios';
import { db } from '../database.js';

const router = express.Router();

// Search repositories on a specific GitHub server
router.get('/search', async (req, res) => {
  const { q, userId, serverId } = req.query;

  if (!q || !userId || !serverId) {
    return res.status(400).json({ error: 'Query, userId, and serverId are required' });
  }

  try {
    // Get GitHub server credentials
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

    const response = await axios.get(`${apiUrl}/search/repositories`, {
      params: { q, per_page: 20 },
      headers: {
        'Authorization': `token ${server.api_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('GitHub API error:', error.response?.data || error.message);
    
    let errorMessage = 'Failed to search repositories';
    let statusCode = error.response?.status || 500;
    
    if (statusCode === 403) {
      const rateLimitRemaining = error.response?.headers['x-ratelimit-remaining'];
      const rateLimitReset = error.response?.headers['x-ratelimit-reset'];
      
      if (rateLimitRemaining === '0') {
        const resetTime = new Date(parseInt(rateLimitReset) * 1000);
        errorMessage = `GitHub API rate limit exceeded. Resets at ${resetTime.toLocaleTimeString()}`;
      } else {
        errorMessage = 'Access forbidden. Check token permissions (requires "repo" scope) or repository access rights.';
      }
    } else if (statusCode === 401) {
      errorMessage = 'Invalid or expired GitHub token. Please check your authentication credentials.';
    }
    
    res.status(statusCode).json({
      error: errorMessage,
      details: error.response?.data?.message || error.message,
      rateLimitInfo: statusCode === 403 ? {
        remaining: error.response?.headers['x-ratelimit-remaining'],
        reset: error.response?.headers['x-ratelimit-reset']
      } : undefined
    });
  }
});

// Get repository workflows
router.get('/:owner/:repo/workflows', async (req, res) => {
  const { owner, repo } = req.params;
  const { userId, serverId } = req.query;

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

    const response = await axios.get(`${apiUrl}/repos/${owner}/${repo}/actions/workflows`, {
      headers: {
        'Authorization': `token ${server.api_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('GitHub API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch workflows',
      details: error.response?.data?.message || error.message
    });
  }
});

// Get repository branches
router.get('/:owner/:repo/branches', async (req, res) => {
  const { owner, repo } = req.params;
  const { userId, serverId } = req.query;

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

    const response = await axios.get(`${apiUrl}/repos/${owner}/${repo}/branches`, {
      headers: {
        'Authorization': `token ${server.api_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('GitHub API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch branches',
      details: error.response?.data?.message || error.message
    });
  }
});

// Add repository to user's tracking list
router.post('/track', (req, res) => {
  const { userId, githubServerId, repositoryName, repositoryUrl, trackedBranches, trackedWorkflows, autoRefreshInterval, displayName } = req.body;

  if (!userId || !githubServerId || !repositoryName || !repositoryUrl || !trackedBranches || !trackedWorkflows) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  db.run(
    `INSERT OR REPLACE INTO user_repositories 
     (user_id, github_server_id, repository_name, repository_url, tracked_branches, tracked_workflows, auto_refresh_interval, display_name, updated_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      userId, 
      githubServerId,
      repositoryName, 
      repositoryUrl, 
      JSON.stringify(trackedBranches), 
      JSON.stringify(trackedWorkflows),
      autoRefreshInterval || 300,
      displayName || null
    ],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({ success: true, message: 'Repository added to tracking list' });
    }
  );
});

// Get user's tracked repositories
router.get('/tracked/:userId', (req, res) => {
  const { userId } = req.params;

  db.all(
    `SELECT ur.*, gs.server_name, gs.server_url 
     FROM user_repositories ur 
     JOIN github_servers gs ON ur.github_server_id = gs.id 
     WHERE ur.user_id = ? 
     ORDER BY ur.created_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      const repositories = rows.map(row => ({
        ...row,
        tracked_branches: JSON.parse(row.tracked_branches),
        tracked_workflows: JSON.parse(row.tracked_workflows)
      }));

      res.json(repositories);
    }
  );
});

// Remove repository from tracking
router.delete('/tracked/:userId/:repoId', (req, res) => {
  const { userId, repoId } = req.params;

  db.run(
    'DELETE FROM user_repositories WHERE id = ? AND user_id = ?',
    [repoId, userId],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      res.json({ success: true, message: 'Repository removed from tracking' });
    }
  );
});

export default router;
