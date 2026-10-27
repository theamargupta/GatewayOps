import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { db } from '../config/database';

// Proves the harness itself: the app boots in-process and the shared database answers.
describe('test harness', () => {
  afterAll(async () => {
    await db.destroy();
  });

  it('serves the health route in-process', async () => {
    const res = await request(createApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('reaches the seeded database', async () => {
    const row = await db('services').count('* as count').first();

    expect(Number(row?.count)).toBe(5);
  });
});
