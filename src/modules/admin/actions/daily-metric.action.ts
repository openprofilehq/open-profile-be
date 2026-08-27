import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyMetric } from '../entities/daily-metric.entity';

const METRIC_TYPE_ENUM = '"public"."daily_metrics_metrictype_enum"';

const ROLLUP_WINDOW_SQL = `
  INSERT INTO daily_metrics ("metricType", "periodDate", "count")
  SELECT
    CAST(CASE e."eventType"
      WHEN 'PROFILE_VIEWED' THEN 'profile-views'
      WHEN 'LINK_CLICKED' THEN 'link-clicks'
      WHEN 'SEARCH_PERFORMED' THEN 'search-events'
      WHEN 'INVITE_SENT' THEN 'invites'
    END AS ${METRIC_TYPE_ENUM}),
    CAST(date_trunc('day', e."occurredAt") AS date) AS "periodDate",
    COUNT(*)::bigint AS "count"
  FROM events e
  WHERE e."occurredAt" >= $1 AND e."occurredAt" < $2
    AND e."eventType" IN ('PROFILE_VIEWED', 'LINK_CLICKED', 'SEARCH_PERFORMED', 'INVITE_SENT')
  GROUP BY 1, 2
  ON CONFLICT ("metricType", "periodDate") DO UPDATE
    SET "count" = EXCLUDED."count", "updatedAt" = now()
  RETURNING "metricType", "periodDate", "count"
`;

export interface RollupBucketRow {
  metricType: string;
  count: string;
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
}
