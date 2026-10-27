import { db } from '../config/database';
import { MetricsSummary, TimeSeriesDataPoint, ServiceDistribution } from '../dto/metrics.dto';
import { LOGIN_FAILURE_EVENT_TYPES } from '../constants/authEvents';

export class MetricsRepository {
  async getSummary(from?: string, to?: string): Promise<MetricsSummary> {
    let query = db('api_logs');

    if (from && to) {
      query = query.whereBetween('created_at', [from, to]);
    }

    // pg returns COUNT (int8) as a string; every count below is converted with Number()
    const countResult = await query.clone().count('*').first() as any;
    const totalRequests = Number(countResult.count);

    let failedQuery = db('api_logs');
    if (from && to) {
      failedQuery = failedQuery.whereBetween('created_at', [from, to]);
    }
    const failedResult = await failedQuery
      .where('status_code', '>=', 400)
      .count('*')
      .first() as any;
    const failedRequests = Number(failedResult.count);

    const successRate = totalRequests > 0 
      ? Math.round((totalRequests - failedRequests) / totalRequests * 100)
      : 100;

    let authFailuresQuery = db('auth_events')
      .whereIn('event_type', LOGIN_FAILURE_EVENT_TYPES);
    if (from && to) {
      authFailuresQuery = authFailuresQuery.whereBetween('created_at', [from, to]);
    }
    const authFailures = await authFailuresQuery.count('*').first() as any;

    let latencyQuery = db('api_logs');
    if (from && to) {
      latencyQuery = latencyQuery.whereBetween('created_at', [from, to]);
    }
    const latencyResult = await latencyQuery.avg('latency_ms').first() as any;
    const avgResponseTime = Math.round(latencyResult.avg || 0);

    let violationsQuery = db('rate_limit_violations');
    if (from && to) {
      violationsQuery = violationsQuery.whereBetween('created_at', [from, to]);
    }
    const violations = await violationsQuery.count('*').first() as any;

    return {
      total_requests: totalRequests,
      failed_requests: failedRequests,
      success_rate: successRate,
      auth_failures: Number(authFailures.count),
      avg_response_time: avgResponseTime,
      rate_limit_violations: Number(violations.count),
    };
  }

  async getRequestsOverTime(
    interval: 'hour' | 'day' = 'hour',
    from?: string,
    to?: string,
  ): Promise<TimeSeriesDataPoint[]> {
    const truncInterval = interval === 'day' ? 'day' : 'hour';
    let query = db('api_logs')
      .select(db.raw(`DATE_TRUNC('${truncInterval}', created_at) as timestamp`))
      .count('* as value');

    if (from && to) {
      query = query.whereBetween('created_at', [from, to]);
    }

    const result = await query
      .groupByRaw(`DATE_TRUNC('${truncInterval}', created_at)`)
      .orderBy('timestamp', 'asc');

    return (result as any[]).map((row: any) => ({
      timestamp: new Date(row.timestamp).toISOString(),
      value: parseInt(row.value.toString(), 10),
    }));
  }

  async getErrorTrends(from?: string, to?: string): Promise<TimeSeriesDataPoint[]> {
    let query = db('api_logs')
      .select(db.raw(`DATE_TRUNC('hour', created_at) as timestamp`))
      .count('* as value')
      .where('status_code', '>=', 400);

    if (from && to) {
      query = query.whereBetween('created_at', [from, to]);
    }

    const result = await query
      .groupByRaw(`DATE_TRUNC('hour', created_at)`)
      .orderBy('timestamp', 'asc');

    return (result as any[]).map((row: any) => ({
      timestamp: new Date(row.timestamp).toISOString(),
      value: parseInt(row.value.toString(), 10),
    }));
  }

  async getServiceDistribution(from?: string, to?: string): Promise<ServiceDistribution[]> {
    let query = db('api_logs')
      .join('services', 'api_logs.service_id', 'services.id')
      .select('services.name')
      .count('api_logs.id as request_count')
      .groupBy('services.name');

    if (from && to) {
      query = query.whereBetween('api_logs.created_at', [from, to]);
    }

    const results = await query.orderBy('request_count', 'desc');

    const total = results.reduce((sum, r) => sum + (typeof r.request_count === 'string' ? parseInt(r.request_count, 10) : r.request_count), 0);

    return results.map((row: any) => {
      const count = typeof row.request_count === 'string' ? parseInt(row.request_count, 10) : row.request_count;
      return {
        service: row.name,
        request_count: count,
        percentage: Math.round((count / total) * 100),
      };
    });
  }

  async getDetailedMetrics(): Promise<any> {
    const result2xx = await db('api_logs')
      .where('status_code', '>=', 200)
      .where('status_code', '<', 300)
      .count('* as count')
      .first() as any;

    const result4xx = await db('api_logs')
      .where('status_code', '>=', 400)
      .where('status_code', '<', 500)
      .count('* as count')
      .first() as any;

    const result5xx = await db('api_logs')
      .where('status_code', '>=', 500)
      .count('* as count')
      .first() as any;

    const slowest = await db('api_logs')
      .select('endpoint')
      .avg('latency_ms as avg_latency')
      .groupBy('endpoint')
      .orderBy('avg_latency', 'desc')
      .first() as any;

    const busiest = await db('api_logs')
      .join('services', 'api_logs.service_id', 'services.id')
      .select('services.name')
      .count('api_logs.id as request_count')
      .groupBy('services.id', 'services.name')
      .orderBy('request_count', 'desc')
      .first() as any;

    return {
      total_requests_2xx: result2xx.count,
      total_requests_4xx: result4xx.count,
      total_requests_5xx: result5xx.count,
      peak_rpm: 0,
      slowest_endpoint: {
        endpoint: slowest?.endpoint || '',
        avg_latency: Math.round(slowest?.avg_latency || 0),
      },
      busiest_service: {
        name: busiest?.name || '',
        request_count: parseInt(busiest?.request_count || 0, 10),
      },
    };
  }
}
