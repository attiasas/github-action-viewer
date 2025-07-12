// Extended backend tests for Express server (Vitest + ESM)
import request from 'supertest';
import app from '../app.js';
import { describe, it, expect } from 'vitest';

describe('Backend basic tests', () => {
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
  it('should fail to get stats for non-existent user', async () => {
    const res = await request(app).get('/api/actions/stats/doesnotexist');
    expect(res.statusCode).toBe(200); // returns array
    expect(Array.isArray(res.body)).toBe(true);
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
  it('should fail to update user settings with invalid body', async () => {
    const res = await request(app).put('/api/users/settings/doesnotexist').send({});
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
