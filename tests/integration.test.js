process.env.NODE_ENV = 'test';
import request from 'supertest';
import express from 'express';
import repoRoutes from './__mocks__/repositories.mock.js';

describe('Repositories API', () => {
  let app;
  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/repositories', repoRoutes);
  });

  it('should return 401 for unauthorized access', async () => {
    const res = await request(app).get('/api/repositories');
    expect(res.statusCode).toBe(401);
  });

  describe('/search', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/api/repositories/search?q=test');
      expect(res.statusCode).toBe(401);
    });
    it('should return 400 if query param missing', async () => {
      const res = await request(app)
        .get('/api/repositories/search')
        .set('Authorization', 'Bearer testtoken');
      expect(res.statusCode).toBe(400);
    });
    it('should return 200 and results for valid query', async () => {
      const res = await request(app)
        .get('/api/repositories/search?q=test')
        .set('Authorization', 'Bearer testtoken');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('/track', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app).post('/api/repositories/track');
      expect(res.statusCode).toBe(401);
    });
    it('should return 400 if body missing', async () => {
      const res = await request(app)
        .post('/api/repositories/track')
        .set('Authorization', 'Bearer testtoken')
        .send({});
      expect(res.statusCode).toBe(400);
    });
    it('should return 200 for valid body', async () => {
      const res = await request(app)
        .post('/api/repositories/track')
        .set('Authorization', 'Bearer testtoken')
        .send({ repo: 'owner/repo' });
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('/tracked', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/api/repositories/tracked');
      expect(res.statusCode).toBe(401);
    });
    it('should return 200 and tracked repos for valid request', async () => {
      const res = await request(app)
        .get('/api/repositories/tracked')
        .set('Authorization', 'Bearer testtoken');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('/workflows', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/api/repositories/workflows');
      expect(res.statusCode).toBe(401);
    });
    it('should return 400 if repo param missing', async () => {
      const res = await request(app)
        .get('/api/repositories/workflows')
        .set('Authorization', 'Bearer testtoken');
      expect(res.statusCode).toBe(400);
    });
    it('should return 200 and workflows for valid repo', async () => {
      const res = await request(app)
        .get('/api/repositories/workflows?repo=owner/repo')
        .set('Authorization', 'Bearer testtoken');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('/branches', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/api/repositories/branches');
      expect(res.statusCode).toBe(401);
    });
    it('should return 400 if repo param missing', async () => {
      const res = await request(app)
        .get('/api/repositories/branches')
        .set('Authorization', 'Bearer testtoken');
      expect(res.statusCode).toBe(400);
    });
    it('should return 200 and branches for valid repo', async () => {
      const res = await request(app)
        .get('/api/repositories/branches?repo=owner/repo')
        .set('Authorization', 'Bearer testtoken');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
