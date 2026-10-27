import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../config/database';
import { LogsRepository } from './logs.repository';

// Issues #2 (pagination), #4 (filters), #10 (single-day range), #7 (N+1) on LogsRepository.findAll.
// Fixture rows are tagged L1_FIXTURE in user_agent, deleted in afterAll, and the leftover count asserted 0.
const TAG = 'L1_FIXTURE';
const DAY = '2020-03-15';
const repo = new LogsRepository();

let paymentId: string;
let userServiceId: string;

const fixture = (serviceId: string, status: number, createdAt: string, endpoint = '/l1/fixture') => ({
  service_id: serviceId,
  endpoint,
  method: 'GET',
  status_code: status,
  latency_ms: 5,
  user_agent: TAG,
  created_at: createdAt,
});

describe('LogsRepository.findAll', () => {
  beforeAll(async () => {
    paymentId = (await db('services').where('slug', 'payment-service').first()).id;
    userServiceId = (await db('services').where('slug', 'user-service').first()).id;
    await db('api_logs').insert([
      fixture(paymentId, 503, `${DAY}T00:00:00Z`),
      fixture(paymentId, 200, `${DAY}T12:00:00Z`),
      fixture(paymentId, 599, `${DAY}T23:59:59Z`),
      fixture(userServiceId, 503, `${DAY}T10:00:00Z`),
      fixture(paymentId, 503, '2020-03-16T00:00:00Z'), // first instant of the next day: outside DAY
    ]);
  });

  afterAll(async () => {
    await db('api_logs').where('user_agent', TAG).del();
    const left = await db('api_logs').where('user_agent', TAG).count('* as count').first();
    expect(Number(left?.count)).toBe(0);
    await db.destroy();
  });

  describe('#2 pagination', () => {
    const sqlPage = async (offset: number, limit = 10) =>
      (await db('api_logs').select('id').orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }]).limit(limit).offset(offset)).map((r) => r.id);

    it('page 1 is the first ten rows, newest first', async () => {
      const { logs } = await repo.findAll({ page: 1, limit: 10 });
      expect(logs.map((l) => l.id)).toEqual(await sqlPage(0));
    });

    it('page 2 is rows 11-20', async () => {
      const { logs } = await repo.findAll({ page: 2, limit: 10 });
      expect(logs.map((l) => l.id)).toEqual(await sqlPage(10));
    });

    it('the last page is not empty and total/pages are numbers', async () => {
      const first = await repo.findAll({ page: 1, limit: 10 });
      expect(typeof first.meta.total).toBe('number');
      expect(typeof first.meta.pages).toBe('number');
      const last = await repo.findAll({ page: first.meta.pages, limit: 10 });
      expect(last.logs.length).toBeGreaterThan(0);
    });
  });

  describe('#4 filters combine with AND', () => {
    it('service + an exact status code nobody has returns nothing', async () => {
      const { logs, meta } = await repo.findAll({ page: 1, limit: 10, service: 'payment-service', statusCode: 480 });
      expect(logs).toHaveLength(0);
      expect(meta.total).toBe(0);
    });

    it('statusCode=5 means 500-599 and still honours the service', async () => {
      const { logs, meta } = await repo.findAll({ page: 1, limit: 100, service: 'payment-service', statusCode: 5 });
      expect(logs.length).toBeGreaterThan(0);
      for (const l of logs) {
        expect(l.status_code).toBeGreaterThanOrEqual(500);
        expect(l.status_code).toBeLessThanOrEqual(599);
        expect((l as any).service_name).toBe('Payment Service');
      }
      const sql = await db('api_logs').where('service_id', paymentId).whereBetween('status_code', [500, 599]).count('* as count').first();
      expect(meta.total).toBe(Number(sql?.count));
    });

    it('an exact code still matches exactly', async () => {
      const { meta } = await repo.findAll({ page: 1, limit: 10, service: 'payment-service', statusCode: 503 });
      const sql = await db('api_logs').where({ service_id: paymentId, status_code: 503 }).count('* as count').first();
      expect(meta.total).toBe(Number(sql?.count));
    });
  });

  describe('#10 a single day', () => {
    const sqlDay = async () =>
      (await db('api_logs').whereRaw("created_at >= ?::timestamptz AND created_at < ?::timestamptz", [`${DAY}T00:00:00Z`, '2020-03-16T00:00:00Z']).count('* as count').first())?.count;

    it('from=to=<date> covers the whole UTC day, ends exclusive', async () => {
      const { meta } = await repo.findAll({ page: 1, limit: 100, from: DAY, to: DAY });
      expect(meta.total).toBe(Number(await sqlDay()));
      expect(meta.total).toBeGreaterThanOrEqual(4); // the four fixtures inside DAY
    });

    it('a full ISO timestamp is used as given', async () => {
      const { meta } = await repo.findAll({ page: 1, limit: 100, from: `${DAY}T00:00:00Z`, to: `${DAY}T12:00:00Z` });
      const sql = await db('api_logs').whereBetween('created_at', [`${DAY}T00:00:00Z`, `${DAY}T12:00:00Z`]).count('* as count').first();
      expect(meta.total).toBe(Number(sql?.count));
    });
  });

  describe('#7 no N+1', () => {
    it('limit=50 issues at most 3 queries', async () => {
      let queries = 0;
      const count = () => { queries += 1; };
      db.on('query', count);
      try {
        const { logs } = await repo.findAll({ page: 1, limit: 50 });
        expect(logs).toHaveLength(50);
        expect((logs[0] as any).service_name).toEqual(expect.any(String));
      } finally {
        db.removeListener('query', count);
      }
      expect(queries).toBeLessThanOrEqual(3);
    });

    // Measured at 6M rows: COUNT joined to services 326 ms vs 47 ms index-only without the join.
    // A timing test cannot run here, so this guards the query SHAPE: the count never touches services.
    it.each([
      ['no filter', {}],
      ['status filter', { statusCode: 404 }],
      ['service filter', { service: 'payment-service' }],
    ])('the COUNT query does not join services (%s)', async (_label, filters) => {
      const sqls: string[] = [];
      const capture = (q: { sql: string }) => { sqls.push(q.sql); };
      db.on('query', capture);
      try {
        await repo.findAll({ page: 1, limit: 10, ...filters });
      } finally {
        db.removeListener('query', capture);
      }
      const countSql = sqls.find((sql) => /count\(/i.test(sql));
      expect(countSql).toBeDefined();
      expect(countSql).not.toMatch(/services/i);
    });
  });
});
