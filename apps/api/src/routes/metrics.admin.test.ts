import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { db } from '../config/database';
import redis from '../config/redis';

// Issue #8: GET /metrics/admin/detailed must refuse anonymous and non-admin callers.
const URL = '/api/v1/metrics/admin/detailed';
const sign = (role: string) => jwt.sign({ id: 'user-1', role }, process.env.JWT_SECRET as string);

describe('GET /metrics/admin/detailed authorization', () => {
  // index.ts connects Redis at boot; createApp() alone does not (the public /summary route reads it).
  beforeAll(async () => {
    await redis.connect();
  });

  afterAll(async () => {
    await redis.quit();
    await db.destroy();
  });

  it('answers 401 with no token', async () => {
    const res = await request(createApp()).get(URL);
    expect(res.status).toBe(401);
  });

  it('answers 401 with an invalid token', async () => {
    const res = await request(createApp()).get(URL).set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('answers 403 for a viewer', async () => {
    const res = await request(createApp()).get(URL).set('Authorization', `Bearer ${sign('viewer')}`);
    expect(res.status).toBe(403);
  });

  it('answers 200 for an admin', async () => {
    const res = await request(createApp()).get(URL).set('Authorization', `Bearer ${sign('admin')}`);
    expect(res.status).toBe(200);
  });

  it('keeps /metrics/summary public', async () => {
    const res = await request(createApp()).get('/api/v1/metrics/summary');
    expect(res.status).toBe(200);
  });
});
