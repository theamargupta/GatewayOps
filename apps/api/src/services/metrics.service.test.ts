import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../config/database';
import redis from '../config/redis';
import { MetricsService } from './metrics.service';

// Issue #3: /metrics/summary cached one answer under a fixed key for an hour, whatever the date range.
// Fixture rows are tagged L1_FIXTURE in user_agent, deleted in afterAll, and the leftover count asserted 0.
const TAG = 'L1_FIXTURE';
const DAY_X = { from: '2020-03-15T00:00:00Z', to: '2020-03-15T23:59:59Z' };
const DAY_Y = { from: '2020-03-16T00:00:00Z', to: '2020-03-16T23:59:59Z' };
const service = new MetricsService();

let serviceId: string;

const insertFixture = (createdAt: string) =>
  db('api_logs').insert({
    service_id: serviceId,
    endpoint: '/l1/fixture',
    method: 'GET',
    status_code: 200,
    latency_ms: 5,
    user_agent: TAG,
    created_at: createdAt,
  });

// Only the summary keys; never FLUSHALL, Redis is shared with other sessions.
async function clearSummaryKeys() {
  for await (const key of redis.scanIterator({ MATCH: 'metrics:summary*', COUNT: 100 })) {
    await redis.del(key);
  }
}

describe('MetricsService.getSummary cache', () => {
  beforeAll(async () => {
    await redis.connect();
    serviceId = (await db('services').where('slug', 'payment-service').first()).id;
    await insertFixture('2020-03-15T10:00:00Z');
    await insertFixture('2020-03-15T11:00:00Z');
    await insertFixture('2020-03-15T12:00:00Z');
  });

  beforeEach(clearSummaryKeys);

  afterAll(async () => {
    await clearSummaryKeys();
    await db('api_logs').where('user_agent', TAG).del();
    const left = await db('api_logs').where('user_agent', TAG).count('* as count').first();
    expect(Number(left?.count)).toBe(0);
    await redis.quit();
    await db.destroy();
  });

  it('answers each date range from its own data', async () => {
    const x = await service.getSummary(DAY_X.from, DAY_X.to);
    const y = await service.getSummary(DAY_Y.from, DAY_Y.to);

    expect(Number(x.total_requests)).toBe(3);
    expect(Number(y.total_requests)).toBe(0);
  });

  it('keys the cache by range and expires within 60 s', async () => {
    await service.getSummary(DAY_X.from, DAY_X.to);

    const key = `metrics:summary:${DAY_X.from}:${DAY_X.to}`;
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('serves a repeat of the same range from cache, then reflects new rows once the entry expires', async () => {
    const first = await service.getSummary(DAY_X.from, DAY_X.to);
    expect(Number(first.total_requests)).toBe(3);

    await insertFixture('2020-03-15T13:00:00Z');
    const cached = await service.getSummary(DAY_X.from, DAY_X.to);
    expect(Number(cached.total_requests)).toBe(3); // still inside the TTL: the cache protects the DB

    await redis.del(`metrics:summary:${DAY_X.from}:${DAY_X.to}`); // what the 60 s expiry does
    const fresh = await service.getSummary(DAY_X.from, DAY_X.to);
    expect(Number(fresh.total_requests)).toBe(4);
  });
});
