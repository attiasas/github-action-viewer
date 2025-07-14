// Extended backend tests for Express server (Vitest + ESM)
import request from 'supertest';
import app from '../app.js';
import { describe, it, expect, beforeAll } from 'vitest';

describe('Backend basic tests', () => {
  beforeAll(async () => {
    // Clear all relevant tables before running tests
    const { db } = await import('../database.js');
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM user_repositories', (err) => { if (err) reject(err); });
        db.run('DELETE FROM github_servers', (err) => { if (err) reject(err); });
        db.run('DELETE FROM user_settings', (err) => { if (err) reject(err); });
        db.run('DELETE FROM users', (err) => { if (err) reject(err); });
        resolve();
      });
    });
  });
  it('should respond to GET / with 404 or 200', async () => {
    const res = await request(app).get('/');
    expect([200, 404]).toContain(res.statusCode);
  });
});

describe('Auth routes', () => {
  it('should fail login with missing credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should create user and login successfully', async () => {
    const userId = 'testuser-success';
    // Create user
    let res = await request(app).post('/api/auth/create-user').send({ userId });
    expect([200, 201]).toContain(res.statusCode);
    expect(res.body).toHaveProperty('success', true);
    // Login
    res = await request(app).post('/api/auth/login').send({ userId });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    // Get user info
    res = await request(app).get(`/api/auth/user/${userId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', userId);
  });

  it('should fail to create user if user already exists', async () => {
    const userId = 'testuser-success';
    // Try to create the same user again
    const res = await request(app).post('/api/auth/create-user').send({ userId });
    expect(res.statusCode).toBe(409);
    expect(res.body).toHaveProperty('error');
  });
  it('should fail to create user with missing userId', async () => {
    const res = await request(app).post('/api/auth/create-user').send({});
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should fail to get user info for non-existent user', async () => {
    const res = await request(app).get('/api/auth/user/doesnotexist');
    expect(res.statusCode).toBe(404);
  });
  it('should fail to get github servers for non-existent user', async () => {
    const res = await request(app).get('/api/auth/github-servers/doesnotexist');
    expect(res.statusCode).toBe(200); // returns empty array
    expect(Array.isArray(res.body)).toBe(true);
  });
  it('should fail to add github server with missing fields', async () => {
    const res = await request(app).post('/api/auth/github-servers').send({});
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should fail to update github server with missing fields', async () => {
    const res = await request(app).put('/api/auth/github-servers/1').send({});
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should fail to delete github server with missing userId', async () => {
    const res = await request(app).delete('/api/auth/github-servers/1').send({});
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should fail to test token with missing userId', async () => {
    const res = await request(app).get('/api/auth/test-token/1');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('Repositories routes', () => {
  it('should fail to search repositories with missing params', async () => {
    const res = await request(app).get('/api/repositories/search');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should add and get tracked repository successfully', async () => {
    const userId = 'testuser-success';
    // Insert a fake github server for this user
    // Insert directly into DB for test using dynamic import (ESM compatible)
    const { db } = await import('../database.js');
    await new Promise((resolve) => {
      db.run(
        'INSERT OR IGNORE INTO github_servers (id, user_id, server_name, server_url, api_token) VALUES (?, ?, ?, ?, ?)',
        [999, userId, 'Test Server', 'https://github.com', 'fake-token'],
        function(err) {
          resolve();
        }
      );
    });
    // Add tracked repo (minimal valid fields)
    let res = await request(app)
      .post('/api/repositories/track')
      .send({
        userId,
        githubServerId: 999,
        repositoryName: 'Hello-World',
        repositoryUrl: 'https://github.com/octocat/Hello-World',
        trackedBranches: ['main'],
        trackedWorkflows: ['ci.yml'],
        autoRefreshInterval: 300,
        displayName: 'Hello World'
      });
    expect([200, 201]).toContain(res.statusCode);
    expect(res.body).toHaveProperty('success', true);
    const repoId = res.body.repositoryId;
    // Get tracked repos
    res = await request(app).get(`/api/repositories/tracked/${userId}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Clean up: delete tracked repo
    await request(app).delete(`/api/repositories/tracked/${userId}/${repoId}`);
  });
  it('should fail to get workflows with missing params', async () => {
    const res = await request(app).get('/api/repositories/owner/repo/workflows');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should fail to get branches with missing params', async () => {
    const res = await request(app).get('/api/repositories/owner/repo/branches');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should fail to add repository to tracking with missing fields', async () => {
    const res = await request(app).post('/api/repositories/track').send({});
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should fail to get tracked repositories for non-existent user', async () => {
    const res = await request(app).get('/api/repositories/tracked/doesnotexist');
    expect(res.statusCode).toBe(200); // returns empty array
    expect(Array.isArray(res.body)).toBe(true);
  });
  it('should fail to delete tracked repository with non-existent user/repo', async () => {
    const res = await request(app).delete('/api/repositories/tracked/doesnotexist/1');
    expect(res.statusCode).toBe(404);
  });
  it('should fail to update tracked repository with invalid body', async () => {
    const res = await request(app).put('/api/repositories/tracked/doesnotexist/1').send({});
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('Actions routes', () => {
  it('should fail to get workflow runs with missing params', async () => {
    const res = await request(app).get('/api/actions/runs/owner/repo');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should fail to get workflow status for non-existent repo', async () => {
    const res = await request(app).get('/api/actions/workflow-status/doesnotexist/1');
    expect([404,500]).toContain(res.statusCode);
  });
  it('should fail to refresh repo for non-existent repo', async () => {
    const res = await request(app).post('/api/actions/refresh/doesnotexist/1');
    expect([404,500]).toContain(res.statusCode);
  });
});

describe('Users routes', () => {
  it('should fail to get user settings for non-existent user', async () => {
    const res = await request(app).get('/api/users/settings/doesnotexist');
    expect(res.statusCode).toBe(200); // returns default settings
    expect(res.body).toHaveProperty('user_id');
  });
  it('should get and update user settings successfully', async () => {
    const userId = 'testuser-success';
    // Get settings (should return default)
    let res = await request(app).get(`/api/users/settings/${userId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('user_id', userId);
    // Update settings (must provide theme and notifications_enabled)
    res = await request(app)
      .put(`/api/users/settings/${userId}`)
      .send({ theme: 'dark', notifications_enabled: false });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
  it('should fail to update user settings with invalid body', async () => {
    const res = await request(app).put('/api/users/settings/doesnotexist').send({});
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
