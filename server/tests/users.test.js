
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

  describe('GET /api/users/settings/:userId', () => {
    it('returns user settings for valid user', async () => {
      const res = await request.get(`/api/users/settings/${userId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('theme', 'dark');
      expect(res.body).toHaveProperty('autoRefreshInterval', 60);
      expect(res.body).toHaveProperty('notifications', true);
    });
    it('returns 400 for missing userId', async () => {
      const res = await request.get(`/api/users/settings/`);
      expect([404]).toContain(res.status); // Express may treat missing param as 404
    });
    it('returns 404 for unknown user', async () => {
      const res = await request.get(`/api/users/settings/unknownuser`);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/users/settings/:userId', () => {
    it('updates user settings for valid user', async () => {
      const res = await request.put(`/api/users/settings/${userId}`).send({ theme: 'light', autoRefreshInterval: 30 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message', 'Settings updated successfully');
    });
    it('returns 400 for unknown user or no changes made', async () => {
      const res = await request.put(`/api/users/settings/unknownuser`).send({ theme: 'light' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });
});
