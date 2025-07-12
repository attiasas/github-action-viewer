import request from 'supertest';
import express from 'express';

describe('Repositories API - Tracking', () => {
  let app;
  let repoRoutes;
  beforeAll(async () => {
    repoRoutes = (await import('../server/routes/repositories.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/repositories', repoRoutes);
  });

  const authHeader = { Authorization: 'Bearer testtoken' };

  it('should return 400 if required fields are missing for POST /track', async () => {
    const res = await request(app)
      .post('/api/repositories/track')
      .set(authHeader)
      .send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it('should return 400 if tracked_workflows or tracked_branches are not arrays for PUT /tracked/:userId/:repoId', async () => {
    const res = await request(app)
      .put('/api/repositories/tracked/1/1')
      .set(authHeader)
      .send({ tracked_workflows: 'not-an-array', tracked_branches: {} });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/arrays/);
  });
});
