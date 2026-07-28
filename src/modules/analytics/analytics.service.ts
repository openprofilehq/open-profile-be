import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event, EventType } from '../events/entities/event.entity';
import { Profile } from '../profile/entities/profile.entity';
import { AnalyticsStatsDto } from './dto/analytics-stats.dto';
import { RedisService } from '../../common/redis/redis.service';
import { normalizeUrl } from '../events/utils/normalize-url.util';
import { LinkClickStatsDto } from './dto/link-click-stats.dto';
import { SearchConversionStatsDto } from './dto/search-conversion-stats.dto';
import { InviteConversionStatsDto } from './dto/invite-conversion-stats.dto';
import {
  resolveDateRange,
  AnalyticsDateRangeQueryDto,
} from './dto/analytics-range-query.dto';

type DailyRow = { date: string; views: string };
type UniqueViewersRaw = { count: string };
type LinkClickRow = { linkUrl: string | null; clicks: string };

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
    private readonly redis: RedisService,
  ) {}

  async getProfileViewStats(
    userId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<AnalyticsStatsDto> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new ForbiddenException('Profile not found');
    }

    const { start, end } = resolveDateRange(query);
    const cacheKey = `analytics:profile-views:${profile.id}:${start.toISOString()}:${end.toISOString()}`;

    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch {
      // ignore cache read errors
    }
    if (cached) {
      try {
        return JSON.parse(cached) as AnalyticsStatsDto;
      } catch {
        // ignore malformed cache, recompute
      }
    }

    const total = profile.viewCount ?? 0;

    const baseQuery = () =>
      this.eventRepo
        .createQueryBuilder('e')
        .where('e."profileId" = :profileId', { profileId: profile.id })
        .andWhere('e."eventType" = :type', { type: EventType.PROFILE_VIEWED })
        .andWhere('e."occurredAt" >= :start', { start })
        .andWhere('e."occurredAt" <= :end', { end });

    const [rangeTotal, uniqueViewersRaw, rows] = await Promise.all([
      baseQuery().getCount(),
      baseQuery()
        .select(
          'COUNT(DISTINCT COALESCE(e."actorId"::text, e."anonymousId"))',
          'count',
        )
        .getRawOne<UniqueViewersRaw>(),
      baseQuery()
        .select('DATE(e."occurredAt")::text', 'date')
        .addSelect('COUNT(*)', 'views')
        .groupBy('date')
        .orderBy('date', 'ASC')
        .getRawMany<DailyRow>(),
    ]);

    const unique_viewers = Number(uniqueViewersRaw?.count ?? 0);

    const daily_breakdown = rows.map((row) => ({
      date: row.date,
      views: Number(row.views),
    }));

    const result: AnalyticsStatsDto = {
      total,
      range_total: rangeTotal,
      unique_viewers,
      daily_breakdown,
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 60);
    } catch (err) {
      this.logger.warn(
        `Redis cache write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return result;
  }

  async getLinkClickStats(
    userId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<LinkClickStatsDto> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new ForbiddenException('Profile not found');
    }

    const { start, end } = resolveDateRange(query);
    const cacheKey = `analytics:link-clicks:${profile.id}:${start.toISOString()}:${end.toISOString()}`;

    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch (err) {
      this.logger.warn(
        `Redis cache read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (cached) {
      try {
        return JSON.parse(cached) as LinkClickStatsDto;
      } catch {
        // ignore malformed cache, recompute
      }
    }

    const rows = await this.eventRepo
      .createQueryBuilder('e')
      .select(`e.metadata->>'linkUrl'`, 'linkUrl')
      .addSelect('COUNT(*)', 'clicks')
      .where('e."profileId" = :profileId', { profileId: profile.id })
      .andWhere('e."eventType" = :type', { type: EventType.LINK_CLICKED })
      .andWhere('e."occurredAt" >= :start', { start })
      .andWhere('e."occurredAt" <= :end', { end })
      .andWhere(`e.metadata->>'linkUrl' IS NOT NULL`)
      .groupBy(`e.metadata->>'linkUrl'`)
      .getRawMany<LinkClickRow>();

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.linkUrl) continue;
      const key = normalizeUrl(row.linkUrl);
      counts.set(key, (counts.get(key) ?? 0) + Number(row.clicks));
    }

    const links = [...counts.entries()]
      .map(([linkUrl, clicks]) => ({ linkUrl, clicks }))
      .sort((a, b) => b.clicks - a.clicks);

    const range_total = links.reduce((sum, l) => sum + l.clicks, 0);

    const result: LinkClickStatsDto = { range_total, links };

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 60);
    } catch (err) {
      this.logger.warn(
        `Redis cache write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return result;
  }

  async getSearchConversionStats(
    userId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<SearchConversionStatsDto> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new ForbiddenException('Profile not found');
    }

    const { start, end } = resolveDateRange(query);
    const cacheKey = `analytics:search-conversions:${profile.id}:${start.toISOString()}:${end.toISOString()}`;

    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch (err) {
      this.logger.warn(
        `Redis cache read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (cached) {
      try {
        return JSON.parse(cached) as SearchConversionStatsDto;
      } catch {
        // ignore malformed cache, recompute
      }
    }
    const [surfacingSearchIds, allReferrerSearchIds] = await Promise.all([
      this.eventRepo
        .createQueryBuilder('e')
        .select(`e.metadata->>'searchId'`, 'searchId')
        .where('e."eventType" = :type', { type: EventType.SEARCH_PERFORMED })
        .andWhere('e."occurredAt" >= :start', { start })
        .andWhere('e."occurredAt" <= :end', { end })
        .andWhere(`e.metadata->'resultProfileIds' ? :profileId`, {
          profileId: profile.id,
        })
        .getRawMany<{ searchId: string | null }>(),
      this.eventRepo
        .createQueryBuilder('e')
        .select(`e.metadata->>'referrerSearchId'`, 'referrerSearchId')
        .where('e."profileId" = :profileId', { profileId: profile.id })
        .andWhere('e."eventType" = :type', { type: EventType.PROFILE_VIEWED })
        .andWhere('e."occurredAt" >= :start', { start })
        .andWhere('e."occurredAt" <= :end', { end })
        .andWhere(`e.metadata->>'referrerSearchId' IS NOT NULL`)
        .getRawMany<{ referrerSearchId: string | null }>(),
    ]);

    const surfacingSearchIdSet = new Set(
      surfacingSearchIds
        .map((row) => row.searchId)
        .filter((id): id is string => id !== null),
    );

    const searches_surfaced = surfacingSearchIdSet.size;

    // search_driven_views counts distinct surfacing searchIds that led to at
    // least one view (not total view count) — this keeps conversion_rate
    // strictly bounded at [0, 1]: "what fraction of searches that surfaced
    // this profile resulted in at least one click-through."
    const convertedSearchIdSet = new Set(
      allReferrerSearchIds
        .map((row) => row.referrerSearchId)
        .filter(
          (id): id is string => id !== null && surfacingSearchIdSet.has(id),
        ),
    );

    const search_driven_views = convertedSearchIdSet.size;

    const conversion_rate =
      searches_surfaced > 0 ? search_driven_views / searches_surfaced : 0;
    const result: SearchConversionStatsDto = {
      searches_surfaced,
      search_driven_views,
      conversion_rate,
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 60);
    } catch (err) {
      this.logger.warn(
        `Redis cache write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return result;
  }

  async getInviteConversionStats(
    userId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<InviteConversionStatsDto> {
    const { start, end } = resolveDateRange(query);
    const cacheKey = `analytics:invite-conversions:${userId}:${start.toISOString()}:${end.toISOString()}`;
    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch (err) {
      this.logger.warn(
        `Redis cache read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (cached) {
      try {
        return JSON.parse(cached) as InviteConversionStatsDto;
      } catch {
        // ignore malformed cache, recompute
      }
    }

    const [sentRows, claimedRows] = await Promise.all([
      this.eventRepo
        .createQueryBuilder('e')
        .select(`e.metadata->>'inviteId'`, 'inviteId')
        .where('e."eventType" = :type', { type: EventType.INVITE_SENT })
        .andWhere('e."actorId" = :userId', { userId })
        .andWhere('e."occurredAt" >= :start', { start })
        .andWhere('e."occurredAt" <= :end', { end })
        .getRawMany<{ inviteId: string | null }>(),
      this.eventRepo
        .createQueryBuilder('e')
        .select(`e.metadata->>'inviteId'`, 'inviteId')
        .where('e."eventType" = :type', { type: EventType.INVITE_CLAIMED })
        .andWhere(`e.metadata->>'inviterUserId' = :userId`, { userId })
        .andWhere('e."occurredAt" >= :start', { start })
        .andWhere('e."occurredAt" <= :end', { end })
        .getRawMany<{ inviteId: string | null }>(),
    ]);

    const sentIdSet = new Set(
      sentRows.map((r) => r.inviteId).filter((id): id is string => id !== null),
    );

    const invites_sent = sentIdSet.size;

    const claimedIdSet = new Set(
      claimedRows
        .map((r) => r.inviteId)
        .filter((id): id is string => id !== null && sentIdSet.has(id)),
    );

    const invites_claimed = claimedIdSet.size;

    const conversion_rate =
      invites_sent > 0 ? invites_claimed / invites_sent : 0;

    const result: InviteConversionStatsDto = {
      invites_sent,
      invites_claimed,
      conversion_rate,
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 60);
    } catch (err) {
      this.logger.warn(
        `Redis cache write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return result;
  }
}
