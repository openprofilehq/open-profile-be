import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformDailySnapshot } from '../entities/platform-daily-snapshot.entity';

const USER_COMPLETION_CTE = `
  WITH user_completion AS (
    SELECT
      u."id"                AS "userId",
      u."created_at"        AS "createdAt",
      u."status"            AS "status",
      (
        CASE WHEN btrim(p."bio") <> '' THEN 1 ELSE 0 END
        + CASE WHEN jsonb_array_length(p."content"->'links'->'items') > 0 THEN 1 ELSE 0 END
        + CASE WHEN jsonb_array_length(p."content"->'projects'->'items') > 0 THEN 1 ELSE 0 END
        + CASE WHEN coalesce(p."content"->'cta'->>'value', '') <> '' THEN 1 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM work_experience we WHERE we."profile_id" = p."id") THEN 1 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM education ed WHERE ed."profile_id" = p."id") THEN 1 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM skills sk WHERE sk."profile_id" = p."id") THEN 1 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM awards aw WHERE aw."profile_id" = p."id") THEN 1 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM portfolio_items pi WHERE pi."user_id" = u."id") THEN 1 ELSE 0 END
      ) AS "filledSections",
      (p."id" IS NOT NULL AND p."is_published" = true) AS "published"
    FROM users u
    LEFT JOIN profiles p ON p."user_id" = u."id" AND p."deleted_at" IS NULL
    WHERE u."deleted_at" IS NULL
  )
`;

const SNAPSHOT_COLUMNS = `
    COUNT(*)::int AS "total_users",
    COUNT(*) FILTER (WHERE "published")::int AS "published_profiles",
    ROUND(AVG("filledSections"::numeric) * 100.0 / 9, 2) AS "profile_completion_rate",
    (
      SELECT COUNT(DISTINCT e."profileId")::int
      FROM events e
      JOIN profiles ap ON ap."id" = e."profileId" AND ap."deleted_at" IS NULL
      WHERE e."eventType" IN ('PROFILE_VIEWED', 'LINK_CLICKED')
        AND e."occurredAt" >= now() - interval '7 days'
    ) AS "weekly_active_profiles",
    COUNT(*) FILTER (WHERE "createdAt"::date = $1::date)::int AS "new_users_today",
    (
      SELECT COUNT(*)::int
      FROM profiles pp
      WHERE pp."published_at"::date = $1::date AND pp."deleted_at" IS NULL
    ) AS "profiles_published_today",
    COUNT(*) FILTER (WHERE "status" = 'flagged_for_review')::int AS "flagged_for_review",
    COUNT(*) FILTER (WHERE "status" = 'suspended')::int AS "active_suspensions"
`;

const UPSERT_SNAPSHOT_SQL = `
  ${USER_COMPLETION_CTE}
  INSERT INTO platform_daily_snapshot (
    "period_date", "total_users", "published_profiles", "profile_completion_rate",
    "weekly_active_profiles", "new_users_today", "profiles_published_today",
    "flagged_for_review", "active_suspensions"
  )
  SELECT
    $1::date AS "period_date",
    ${SNAPSHOT_COLUMNS}
  FROM user_completion
  ON CONFLICT ("period_date") DO UPDATE SET
    "total_users" = EXCLUDED."total_users",
    "published_profiles" = EXCLUDED."published_profiles",
    "profile_completion_rate" = EXCLUDED."profile_completion_rate",
    "weekly_active_profiles" = EXCLUDED."weekly_active_profiles",
    "new_users_today" = EXCLUDED."new_users_today",
    "profiles_published_today" = EXCLUDED."profiles_published_today",
    "flagged_for_review" = EXCLUDED."flagged_for_review",
    "active_suspensions" = EXCLUDED."active_suspensions",
    "updated_at" = now()
  RETURNING "period_date"
`;

const LIVE_SNAPSHOT_SQL = `
  ${USER_COMPLETION_CTE}
  SELECT
    $1::date AS "period_date",
    ${SNAPSHOT_COLUMNS}
  FROM user_completion
`;

type RawSnapshotRow = {
  period_date: string | Date;
  total_users: number | string;
  published_profiles: number | string;
  profile_completion_rate: number | string | null;
  weekly_active_profiles: number | string;
  new_users_today: number | string;
  profiles_published_today: number | string;
  flagged_for_review: number | string;
  active_suspensions: number | string;
};

export type SnapshotFigures = Pick<
  PlatformDailySnapshot,
  | 'totalUsers'
  | 'publishedProfiles'
  | 'profileCompletionRate'
  | 'weeklyActiveProfiles'
  | 'newUsersToday'
  | 'profilesPublishedToday'
  | 'flaggedForReview'
  | 'activeSuspensions'
> & { periodDate: string };

function toFigures(row: RawSnapshotRow): SnapshotFigures {
  return {
    periodDate: String(row.period_date),
    totalUsers: Number(row.total_users) || 0,
    publishedProfiles: Number(row.published_profiles) || 0,
    profileCompletionRate: Number(row.profile_completion_rate) || 0,
    weeklyActiveProfiles: Number(row.weekly_active_profiles) || 0,
    newUsersToday: Number(row.new_users_today) || 0,
    profilesPublishedToday: Number(row.profiles_published_today) || 0,
    flaggedForReview: Number(row.flagged_for_review) || 0,
    activeSuspensions: Number(row.active_suspensions) || 0,
  };
}

@Injectable()
export class PlatformSnapshotAction extends AbstractModelAction<PlatformDailySnapshot> {
  constructor(
    @InjectRepository(PlatformDailySnapshot)
    repo: Repository<PlatformDailySnapshot>,
  ) {
    super(repo, PlatformDailySnapshot);
  }

  async computeAndUpsert(periodDate: Date | string): Promise<void> {
    await this.repository.query(UPSERT_SNAPSHOT_SQL, [periodDate]);
  }

  async getLatestBefore(date: Date): Promise<SnapshotFigures | null> {
    const rows = await this.repository.query<RawSnapshotRow[]>(
      `SELECT * FROM platform_daily_snapshot WHERE "period_date" < $1 ORDER BY "period_date" DESC LIMIT 1`,
      [date],
    );
    return rows[0] ? toFigures(rows[0]) : null;
  }

  async computeLive(now: Date = new Date()): Promise<SnapshotFigures> {
    const rows = await this.repository.query<RawSnapshotRow[]>(
      LIVE_SNAPSHOT_SQL,
      [now],
    );
    return toFigures(rows[0]);
  }

  async publishingTimeseriesInWindow(
    start: Date,
    end: Date,
  ): Promise<{ date: string; value: number }[]> {
    const rows = await this.repository.query<{ date: string; value: number }[]>(
      `SELECT "period_date" AS "date", "profiles_published_today" AS "value"
       FROM platform_daily_snapshot
       WHERE "period_date" >= $1::date AND "period_date" < $2::date
       ORDER BY "period_date" ASC`,
      [start, end],
    );
    return rows.map((r) => ({ date: String(r.date), value: Number(r.value) }));
  }
}
