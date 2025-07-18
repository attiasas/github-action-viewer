// Workflows routes tests
import request from 'supertest';
import app from '../app.js';
import { describe, it, expect } from 'vitest';

describe('Workflows routes', () => {
  it('should fail to get workflow runs with missing params', async () => {
    const res = await request(app).get('/api/workflows/runs/owner/repo');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('should fail to get workflow status for non-existent repo', async () => {
    const res = await request(app).get('/api/workflows/workflow-status/doesnotexist/1');
    expect([404,500]).toContain(res.statusCode);
  });
  it('should fail to refresh repo for non-existent repo', async () => {
    const res = await request(app).post('/api/workflows/refresh/doesnotexist/1');
    expect([404,500]).toContain(res.statusCode);
  });
});
