import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../config/database';
import { MetricsRepository } from './metrics.repository';

// #1 regression guard: the dashboard total must equal SELECT COUNT(*) — never inflated by a join —
// and every count must be a number (pg returns COUNT/int8 as a string by default).
describe('dashboard summary totals (#1)', () => {
  afterAll(async () => {
    await db.destroy();
  });

  async function sqlCount(from?: string, to?: string): Promise<number> {
    let query = db('api_logs');
    if (from && to) {
      query = query.whereBetween('created_at', [from, to]);
    }
    const row = await query.count('* as count').first();
    return Number(row?.count);
  }

  it('total_requests equals the raw row count, as a number', async () => {
    const summary = await new MetricsRepository().getSummary();

    expect(summary.total_requests).toBe(await sqlCount());
  });

  it('total_requests equals the raw row count inside a date range', async () => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const summary = await new MetricsRepository().getSummary(from, to);

    expect(summary.total_requests).toBe(await sqlCount(from, to));
  });

  it('returns every count as a number', async () => {
    const summary = await new MetricsRepository().getSummary();

    for (const key of ['total_requests', 'failed_requests', 'auth_failures', 'rate_limit_violations'] as const) {
      expect(typeof summary[key], key).toBe('number');
    }
  });
});
