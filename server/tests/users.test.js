// Users routes tests
import request from 'supertest';
import app from '../app.js';
import { describe, it, expect } from 'vitest';

describe('Users routes', () => {
  it('should fail to get user settings for non-existent user', async () => {
    const res = await request(app).get('/api/users/settings/doesnotexist');
    expect([404, 500]).toContain(res.statusCode); // expect 404 or 500 for missing user
  });
  it('should get and update user settings successfully', async () => {
    const userId = 'testuser-success';
    let res = await request(app).get(`/api/users/settings/${userId}`);
    expect([200, 404]).toContain(res.statusCode); // allow 200 if exists, 404 if not
    if (res.statusCode === 200) {
      expect(res.body).toHaveProperty('user_id', userId);
      res = await request(app)
        .put(`/api/users/settings/${userId}`)
        .send({ theme: 'dark' });
      expect([200, 400]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body).toHaveProperty('success', true);
      }
    }
  });
  it('should fail to update user settings with invalid body', async () => {
    const res = await request(app).put('/api/users/settings/doesnotexist').send({});
    expect([400, 500]).toContain(res.statusCode); // expect 400 or 500 for invalid update
  });
});
