'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../components/ui/Card';
import { MetricCard } from '../components/dashboard/MetricCard';
import { RequestsChart } from '../components/dashboard/RequestsChart';
import { ErrorTrendChart } from '../components/dashboard/ErrorTrendChart';
import { ServiceDistributionChart } from '../components/dashboard/ServiceDistributionChart';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { Spinner } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';

export default function Dashboard() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fromDefault = twentyFourHoursAgo.toISOString();
  const toDefault = now.toISOString();

  const [dateRange, setDateRange] = useState({ from: fromDefault, to: toDefault });

  const summaryQuery = useDashboardMetrics(dateRange.from, dateRange.to);

  const requestsQuery = useQuery({
    queryKey: ['metrics', 'requests-over-time', dateRange.from, dateRange.to],
    queryFn: async () => {
      const response = await api.get('/metrics/requests-over-time', {
        params: { interval: 'hour', from: dateRange.from, to: dateRange.to },
      });
      return response.data.data || [];
    },
  });

  const errorTrendsQuery = useQuery({
    queryKey: ['metrics', 'error-trends', dateRange.from, dateRange.to],
    queryFn: async () => {
      const response = await api.get('/metrics/error-trends', {
        params: { from: dateRange.from, to: dateRange.to },
      });
      return response.data.data || [];
    },
  });

  const serviceDistributionQuery = useQuery({
    queryKey: ['metrics', 'service-distribution', dateRange.from, dateRange.to],
    queryFn: async () => {
      const response = await api.get('/metrics/service-distribution', {
        params: { from: dateRange.from, to: dateRange.to },
      });
      return response.data.data || [];
    },
  });

  const summary = summaryQuery.data || {};

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-4">Dashboard</h1>
        <DateRangePicker
          from={dateRange.from}
          to={dateRange.to}
          onRangeChange={(from, to) => setDateRange({ from, to })}
        />
      </div>

      {summaryQuery.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <MetricCard title="Total Requests" value={summary.total_requests || 0} />
          <MetricCard title="Failed Requests" value={summary.failed_requests || 0} />
          <MetricCard title="Success Rate" value={`${summary.success_rate || 0}%`} />
          <MetricCard title="Auth Failures" value={summary.auth_failures || 0} />
          <MetricCard title="Avg Response Time" value={`${summary.avg_response_time || 0}ms`} />
          <MetricCard title="Rate Limit Violations" value={summary.rate_limit_violations || 0} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <RequestsChart data={requestsQuery.data || []} isLoading={requestsQuery.isLoading} />
        <ErrorTrendChart data={errorTrendsQuery.data || []} isLoading={errorTrendsQuery.isLoading} />
        <ServiceDistributionChart data={serviceDistributionQuery.data || []} isLoading={serviceDistributionQuery.isLoading} />
      </div>
    </div>
  );
}
