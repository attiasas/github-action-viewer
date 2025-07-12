import request from 'supertest';
import express from 'express';

describe('Actions API', () => {
  let app;
  beforeAll(async () => {
    const routes = (await import('../server/routes/actions.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/actions', routes);
  });

  it('should return 401 for unauthorized access', async () => {
    const res = await request(app).get('/api/actions');
    expect(res.statusCode).toBe(401);
  });
});
