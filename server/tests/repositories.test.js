// Repositories routes tests
import request from 'supertest';
import app from '../app.js';
import { describe, it, expect } from 'vitest';

describe('Repositories routes', () => {
  it('should fail to search repositories with missing params', async () => {
    const res = await request(app).get('/api/repositories/search');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should add and get tracked repository successfully', async () => {
    const userId = 'testuser-success';
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
    let res = await request(app)
      .post('/api/repositories/track')
      .send({
        userId,
        githubServerId: 999,
        repositoryName: 'Hello-World',
        repositoryUrl: 'https://github.com/octocat/Hello-World',
        trackedBranches: ['main'],
        trackedWorkflows: ['ci.yml'],
        autoRefreshInterval: 60,
        displayName: 'Hello World'
      });
    expect([200, 201]).toContain(res.statusCode);
    if ([200, 201].includes(res.statusCode)) {
      expect(res.body).toHaveProperty('success', true);
      const repoId = res.body.repositoryId;
      res = await request(app).get(`/api/repositories/tracked/${userId}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      await request(app).delete(`/api/repositories/tracked/${userId}/${repoId}`);
    }
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
    expect(res.statusCode).toBe(200);
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
