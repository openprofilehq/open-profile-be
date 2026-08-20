import { MetricsRange, resolveMetricsRange } from './metrics-range.util';

describe('resolveMetricsRange', () => {
  const now = new Date('2026-08-19T14:30:00.000Z'); // Tuesday

  describe('THIS_WEEK', () => {
    it('resolves current week Monday → now and prior 7-day window', () => {
      const result = resolveMetricsRange(MetricsRange.THIS_WEEK, now);

      // Monday 2026-08-17 00:00 UTC
      expect(result.start.toISOString()).toBe('2026-08-17T00:00:00.000Z');
      expect(result.end).toBe(now);
      // Previous week: Mon Aug 10 → Mon Aug 17
      expect(result.prevStart.toISOString()).toBe('2026-08-10T00:00:00.000Z');
      expect(result.prevEnd.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    });

    it('handles Sunday (day 0) by wrapping to previous Monday', () => {
      const sunday = new Date('2026-08-23T10:00:00.000Z'); // Sunday
      const result = resolveMetricsRange(MetricsRange.THIS_WEEK, sunday);

      // Monday 2026-08-17 00:00 UTC
      expect(result.start.toISOString()).toBe('2026-08-17T00:00:00.000Z');
      expect(result.end).toBe(sunday);
      expect(result.prevStart.toISOString()).toBe('2026-08-10T00:00:00.000Z');
      expect(result.prevEnd.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    });

    it('handles Monday at midnight (start of week)', () => {
      const monday = new Date('2026-08-17T00:00:00.000Z');
      const result = resolveMetricsRange(MetricsRange.THIS_WEEK, monday);

      expect(result.start.toISOString()).toBe('2026-08-17T00:00:00.000Z');
      expect(result.end).toBe(monday);
      expect(result.prevStart.toISOString()).toBe('2026-08-10T00:00:00.000Z');
      expect(result.prevEnd.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    });
  });

  describe('LAST_THIRTY_DAYS', () => {
    it('resolves trailing 30-day window and prior 30-day window', () => {
      const result = resolveMetricsRange(MetricsRange.LAST_THIRTY_DAYS, now);

      // start = now - 29 days, floored to 00:00 UTC
      expect(result.start.toISOString()).toBe('2026-07-21T00:00:00.000Z');
      expect(result.end).toBe(now);
      // prev window: 30 days before start
      expect(result.prevStart.toISOString()).toBe('2026-06-21T00:00:00.000Z');
      expect(result.prevEnd.toISOString()).toBe('2026-07-21T00:00:00.000Z');
    });

    it('does not include time component in start', () => {
      const result = resolveMetricsRange(MetricsRange.LAST_THIRTY_DAYS, now);

      expect(result.start.getUTCHours()).toBe(0);
      expect(result.start.getUTCMinutes()).toBe(0);
      expect(result.start.getUTCSeconds()).toBe(0);
      expect(result.start.getUTCMilliseconds()).toBe(0);
    });
  });
});
