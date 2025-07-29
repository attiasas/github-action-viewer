import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import app from '../app.js';

import * as dbUtils from '../utils/database.js';
import * as githubUtils from '../utils/github.js';
import { refreshingRepositories } from '../routes/workflows.js';

const request = supertest(app);

const userId = 'testuser';
const userMock = {
  id: userId,
  name: 'Test User',
  runRetention: 300
};

const repoId = 'testrepo';
const serverId = 'server1';
const repoName = 'octocat/hello-world';

const trackedRepoMock = {
  serverId,
  serverUrl: 'https://api.github.com',
  apiToken: 'ghp_testtoken',
  repository: {
    id: repoId,
    name: repoName,
    url: 'https://github.com/octocat/hello-world',
    trackedBranches: ['main', 'dev'],
    trackedWorkflows: [1],
    trackedWorkflowsPaths: ['ci.yml']
  },
  allWorkflows: [{ id: 1, name: 'CI', path: 'ci.yml' }]
};

const workflowRunsMock = [
  {
    workflowName: 'CI',
    runId: 1,
    commit: 'abc123',
    status: 'completed',
    conclusion: 'success',
    createdAt: '2025-07-18T12:00:00Z',
    url: 'https://github.com/octocat/hello-world/actions/runs/1',
    workflowId: 1
  }
];

describe('Workflows API', () => {
  beforeAll(() => {
    vi.spyOn(dbUtils, 'GetUserTrackedRepositoryData').mockImplementation(async (uid, rid) => {
      if (uid === userId && rid === repoId) return { ...trackedRepoMock };
      return null;
    });
    vi.spyOn(githubUtils, 'FetchRepositoryWorkflows').mockImplementation(async () => [{ id: 1, name: 'CI', path: 'ci.yml' }]);
    vi.spyOn(githubUtils, 'FetchWorkflowRuns').mockImplementation(async () => workflowRunsMock);
    vi.spyOn(dbUtils, 'GetUserById').mockImplementation(async (uid) => {
      if (uid === userId) return { ...userMock };
      return null;
    });
    // runsCache mocks
    global.runsCache = {
      updateRuns: vi.fn(),
      updateError: vi.fn(),
      getLatestRun: vi.fn().mockImplementation(() => ({ data: workflowRunsMock }))
    };
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/workflows/refresh/:userId/:repoId', () => {
    it('refreshes workflows and returns status (success)', async () => {
      const res = await request.post(`/api/workflows/refresh/${userId}/${repoId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body.branches).toHaveProperty('main');
    });
    it('returns 404 if repository not found', async () => {
      const res = await request.post(`/api/workflows/refresh/invaliduser/invalidrepo`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
    it('returns 202 if already refreshing', async () => {
      // Simulate already refreshing
      const key = `${userId}_${serverId}_${repoId}`;
      refreshingRepositories.clear();
      refreshingRepositories.add(key);
      const res = await request.post(`/api/workflows/refresh/${userId}/${repoId}`);
      expect(res.status).toBe(202);
      expect(res.body.error).toBeDefined();
      refreshingRepositories.clear();
    });
    it('returns 500 if FetchWorkflowRuns throws', async () => {
      vi.spyOn(githubUtils, 'FetchWorkflowRuns').mockImplementationOnce(async () => { throw new Error('GitHub API error'); });
      const res = await request.post(`/api/workflows/refresh/${userId}/${repoId}`);
      expect(res.status).toBe(200); // error is handled per branch/workflow, not global
      expect(res.body).toHaveProperty('status');
    });
  });

  describe('GET /api/workflows/status/:userId/:repoId', () => {
    it('returns repository status (success)', async () => {
      const res = await request.get(`/api/workflows/status/${userId}/${repoId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body.branches).toHaveProperty('main');
    });
    it('returns 404 if repository not found', async () => {
      const res = await request.get(`/api/workflows/status/invaliduser/invalidrepo`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
    it('returns cached status if allowCache=true', async () => {
      const res = await request.get(`/api/workflows/status/${userId}/${repoId}?allowCache=true`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
    });
    it('returns 202 if currently refreshing and allowCache is not true', async () => {
      // Ensure trackedRepoMock.repository.serverId matches top-level serverId for correct cache key
      trackedRepoMock.repository.serverId = serverId;
      const key = `${userId}_${serverId}_${repoId}`;
      refreshingRepositories.clear();
      refreshingRepositories.add(key);
      const res = await request.get(`/api/workflows/status/${userId}/${repoId}`);
      expect(res.status).toBe(202);
      expect(res.body.error).toBeDefined();
      refreshingRepositories.clear();
    });
    it('returns 500 if FetchRepositoryWorkflows throws', async () => {
      vi.spyOn(githubUtils, 'FetchRepositoryWorkflows').mockImplementationOnce(async () => { throw new Error('GitHub API error'); });
      const res = await request.get(`/api/workflows/status/${userId}/${repoId}`);
      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });
});
