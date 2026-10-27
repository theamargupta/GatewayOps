import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { db } from '../config/database';

// Issues #2/#4/#10: GET /logs refuses nonsense query values with 400 instead of guessing.
const get = (qs: string) => request(createApp()).get(`/api/v1/logs?${qs}`);

describe('GET /logs query validation', () => {
  afterAll(async () => {
    await db.destroy();
  });

  it.each([
    ['page=0'],
    ['page=-1'],
    ['page=abc'],
    ['limit=0'],
    ['limit=500'],
    ['statusCode=7'],
    ['statusCode=99'],
    ['statusCode=600'],
    ['statusCode=abc'],
    ['from=2026-10-28&to=2026-10-27'],
    ['from=not-a-date&to=2026-10-27'],
  ])('%s answers 400', async (qs) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
  });

  it.each([['page=1&limit=100'], ['statusCode=5'], ['statusCode=503'], ['from=2026-10-27&to=2026-10-27']])(
    '%s answers 200',
    async (qs) => {
      const res = await get(qs);
      expect(res.status).toBe(200);
    },
  );

  // LogFilters sends its whole state on every change, so an untouched "All" select arrives as an empty string.
  it('treats empty filter values from the UI as "no filter"', async () => {
    const fromUi = await get('page=1&limit=10&service=payment-service&statusCode=&search=');
    const plain = await get('page=1&limit=10&service=payment-service');

    expect(fromUi.status).toBe(200);
    expect(fromUi.body.meta.total).toBe(plain.body.meta.total);
  });
});
