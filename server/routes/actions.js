import express from 'express';
import axios from 'axios';
import { db } from '../database.js';

const router = express.Router();

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

    const stats = [];

    for (const repo of repositories) {
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

      for (const branch of trackedBranches) {
        repoStats.branches[branch] = { success: 0, failure: 0, pending: 0, cancelled: 0 };

        try {
          const response = await axios.get(`${apiUrl}/repos/${owner}/${repoName}/actions/runs`, {
            params: { branch, per_page: 20 },
            headers: {
              'Authorization': `token ${repo.api_token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });

          // Filter by tracked workflows if specified
          let runs = response.data.workflow_runs;
          if (trackedWorkflows.length > 0) {
            runs = runs.filter(run => 
              trackedWorkflows.some(workflow => 
                run.path.includes(workflow) || run.name === workflow
              )
            );
          }

          // Count statuses
          runs.forEach(run => {
            const status = run.conclusion || run.status;
            const normalizedStatus = status === 'success' ? 'success' 
              : status === 'failure' ? 'failure'
              : status === 'cancelled' ? 'cancelled'
              : 'pending';
            
            repoStats.branches[branch][normalizedStatus]++;
            repoStats.overall[normalizedStatus]++;
          });

          // Store latest run info
          if (runs.length > 0) {
            repoStats.branches[branch].latestRun = runs[0];
          }

        } catch (error) {
          console.error(`Error fetching runs for ${repo.repository_name}/${branch}:`, error.message);
          repoStats.branches[branch].error = error.message;
        }
      }

      stats.push(repoStats);
    }

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

export default router;
