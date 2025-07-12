// Basic backend test for Express server (Vitest + ESM)
import request from 'supertest';
import app from '../app.js';
import { describe, it, expect } from 'vitest';

describe('Backend basic tests', () => {
  it('should respond to GET / with 404 or 200', async () => {
    const res = await request(app).get('/');
    expect([200, 404]).toContain(res.statusCode);
  });
});
