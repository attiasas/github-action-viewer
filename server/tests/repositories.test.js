import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import app from '../app.js';

import * as dbUtils from '../utils/database.js';
import * as githubUtils from '../utils/github.js';

const request = supertest(app);

const userId = 'testuser';
const serverId = 'server1';
const repoId = 'repo123';
const owner = 'octocat';
const repo = 'hello-world';
const repositoryName = `${owner}/${repo}`;
const repositoryUrl = `https://github.com/${owner}/${repo}`;

const serverMock = {
  serverId,
  serverUrl: 'https://api.github.com',
  apiToken: 'ghp_testtoken',
};

const repoBranchesMock = ['main', 'dev'];
const repoWorkflowsMock = [{ id: 1, name: 'CI', path: 'ci.yml' }];
const repoSearchMock = { total_count: 1, items: [{ id: repoId, name: repo, full_name: repositoryName }] };
const trackedReposMock = [{ id: repoId, name: repositoryName, url: repositoryUrl }];

describe('Repositories API', () => {
  beforeAll(() => {
    vi.spyOn(dbUtils, 'GetUserServer').mockImplementation(async (sid, uid) => {
      if (sid === serverId && uid === userId) return { ...serverMock };
      return null;
    });
    vi.spyOn(dbUtils, 'GetUserTrackedRepositories').mockImplementation(async (uid) => {
      if (uid === userId) return trackedReposMock;
      return [];
    });
    vi.spyOn(dbUtils, 'AddUserTrackedRepository').mockImplementation(async () => repoId);
    vi.spyOn(dbUtils, 'DeleteUserTrackedRepository').mockImplementation(async (rid, uid) => rid === repoId && uid === userId);
    vi.spyOn(dbUtils, 'UpdateUserTrackedRepository').mockImplementation(async (rid, uid) => rid === repoId && uid === userId);
    vi.spyOn(githubUtils, 'SearchRepositoriesInServer').mockImplementation(async () => repoSearchMock);
    vi.spyOn(githubUtils, 'GetRepositoryBranches').mockImplementation(async () => repoBranchesMock);
    vi.spyOn(githubUtils, 'GetRepositoryWorkflows').mockImplementation(async () => repoWorkflowsMock);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/repositories/search', () => {
    it('returns repositories for valid query', async () => {
      const res = await request.get(`/api/repositories/search?q=${repo}&userId=${userId}&serverId=${serverId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_count', 1);
      expect(res.body.items[0].name).toBe(repo);
    });
    it('returns 400 for missing params', async () => {
      const res = await request.get(`/api/repositories/search?q=${repo}`);
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 404 for missing server', async () => {
      const res = await request.get(`/api/repositories/search?q=${repo}&userId=${userId}&serverId=badserver`);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/repositories/:owner/:repo/branches', () => {
    it('returns branches for valid repo', async () => {
      const res = await request.get(`/api/repositories/${owner}/${repo}/branches?userId=${userId}&serverId=${serverId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toContain('main');
    });
    it('returns 400 for missing params', async () => {
      const res = await request.get(`/api/repositories/${owner}/${repo}/branches`);
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 404 for missing server', async () => {
      const res = await request.get(`/api/repositories/${owner}/${repo}/branches?userId=${userId}&serverId=badserver`);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/repositories/:owner/:repo/workflows', () => {
    it('returns workflows for valid repo', async () => {
      const res = await request.get(`/api/repositories/${owner}/${repo}/workflows?userId=${userId}&serverId=${serverId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].name).toBe('CI');
    });
    it('returns 400 for missing params', async () => {
      const res = await request.get(`/api/repositories/${owner}/${repo}/workflows`);
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 404 for missing server', async () => {
      const res = await request.get(`/api/repositories/${owner}/${repo}/workflows?userId=${userId}&serverId=badserver`);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/repositories/track', () => {
    it('adds repository to tracking list (success)', async () => {
      const res = await request.post(`/api/repositories/track`).send({
        userId,
        githubServerId: serverId,
        repositoryName,
        repositoryUrl,
        trackedBranches: repoBranchesMock,
        trackedWorkflows: repoWorkflowsMock,
        autoRefreshInterval: 60,
        displayName: 'Test Repo'
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('repositoryId', repoId);
    });
    it('returns 400 for missing fields', async () => {
      const res = await request.post(`/api/repositories/track`).send({ userId });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/repositories/tracked/:userId', () => {
    it('returns tracked repositories', async () => {
      const res = await request.get(`/api/repositories/tracked/${userId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe(repoId);
    });
    it('returns empty array for unknown user', async () => {
      const res = await request.get(`/api/repositories/tracked/unknownuser`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });

  describe('DELETE /api/repositories/tracked/:userId/:repoId', () => {
    it('removes repository from tracking (success)', async () => {
      const res = await request.delete(`/api/repositories/tracked/${userId}/${repoId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });
    it('returns 404 for unknown repo', async () => {
      const res = await request.delete(`/api/repositories/tracked/${userId}/badrepo`);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/repositories/tracked/:userId/:repoId', () => {
    it('updates tracking settings (success)', async () => {
      const res = await request.put(`/api/repositories/tracked/${userId}/${repoId}`).send({
        tracked_workflows: [1, 2],
        tracked_branches: ['main', 'dev']
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.tracked_workflows).toEqual([1, 2]);
      expect(res.body.tracked_branches).toEqual(['main', 'dev']);
    });
    it('returns 400 for invalid format', async () => {
      const res = await request.put(`/api/repositories/tracked/${userId}/${repoId}`).send({
        tracked_workflows: 'not-an-array',
        tracked_branches: 'not-an-array'
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 404 for unknown repo', async () => {
      const res = await request.put(`/api/repositories/tracked/${userId}/badrepo`).send({
        tracked_workflows: [1],
        tracked_branches: ['main']
      });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });
});
