import { useQuery } from '@tanstack/react-query';
import { fetchMetricsSummary } from '../lib/api';

export function useDashboardMetrics(from?: string, to?: string) {
  return useQuery({
    // The range is a variable the queryFn depends on, so it belongs in the key (TanStack Query v5 query keys guide).
    queryKey: ['metrics', 'summary', from, to],
    queryFn: () => fetchMetricsSummary(from, to),
  });
}
