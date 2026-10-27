import { db } from '../config/database';
import { RateLimitViolation } from '../types';
import { requestsPerMinute } from '../utils/requestsPerMinute';

export class RateLimitsRepository {
  async getSummary(from?: string, to?: string): Promise<any> {
    let query = db('rate_limit_violations');
    if (from && to) {
      query = query.whereBetween('created_at', [from, to]);
    }

    const totalViolations = await query.clone().count('*').first() as any;

    let requestsQuery = db('rate_limit_violations');
    if (from && to) {
      requestsQuery = requestsQuery.whereBetween('window_start', [from, to]);
    }
    const requestsResult = await requestsQuery.sum('request_count').first() as any;
    // pg returns SUM(bigint) as a string
    const totalRequests = Number(requestsResult.sum ?? 0);

    const windowSeconds = from && to
      ? (new Date(to).getTime() - new Date(from).getTime()) / 1000
      : await this.dataSpanSeconds();

    return {
      total_violations: totalViolations.count,
      requests_per_minute: requestsPerMinute(totalRequests, windowSeconds),
      peak_rpm: 0,
    };
  }

  // With no range selected, the window is the span the violations actually cover —
  // not a fixed hour, which overstated RPM for data spread over days.
  private async dataSpanSeconds(): Promise<number> {
    const span = await db('rate_limit_violations')
      .min('window_start as first')
      .max('window_end as last')
      .first() as any;
    if (!span?.first || !span?.last) {
      return 0;
    }
    return (new Date(span.last).getTime() - new Date(span.first).getTime()) / 1000;
  }

  async getViolations(from?: string, to?: string): Promise<RateLimitViolation[]> {
    let query = db('rate_limit_violations');
    if (from && to) {
      query = query.whereBetween('created_at', [from, to]);
    }
    return await query.orderBy('created_at', 'desc');
  }

  async getTopOffenders(): Promise<any[]> {
    return await db('rate_limit_violations')
      .select('user_id', 'service_id')
      .count('* as violation_count')
      .sum('request_count')
      .groupBy('user_id', 'service_id')
      .orderBy('violation_count', 'desc')
      .limit(10);
  }
}
