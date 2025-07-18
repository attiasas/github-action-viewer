// Auth routes tests
import request from 'supertest';
import app from '../app.js';
import { describe, it, expect } from 'vitest';

describe('Auth routes', () => {
  it('should fail login with missing credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should create user and login successfully', async () => {
    const userId = 'testuser-success';
    // Create user
    let res = await request(app).post('/api/auth/create-user').send({ userId });
    expect([200, 201, 409]).toContain(res.statusCode);
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
