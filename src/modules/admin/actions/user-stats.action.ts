import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../../events/entities/event.entity';
import { Profile } from '../../profile/entities/profile.entity';

const PROFILE_COMPLETION_SQL = `
  SELECT
    ROUND((
      CASE WHEN btrim(p."bio") <> '' THEN 1 ELSE 0 END
      + CASE WHEN jsonb_array_length(p."content"->'links'->'items') > 0 THEN 1 ELSE 0 END
      + CASE WHEN jsonb_array_length(p."content"->'projects'->'items') > 0 THEN 1 ELSE 0 END
      + CASE WHEN coalesce(p."content"->'cta'->>'value', '') <> '' THEN 1 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM work_experience we WHERE we."profile_id" = p."id") THEN 1 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM education ed WHERE ed."profile_id" = p."id") THEN 1 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM skills sk WHERE sk."profile_id" = p."id") THEN 1 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM awards aw WHERE aw."profile_id" = p."id") THEN 1 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM portfolio_items pi WHERE pi."user_id" = p."user_id") THEN 1 ELSE 0 END
    )::numeric * 100.0 / 9, 2) AS "profileCompletion"
  FROM profiles p
  WHERE p."user_id" = $1 AND p."deleted_at" IS NULL
`;

const LINK_CLICK_COUNT_SQL = `
  SELECT COUNT(*)::bigint AS "count"
  FROM events
  WHERE "profileId" = $1 AND "eventType" = 'LINK_CLICKED'
`;

const SURFACING_SEARCH_IDS_SQL = `
  SELECT DISTINCT e.metadata->>'searchId' AS "searchId"
  FROM events e
  WHERE e."eventType" = 'SEARCH_PERFORMED'
    AND e.metadata->'resultProfileIds' ? $1
`;

const SEARCH_DRIVEN_VIEW_IDS_SQL = `
  SELECT e.metadata->>'referrerSearchId' AS "referrerSearchId"
  FROM events e
  WHERE e."profileId" = $1
    AND e."eventType" = 'PROFILE_VIEWED'
    AND e.metadata->>'referrerSearchId' IS NOT NULL
`;

export interface SearchConversionResult {
  searchesSurfaced: number;
  searchDrivenViews: number;
  conversionRate: number;
}

@Injectable()
export class UserStatsAction extends AbstractModelAction<Profile> {
  constructor(
    @InjectRepository(Profile)
    repo: Repository<Profile>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
  ) {
    super(repo, Profile);
  }

  async profileCompletion(userId: string): Promise<number> {
    const rows = await this.repository.query<{ profileCompletion: string }[]>(
      PROFILE_COMPLETION_SQL,
      [userId],
    );
    return Number(rows[0]?.profileCompletion ?? 0);
  }

  async clickCount(profileId: string): Promise<number> {
    const rows = await this.eventRepo.query<{ count: string }[]>(
      LINK_CLICK_COUNT_SQL,
      [profileId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async searchConversion(profileId: string): Promise<SearchConversionResult> {
    const [surfacingRows, referrerRows] = await Promise.all([
      this.eventRepo.query<{ searchId: string | null }[]>(
        SURFACING_SEARCH_IDS_SQL,
        [profileId],
      ),
      this.eventRepo.query<{ referrerSearchId: string | null }[]>(
        SEARCH_DRIVEN_VIEW_IDS_SQL,
        [profileId],
      ),
    ]);

    const surfacedSet = new Set(
      surfacingRows
        .map((row) => row.searchId)
        .filter((id): id is string => id !== null),
    );
    const drivenSet = new Set(
      referrerRows
        .map((row) => row.referrerSearchId)
        .filter((id): id is string => id !== null && surfacedSet.has(id)),
    );

    const searchesSurfaced = surfacedSet.size;
    const searchDrivenViews = drivenSet.size;

    return {
      searchesSurfaced,
      searchDrivenViews,
      conversionRate:
        searchesSurfaced > 0 ? searchDrivenViews / searchesSurfaced : 0,
    };
  }
}
