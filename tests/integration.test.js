import request from 'supertest';
import express from 'express';

describe('Repositories API', () => {
  let app;
  beforeAll(async () => {
    const repoRoutes = (await import('../server/routes/repositories.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/repositories', repoRoutes);
  });

  it('should return 401 for unauthorized access', async () => {
    const res = await request(app).get('/api/repositories');
    expect(res.statusCode).toBe(401);
  });
});
