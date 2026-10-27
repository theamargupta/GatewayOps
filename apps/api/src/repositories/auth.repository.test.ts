import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../config/database';
import { AuthRepository } from './auth.repository';
import { MetricsRepository } from './metrics.repository';

// #6: a login failure is recorded as either 'login_failure' or 'failed_login' (knex seed, AuthEvent type).
// Fixtures live in a 2001 window no seed row touches, so the expected counts are exact.
const FIXTURE = 'LEAD_P6_FIXTURE';
const FROM = '2001-01-01T00:00:00.000Z';
const TO = '2001-01-01T01:00:00.000Z';

function event(eventType: string, minute: number) {
  return {
    event_type: eventType,
    ip_address: '10.0.0.6',
    user_agent: FIXTURE,
    metadata: {},
    created_at: new Date(Date.parse(FROM) + minute * 60_000),
  };
}

describe('failed login counting (#6)', () => {
  beforeAll(async () => {
    await db('auth_events').insert([
      event('login_failure', 1),
      event('login_failure', 2),
      event('login_failure', 3),
      event('failed_login', 4),
      event('failed_login', 5),
      event('login_success', 6),
    ]);
  });

  afterAll(async () => {
    await db('auth_events').where('user_agent', FIXTURE).del();
    const left = await db('auth_events').where('user_agent', FIXTURE).count('* as count').first();
    expect(Number(left?.count)).toBe(0);
    await db.destroy();
  });

  it('auth stats count both failure names', async () => {
    const stats = await new AuthRepository().getStats(FROM, TO);

    expect(Number(stats.failed_logins)).toBe(5);
    expect(Number(stats.successful_logins)).toBe(1);
  });

  it('the dashboard Auth Failures card counts both failure names', async () => {
    const summary = await new MetricsRepository().getSummary(FROM, TO);

    expect(Number(summary.auth_failures)).toBe(5);
  });
});
