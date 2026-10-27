import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../config/database';
import { RateLimitsRepository } from './rateLimits.repository';

// #5: fixtures in a 2001 window no seed row touches: 1000 requests inside a 90-second window.
const FIXTURE = 'LEAD_P5_FIXTURE';
const FROM = '2001-02-01T00:00:00.000Z';
const TO = '2001-02-01T00:01:30.000Z';

function violation(requestCount: number, secondsIn: number) {
  const start = new Date(Date.parse(FROM) + secondsIn * 1000);
  return {
    endpoint: FIXTURE,
    request_count: requestCount,
    window_start: start,
    window_end: new Date(start.getTime() + 60_000),
    created_at: start,
  };
}

describe('rate limit summary RPM (#5)', () => {
  beforeAll(async () => {
    await db('rate_limit_violations').insert([violation(600, 0), violation(400, 45)]);
  });

  afterAll(async () => {
    await db('rate_limit_violations').where('endpoint', FIXTURE).del();
    const left = await db('rate_limit_violations').where('endpoint', FIXTURE).count('* as count').first();
    expect(Number(left?.count)).toBe(0);
    await db.destroy();
  });

  it('divides by the real window length, not whole minutes', async () => {
    const summary = await new RateLimitsRepository().getSummary(FROM, TO);

    expect(summary.requests_per_minute).toBe(666.67);
    expect(Number(summary.total_violations)).toBe(2);
  });
});
