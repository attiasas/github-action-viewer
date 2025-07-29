
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import app from '../app.js';

import * as dbUtils from '../utils/database.js';

const request = supertest(app);

const userId = 'testuser';
const userMock = {
  id: userId,
  name: 'Test User',
  runRetention: 300
};

describe('Users API', () => {
  beforeAll(() => {
    vi.spyOn(dbUtils, 'GetUserById').mockImplementation(async (uid) => uid === userId ? userMock : null);
    vi.spyOn(dbUtils, 'UpdateUserSettings').mockImplementation(async (uid, runRetention) => (uid === userId ? true : false));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/users/user/:userId', () => {
    it('returns user info for valid user', async () => {
      const res = await request.get(`/api/users/user/${userId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', userId);
      expect(res.body).toHaveProperty('runRetention', 300);
    });
    it('returns 404 for unknown user', async () => {
      const res = await request.get('/api/users/user/unknown');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
    it('returns 400 for missing userId', async () => {
      const res = await request.get('/api/users/user/');
      // Express will not match route, so 404
      expect(res.status).toBe(404);
    });
    it('returns 500 on db error', async () => {
      vi.spyOn(dbUtils, 'GetUserById').mockImplementationOnce(async () => { throw new Error('db fail'); });
      const res = await request.get(`/api/users/user/${userId}`);
      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('PUT /api/users/user/:userId/settings', () => {
    it('updates user settings successfully', async () => {
      const res = await request.put(`/api/users/user/${userId}/settings`).send({ runRetention: 400 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
    it('returns 404 for unknown user', async () => {
      const res = await request.put('/api/users/user/unknown/settings').send({ runRetention: 400 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
    it('returns 400 for missing userId', async () => {
      const res = await request.put('/api/users/user//settings').send({ runRetention: 400 });
      // Express will not match route, so 404
      expect(res.status).toBe(404);
    });
    it('returns 400 for invalid runRetention', async () => {
      const res = await request.put(`/api/users/user/${userId}/settings`).send({ runRetention: -1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('returns 500 on db error', async () => {
      vi.spyOn(dbUtils, 'UpdateUserSettings').mockImplementationOnce(async () => { throw new Error('db fail'); });
      const res = await request.put(`/api/users/user/${userId}/settings`).send({ runRetention: 400 });
      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });
});

