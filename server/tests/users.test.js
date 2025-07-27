
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import app from '../app.js';

import * as dbUtils from '../utils/database.js';

const request = supertest(app);
const userId = 'testuser';
const userSettingsMock = {
  theme: 'dark',
  autoRefreshInterval: 60,
  notifications: true
};

describe('Users API', () => {
  beforeAll(() => {
    vi.spyOn(dbUtils, 'GetUserSettings').mockImplementation(async (uid) => {
      if (uid === userId) return { ...userSettingsMock };
      return null;
    });
    vi.spyOn(dbUtils, 'UpdateUserSettings').mockImplementation(async (uid) => {
      if (uid === userId) return true;
      return false;
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/users/user/:userId', () => {
    it('gets user info', async () => {
      const res = await request.get(`/api/users/user/${userId}`);
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(userId);
    });
    it('fails for missing userId', async () => {
      const res = await request.get('/api/users/user/');
      expect(res.status).toBe(404); // Express will not match route
    });
    it('fails for unknown user', async () => {
      const res = await request.get('/api/users/user/nouser');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });
});
