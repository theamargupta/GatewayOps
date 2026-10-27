import { describe, expect, it } from 'vitest';
import { requestsPerMinute } from './requestsPerMinute';

// #5: RPM must not floor the window to whole minutes.
describe('requestsPerMinute', () => {
  it('uses fractional minutes (problem example: 1000 requests in 90 s)', () => {
    expect(requestsPerMinute(1000, 90)).toBe(666.67);
  });

  it('is exact on whole minutes', () => {
    expect(requestsPerMinute(1000, 120)).toBe(500);
  });

  it('handles windows shorter than a minute', () => {
    expect(requestsPerMinute(30, 30)).toBe(60);
  });

  it('returns 0 for an empty or inverted window instead of dividing by zero', () => {
    expect(requestsPerMinute(1000, 0)).toBe(0);
    expect(requestsPerMinute(1000, -60)).toBe(0);
  });

  it('returns 0 when there were no requests', () => {
    expect(requestsPerMinute(0, 90)).toBe(0);
  });
});
