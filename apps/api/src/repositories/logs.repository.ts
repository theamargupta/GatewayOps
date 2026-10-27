import { Knex } from 'knex';
import { db } from '../config/database';
import { ApiLog } from '../types';
import { LogsQueryParams, isDateOnly } from '../dto/logs.dto';
import { PaginationMeta } from '../dto/pagination.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

// A bare date means the whole UTC day (Postgres: a date is "midnight", so BETWEEN d AND d is empty).
// `to` therefore becomes an exclusive upper bound at the next midnight. Timestamps are used as given.
function applyDateRange(query: Knex.QueryBuilder, from?: string, to?: string) {
  if (!from || !to) return;
  query.where('l.created_at', '>=', isDateOnly(from) ? `${from}T00:00:00Z` : from);
  if (isDateOnly(to)) {
    query.where('l.created_at', '<', new Date(Date.parse(`${to}T00:00:00Z`) + DAY_MS).toISOString());
  } else {
    query.where('l.created_at', '<=', to);
  }
}

// 1-5 is a status class ([n00, n99]); anything else is an exact code.
function applyStatus(query: Knex.QueryBuilder, statusCode?: number) {
  if (statusCode === undefined) return;
  if (statusCode >= 1 && statusCode <= 5) {
    query.whereBetween('l.status_code', [statusCode * 100, statusCode * 100 + 99]);
  } else {
    query.where('l.status_code', statusCode);
  }
}

export class LogsRepository {
  async findAll(params: LogsQueryParams & { page: number; limit: number }) {
    const { page, limit, service, statusCode, from, to, search } = params;

    // Filters touch api_logs only, so COUNT can be an index-only scan. Measured at 6M rows: a COUNT
    // joined to services took 326 ms vs 47 ms without the join. The slug is resolved to an id first.
    const filtered = db('api_logs as l');

    if (service) {
      const serviceRow = await db('services').select('id').where('slug', service).first();
      if (!serviceRow) {
        return { logs: [] as ApiLog[], meta: { page, limit, total: 0, pages: 0 } as PaginationMeta };
      }
      filtered.where('l.service_id', serviceRow.id);
    }
    applyStatus(filtered, statusCode);
    applyDateRange(filtered, from, to);
    if (search) filtered.where('l.endpoint', 'like', `%${search}%`);

    const totalRow = (await filtered.clone().count('* as count').first()) as { count: string };
    // pg returns int8 (COUNT) as a string; the API contract says number.
    const total = Number(totalRow.count);

    // service_name comes from a JOIN on this page's rows: one query, not one per row (#7).
    // `id` breaks ties so equal timestamps page stably.
    const logs = await filtered
      .join('services as s', 's.id', 'l.service_id')
      .select('l.*', 's.name as service_name')
      .orderBy([
        { column: 'l.created_at', order: 'desc' },
        { column: 'l.id', order: 'desc' },
      ])
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      logs: logs as ApiLog[],
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      } as PaginationMeta,
    };
  }

  async findById(id: string): Promise<ApiLog | null> {
    return await db('api_logs').where('id', id).first();
  }
}
