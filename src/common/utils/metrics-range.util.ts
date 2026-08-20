export enum MetricsRange {
  THIS_WEEK = 'this_week',
  LAST_THIRTY_DAYS = 'last_thirty_days',
}

export interface ResolvedRange {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

function toStartOfDayUTC(d: Date): Date {
  const result = new Date(d);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function startOfWeekUTC(d: Date): Date {
  const day = toStartOfDayUTC(d);
  const dow = day.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  day.setUTCDate(day.getUTCDate() + mondayOffset);
  return day;
}

export function resolveMetricsRange(
  range: MetricsRange,
  now: Date = new Date(),
): ResolvedRange {
  switch (range) {
    case MetricsRange.THIS_WEEK: {
      const start = startOfWeekUTC(now);
      const end = now;
      const prevStart = new Date(start);
      prevStart.setUTCDate(prevStart.getUTCDate() - 7);
      const prevEnd = new Date(start);
      return { start, end, prevStart, prevEnd };
    }

    case MetricsRange.LAST_THIRTY_DAYS: {
      const end = now;
      const start = toStartOfDayUTC(now);
      start.setUTCDate(start.getUTCDate() - 29);
      const prevEnd = new Date(start);
      const prevStart = new Date(start);
      prevStart.setUTCDate(prevStart.getUTCDate() - 30);
      return { start, end, prevStart, prevEnd };
    }
  }
}
