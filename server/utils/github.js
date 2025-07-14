
import axios from 'axios';

export async function FetchRepositoryWorkflows(serverUrl, apiToken, repository) {
  const [owner, repoName] = repository.split('/');
  const baseUrl = serverUrl.replace(/\/$/, '');
  const apiUrl = baseUrl.includes('github.com') 
    ? 'https://api.github.com' 
    : `${baseUrl}/api/v3`;

  
  const workflowsResponse = await axios.get(`${apiUrl}/repos/${owner}/${repoName}/actions/workflows`, {
    headers: {
      'Authorization': `token ${apiToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  return workflowsResponse.data.workflows;
}

export async function FetchRepositoryRuns(serverUrl, apiToken, owner, repo, branch, workflowId, maxResults = 50) {
  const baseUrl = serverUrl.replace(/\/$/, '');
  const apiUrl = baseUrl.includes('github.com') 
    ? 'https://api.github.com' 
    : `${baseUrl}/api/v3`;

  let url = `${apiUrl}/repos/${owner}/${repo}/actions/runs`;
  const params = { per_page: maxResults };

  if (branch) params.branch = branch;
  if (workflowId) url = `${apiUrl}/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`;

  const response = await axios.get(url, {
    params: params,
    headers: {
      'Authorization': `token ${apiToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  return response.data;
}

export async function FetchWorkflowsLatestRuns(serverUrl, apiToken, repository, branch, workflowId) {
  const [owner, repoName] = repository.split('/');
  if (!owner || !repoName) {
    throw new Error('Invalid repository format. Expected format: owner/repo');
  }
  const response = await FetchRepositoryRuns(serverUrl, apiToken, owner, repoName, branch, workflowId, 1);
  return response.workflow_runs;
}