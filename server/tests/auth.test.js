import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import app from '../app.js';

import * as dbUtils from '../utils/database.js';
import * as githubUtils from '../utils/github.js';

const request = supertest(app);

const userId = 'testuser';
const serverId = 'server1';
const serverMock = {
  id: serverId,
  serverUrl: 'https://api.github.com',
  apiToken: 'ghp_testtoken',
  serverName: 'TestServer',
  isDefault: true
};

describe('Auth API', () => {
  beforeAll(() => {
    vi.spyOn(dbUtils, 'IsUserExists').mockImplementation(async (uid) => uid === userId);
    vi.spyOn(dbUtils, 'CreateUser').mockImplementation(async (uid) => true);
    vi.spyOn(dbUtils, 'GetUserById').mockImplementation(async (uid) => uid === userId ? { userId } : null);
    vi.spyOn(dbUtils, 'GetUserServers').mockImplementation(async (uid) => uid === userId ? [serverMock] : []);
    vi.spyOn(dbUtils, 'GetUserServer').mockImplementation(async (sid, uid) => (sid === serverId && uid === userId) ? serverMock : null);
    vi.spyOn(dbUtils, 'AddUserServer').mockImplementation(async (uid, name, url, token, isDefault) => ({ id: serverId }));
    vi.spyOn(dbUtils, 'UpdateUserServer').mockImplementation(async (sid, uid, name, url, token, isDefault) => sid === serverId && uid === userId);
    vi.spyOn(dbUtils, 'DeleteUserServer').mockImplementation(async (sid, uid) => sid === serverId && uid === userId);
    vi.spyOn(githubUtils, 'GetUserInfo').mockImplementation(async (url, token) => ({ userName: 'octocat', scopes: ['repo', 'workflow'] }));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('logs in existing user', async () => {
      const res = await request.post('/api/auth/login').send({ userId });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe(userId);
    });
    it('fails for missing userId', async () => {
      const res = await request.post('/api/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for short userId', async () => {
      const res = await request.post('/api/auth/login').send({ userId: 'ab' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for non-existent user', async () => {
      const res = await request.post('/api/auth/login').send({ userId: 'nouser' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/auth/create-user', () => {
    it('creates new user', async () => {
      vi.spyOn(dbUtils, 'IsUserExists').mockImplementationOnce(async () => false);
      const res = await request.post('/api/auth/create-user').send({ userId: 'newuser' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
    it('fails for missing userId', async () => {
      const res = await request.post('/api/auth/create-user').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for short userId', async () => {
      const res = await request.post('/api/auth/create-user').send({ userId: 'ab' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for existing user', async () => {
      vi.spyOn(dbUtils, 'IsUserExists').mockImplementationOnce(async () => true);
      const res = await request.post('/api/auth/create-user').send({ userId });
      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/auth/user/:userId', () => {
    it('gets user info', async () => {
      const res = await request.get(`/api/auth/user/${userId}`);
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(userId);
    });
    it('fails for missing userId', async () => {
      const res = await request.get('/api/auth/user/');
      expect(res.status).toBe(404); // Express will not match route
    });
    it('fails for unknown user', async () => {
      const res = await request.get('/api/auth/user/nouser');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/auth/github-servers/:userId', () => {
    it('gets github servers for user', async () => {
      const res = await request.get(`/api/auth/github-servers/${userId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe(serverId);
    });
    it('returns empty array for unknown user', async () => {
      const res = await request.get('/api/auth/github-servers/nouser');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });

  describe('POST /api/auth/github-servers', () => {
    it('adds github server', async () => {
      const res = await request.post('/api/auth/github-servers').send({
        userId,
        serverName: 'TestServer',
        serverUrl: 'https://api.github.com',
        apiToken: 'ghp_testtoken',
        isDefault: true
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.serverId).toBe(serverId);
    });
    it('fails for missing fields', async () => {
      const res = await request.post('/api/auth/github-servers').send({ userId });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for short serverName', async () => {
      const res = await request.post('/api/auth/github-servers').send({
        userId,
        serverName: 'ab',
        serverUrl: 'https://api.github.com',
        apiToken: 'ghp_testtoken',
        isDefault: true
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for invalid serverUrl', async () => {
      const res = await request.post('/api/auth/github-servers').send({
        userId,
        serverName: 'TestServer',
        serverUrl: 'ftp://api.github.com',
        apiToken: 'ghp_testtoken',
        isDefault: true
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for duplicate server name', async () => {
      vi.spyOn(dbUtils, 'AddUserServer').mockImplementationOnce(async () => { const err = new Error(); err.code = 'SQLITE_CONSTRAINT_UNIQUE'; throw err; });
      const res = await request.post('/api/auth/github-servers').send({
        userId,
        serverName: 'TestServer',
        serverUrl: 'https://api.github.com',
        apiToken: 'ghp_testtoken',
        isDefault: true
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('PUT /api/auth/github-servers/:serverId', () => {
    it('updates github server', async () => {
      const res = await request.put(`/api/auth/github-servers/${serverId}`).send({
        userId,
        serverName: 'TestServer',
        serverUrl: 'https://api.github.com',
        apiToken: 'ghp_testtoken',
        isDefault: true
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
    it('fails for missing fields', async () => {
      const res = await request.put(`/api/auth/github-servers/${serverId}`).send({ userId });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for not found', async () => {
      const res = await request.put(`/api/auth/github-servers/badserver`).send({
        userId,
        serverName: 'TestServer',
        serverUrl: 'https://api.github.com',
        apiToken: 'ghp_testtoken',
        isDefault: true
      });
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
    it('fails for duplicate server name', async () => {
      vi.spyOn(dbUtils, 'UpdateUserServer').mockImplementationOnce(async () => { const err = new Error(); err.code = 'SQLITE_CONSTRAINT_UNIQUE'; throw err; });
      const res = await request.put(`/api/auth/github-servers/${serverId}`).send({
        userId,
        serverName: 'TestServer',
        serverUrl: 'https://api.github.com',
        apiToken: 'ghp_testtoken',
        isDefault: true
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/auth/github-servers/:serverId', () => {
    it('deletes github server', async () => {
      const res = await request.delete(`/api/auth/github-servers/${serverId}`).send({ userId });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
    it('fails for missing userId', async () => {
      const res = await request.delete(`/api/auth/github-servers/${serverId}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for missing serverId', async () => {
      const res = await request.delete(`/api/auth/github-servers/`).send({ userId });
      expect(res.status).toBe(404); // Express will not match route
    });
    it('fails for not found', async () => {
      const res = await request.delete(`/api/auth/github-servers/badserver`).send({ userId });
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/auth/test-token/:serverId', () => {
    it('validates token', async () => {
      const res = await request.get(`/api/auth/test-token/${serverId}?userId=${userId}`);
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.username).toBe('octocat');
      expect(res.body.scopes).toContain('repo');
    });
    it('fails for missing userId', async () => {
      const res = await request.get(`/api/auth/test-token/${serverId}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for missing serverId', async () => {
      const res = await request.get(`/api/auth/test-token/?userId=${userId}`);
      expect(res.status).toBe(404); // Express will not match route
    });
    it('fails for not found', async () => {
      const res = await request.get(`/api/auth/test-token/badserver?userId=${userId}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
    it('fails for invalid token', async () => {
      vi.spyOn(dbUtils, 'GetUserServer').mockImplementationOnce(async () => serverMock);
      vi.spyOn(githubUtils, 'GetUserInfo').mockImplementationOnce(async () => { const err = new Error(); err.response = { status: 401 }; throw err; });
      const res = await request.get(`/api/auth/test-token/${serverId}?userId=${userId}`);
      expect(res.status).toBe(401);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBeDefined();
    });
    it('fails for forbidden token', async () => {
      vi.spyOn(dbUtils, 'GetUserServer').mockImplementationOnce(async () => serverMock);
      vi.spyOn(githubUtils, 'GetUserInfo').mockImplementationOnce(async () => { const err = new Error(); err.response = { status: 403 }; throw err; });
      const res = await request.get(`/api/auth/test-token/${serverId}?userId=${userId}`);
      expect(res.status).toBe(403);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBeDefined();
    });
    it('fails for not found server url', async () => {
      vi.spyOn(dbUtils, 'GetUserServer').mockImplementationOnce(async () => serverMock);
      vi.spyOn(githubUtils, 'GetUserInfo').mockImplementationOnce(async () => { const err = new Error(); err.response = { status: 404 }; throw err; });
      const res = await request.get(`/api/auth/test-token/${serverId}?userId=${userId}`);
      expect(res.status).toBe(404);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });
});
