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

    const [searches_surfaced, search_driven_views] = await Promise.all([
      this.eventRepo
        .createQueryBuilder('e')
        .where('e."eventType" = :type', { type: EventType.SEARCH_PERFORMED })
        .andWhere('e."occurredAt" >= :start', { start })
        .andWhere('e."occurredAt" <= :end', { end })
        .andWhere(`e.metadata->'resultProfileIds' ? :profileId`, {
          profileId: profile.id,
        })
        .getCount(),
      this.eventRepo
        .createQueryBuilder('e')
        .where('e."profileId" = :profileId', { profileId: profile.id })
        .andWhere('e."eventType" = :type', { type: EventType.PROFILE_VIEWED })
        .andWhere('e."occurredAt" >= :start', { start })
        .andWhere('e."occurredAt" <= :end', { end })
        .andWhere(`e.metadata->>'referrerSearchId' IS NOT NULL`)
        .getCount(),
    ]);

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
}
