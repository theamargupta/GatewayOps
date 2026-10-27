// Requests per minute over a window of any length, rounded to 2 decimals.
// The window is NOT floored to whole minutes: 1000 requests in 90 s is 666.67 RPM, not 1000 (#5).
export function requestsPerMinute(totalRequests: number, windowSeconds: number): number {
  if (windowSeconds <= 0 || totalRequests <= 0) {
    return 0;
  }
  const minutes = windowSeconds / 60;
  return Math.round((totalRequests / minutes) * 100) / 100;
}
