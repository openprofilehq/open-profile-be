import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  buildMetricTypeCaseSql,
  TRACKED_EVENT_TYPES_SQL,
} from '../constants/metrics-rollup';
import { DailyMetric } from '../entities/daily-metric.entity';

const ROLLUP_WINDOW_SQL = `
  INSERT INTO daily_metrics ("metricType", "periodDate", "count")
  SELECT
    ${buildMetricTypeCaseSql('e."eventType"')},
    CAST(date_trunc('day', e."occurredAt") AS date) AS "periodDate",
    COUNT(*)::bigint AS "count"
  FROM events e
  WHERE e."occurredAt" >= $1 AND e."occurredAt" < $2
    AND e."eventType" IN (${TRACKED_EVENT_TYPES_SQL})
  GROUP BY 1, 2
  ON CONFLICT ("metricType", "periodDate") DO UPDATE
    SET "count" = EXCLUDED."count", "updatedAt" = now()
  RETURNING "metricType", "periodDate", "count"
`;

export interface RollupBucketRow {
  metricType: string;
  count: string;
}

const SUM_IN_WINDOW_SQL = `
  SELECT COALESCE(SUM("count"), 0)::bigint AS total
  FROM daily_metrics
  WHERE "metricType" = $1
    AND "periodDate" >= $2
    AND "periodDate" < $3
`;

const TIMESERIES_IN_WINDOW_SQL = `
  SELECT
    "periodDate" AS date,
    "count"::bigint AS value
  FROM daily_metrics
  WHERE "metricType" = $1
    AND "periodDate" >= $2
    AND "periodDate" < $3
  ORDER BY "periodDate" ASC
`;

export interface SumRow {
  total: string;
}

export interface TimeseriesRow {
  date: string;
  value: string;
}

@Injectable()
export class DailyMetricAction extends AbstractModelAction<DailyMetric> {
  constructor(
    @InjectRepository(DailyMetric)
    repo: Repository<DailyMetric>,
  ) {
    super(repo, DailyMetric);
  }

  async rollupWindow(from: Date, to: Date): Promise<RollupBucketRow[]> {
    return this.repository.query<RollupBucketRow[]>(ROLLUP_WINDOW_SQL, [
      from,
      to,
    ]);
  }

  async sumByTypeInWindow(
    metricType: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const rows = await this.repository.query<SumRow[]>(SUM_IN_WINDOW_SQL, [
      metricType,
      start,
      end,
    ]);
    return Number(rows[0].total);
  }

  async timeseriesByTypeInWindow(
    metricType: string,
    start: Date,
    end: Date,
  ): Promise<{ date: string; value: number }[]> {
    const rows = await this.repository.query<TimeseriesRow[]>(
      TIMESERIES_IN_WINDOW_SQL,
      [metricType, start, end],
    );
    return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
  }
}
