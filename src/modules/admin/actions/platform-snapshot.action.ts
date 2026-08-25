import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformDailySnapshot } from '../entities/platform-daily-snapshot.entity';

const UPSERT_SNAPSHOT_SQL = `
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
  INSERT INTO platform_daily_snapshot (
    "periodDate", "totalUsers", "publishedProfiles", "profileCompletionRate",
    "weeklyActiveProfiles", "newUsersToday", "profilesPublishedToday",
    "flaggedForReview", "activeSuspensions"
  )
  SELECT
    $1::date AS "periodDate",
    COUNT(*)::int AS "totalUsers",
    COUNT(*) FILTER (WHERE "published")::int AS "publishedProfiles",
    ROUND(AVG("filledSections"::numeric) * 100.0 / 9, 2) AS "profileCompletionRate",
    (
      SELECT COUNT(DISTINCT e."profileId")::int
      FROM events e
      JOIN profiles ap ON ap."id" = e."profileId" AND ap."deleted_at" IS NULL
      WHERE e."eventType" IN ('PROFILE_VIEWED', 'LINK_CLICKED')
        AND e."occurredAt" >= now() - interval '7 days'
    ) AS "weeklyActiveProfiles",
    COUNT(*) FILTER (WHERE "createdAt"::date = $1::date)::int AS "newUsersToday",
    (
      SELECT COUNT(*)::int
      FROM profiles pp
      WHERE pp."published_at"::date = $1::date AND pp."deleted_at" IS NULL
    ) AS "profilesPublishedToday",
    COUNT(*) FILTER (WHERE "status" = 'flagged_for_review')::int AS "flaggedForReview",
    COUNT(*) FILTER (WHERE "status" = 'suspended')::int AS "activeSuspensions"
  FROM user_completion
  ON CONFLICT ("periodDate") DO UPDATE SET
    "totalUsers" = EXCLUDED."totalUsers",
    "publishedProfiles" = EXCLUDED."publishedProfiles",
    "profileCompletionRate" = EXCLUDED."profileCompletionRate",
    "weeklyActiveProfiles" = EXCLUDED."weeklyActiveProfiles",
    "newUsersToday" = EXCLUDED."newUsersToday",
    "profilesPublishedToday" = EXCLUDED."profilesPublishedToday",
    "flaggedForReview" = EXCLUDED."flaggedForReview",
    "activeSuspensions" = EXCLUDED."activeSuspensions",
    "updatedAt" = now()
  RETURNING "periodDate"
`;

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
}
