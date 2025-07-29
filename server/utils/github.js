
import axios from 'axios';

export class User {
  constructor(userName, scopes) {
    this.userName = userName;
    this.scopes = scopes;
  }
}

export async function GetUserInfo(serverUrl, apiToken) {
  const baseUrl = serverUrl.replace(/\/$/, '');
  const apiUrl = baseUrl.includes('github.com') 
    ? 'https://api.github.com' 
    : `${baseUrl}/api/v3`;

  const response = await axios.get(`${apiUrl}/user`, {
    headers: {
      'Authorization': `token ${apiToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  return new User(
    response.data.login,
    response.headers['x-oauth-scopes'] || ''
  );
}

export async function SearchRepositoriesInServer(serverUrl, apiToken, query, page = 1, perPage = 20) {
  const baseUrl = serverUrl.replace(/\/$/, '');
  const apiUrl = baseUrl.includes('github.com') 
    ? 'https://api.github.com' 
    : `${baseUrl}/api/v3`;

  const response = await axios.get(`${apiUrl}/search/repositories`, {
    params: {
      q: query,
      page: page,
      per_page: perPage
    },
    headers: {
      'Authorization': `token ${apiToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  return response.data;
}

export async function GetRepositoryWorkflows(serverUrl, apiToken, owner, repo) {
  const baseUrl = serverUrl.replace(/\/$/, '');
  const apiUrl = baseUrl.includes('github.com') 
    ? 'https://api.github.com' 
    : `${baseUrl}/api/v3`;

  const response = await axios.get(`${apiUrl}/repos/${owner}/${repo}/actions/workflows`, {
    headers: {
      'Authorization': `token ${apiToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  return response.data;
}

export async function GetRepositoryBranches(serverUrl, apiToken, owner, repo) {
  const baseUrl = serverUrl.replace(/\/$/, '');
  const apiUrl = baseUrl.includes('github.com') 
    ? 'https://api.github.com' 
    : `${baseUrl}/api/v3`;

  const response = await axios.get(`${apiUrl}/repos/${owner}/${repo}/branches`, {
    headers: {
      'Authorization': `token ${apiToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  return response.data;
}

export class WorkflowRun {
  constructor(runId, runNumber, event, workflowId, workflowName, status, conclusion, createdAt, updatedAt, runStartedAt, runAttempt, url, branch, commit) {
    this.runId = runId;
    this.runNumber = runNumber;
    this.event = event;
    this.workflowId = workflowId;
    this.workflowName = workflowName;
    this.status = status;
    this.conclusion = conclusion;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.runStartedAt = runStartedAt;
    this.runAttempt = runAttempt;
    this.url = url;
    this.branch = branch;
    this.commit = commit;
  }
}

export async function FetchWorkflowRuns(serverUrl, apiToken, repository, branch, workflowId, maxResults = 200) {
  const [owner, repoName] = repository.split('/');
  if (!owner || !repoName) {
    throw new Error('Invalid repository format. Expected format: owner/repo');
  }
  const runs = await FetchRepositoryRuns(serverUrl, apiToken, owner, repoName, branch, workflowId, maxResults);
  return runs.workflow_runs.map(run => new WorkflowRun(
    run.id,
    run.run_number,
    run.event,
    run.workflow_id,
    run.name,
    run.status,
    run.conclusion,
    run.created_at,
    run.updated_at,
    run.run_started_at,
    run.run_attempt,
    run.html_url,
    run.head_branch,
    run.head_sha
  ));
}

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

export async function FetchRepositoryRuns(serverUrl, apiToken, owner, repo, branch, workflowId, maxResults) {
  const baseUrl = serverUrl.replace(/\/$/, '');
  const apiUrl = baseUrl.includes('github.com') 
    ? 'https://api.github.com' 
    : `${baseUrl}/api/v3`;

  let url = `${apiUrl}/repos/${owner}/${repo}/actions/runs`;
  if (workflowId) url = `${apiUrl}/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`;

  const perPage = maxResults < 100 ? maxResults : 100; // GitHub API max per_page is 100
  let page = 1;
  let allRuns = [];
  let totalFetched = 0;
  let keepFetching = true;

  while (keepFetching && totalFetched < maxResults) {
    const params = { per_page: perPage, page };
    if (branch) params.branch = branch;
    const response = await axios.get(url, {
      params: params,
      headers: {
        'Authorization': `token ${apiToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    const runs = response.data.workflow_runs || [];
    allRuns = allRuns.concat(runs);
    totalFetched += runs.length;
    if (runs.length < perPage || totalFetched >= maxResults) {
      keepFetching = false;
    } else {
      page++;
    }
  }
  return {
    ...((allRuns.length > 0 && allRuns[0].id) ? { workflow_runs: allRuns.slice(0, maxResults) } : { workflow_runs: [] })
  };
}
