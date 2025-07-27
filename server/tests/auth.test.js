import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import app from '../app.js';

import * as dbUtils from '../utils/database.js';

const request = supertest(app);

const userId = 'testuser';
const userMock = {
  userId: userId,
  createdAt: "2023-10-01T00:00:00Z",
  updatedAt: "2023-10-01T00:00:00Z",
  runRetention: 30
};

describe('Auth API', () => {
  beforeAll(() => {
    vi.spyOn(dbUtils, 'IsUserExists').mockImplementation(async (uid) => uid === userId);
    vi.spyOn(dbUtils, 'CreateUser').mockImplementation(async (uid) => true);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('logs in existing user', async () => {
      const res = await request.post('/api/auth/login').send({ userId });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe(userId);
    });
    it('fails for missing userId', async () => {
      const res = await request.post('/api/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for short userId', async () => {
      const res = await request.post('/api/auth/login').send({ userId: 'ab' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for non-existent user', async () => {
      const res = await request.post('/api/auth/login').send({ userId: 'nouser' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/auth/create-user', () => {
    it('creates new user', async () => {
      vi.spyOn(dbUtils, 'IsUserExists').mockImplementationOnce(async () => false);
      const res = await request.post('/api/auth/create-user').send({ userId: 'newuser' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
    it('fails for missing userId', async () => {
      const res = await request.post('/api/auth/create-user').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for short userId', async () => {
      const res = await request.post('/api/auth/create-user').send({ userId: 'ab' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    it('fails for existing user', async () => {
      vi.spyOn(dbUtils, 'IsUserExists').mockImplementationOnce(async () => true);
      const res = await request.post('/api/auth/create-user').send({ userId });
      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
    });
  });
});
