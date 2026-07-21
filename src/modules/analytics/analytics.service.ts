import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event, EventType } from '../events/entities/event.entity';
import { Profile } from '../profile/entities/profile.entity';
import { AnalyticsStatsDto } from './dto/analytics-stats.dto';
import { AnalyticsRange } from './dto/analytics-range-query.dto';
import { RedisService } from '../../common/redis/redis.service';
import { normalizeUrl } from '../events/utils/normalize-url.util';
import { LinkClickStatsDto } from './dto/link-click-stats.dto';
import { SearchConversionStatsDto } from './dto/search-conversion-stats.dto';

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

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
    range: AnalyticsRange,
  ): Promise<AnalyticsStatsDto> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new ForbiddenException('Profile not found');
    }

    const cacheKey = `analytics:profile-views:${profile.id}:${range}`;
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
        return JSON.parse(cached) as AnalyticsStatsDto;
      } catch {
        // ignore malformed cache, recompute
      }
    }

    const days = RANGE_DAYS[range];
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const rangeStart = new Date(startOfToday);
    rangeStart.setUTCDate(startOfToday.getUTCDate() - (days - 1));

    // Total: read directly from the running counter maintained by
    // EventsService.checkProfileViewMilestone — avoids a COUNT(*) scan
    // and guarantees consistency with Notifications' milestone numbers.
    const total = profile.viewCount ?? 0;

    const rangeTotal = await this.eventRepo
      .createQueryBuilder('e')
      .where('e."profileId" = :profileId', { profileId: profile.id })
      .andWhere('e."eventType" = :type', { type: EventType.PROFILE_VIEWED })
      .andWhere('e."occurredAt" >= :start', { start: rangeStart })
      .getCount();

    const uniqueViewersRaw = (await this.eventRepo
      .createQueryBuilder('e')
      .select(
        'COUNT(DISTINCT COALESCE(e."actorId"::text, e."anonymousId"))',
        'count',
      )
      .where('e."profileId" = :profileId', { profileId: profile.id })
      .andWhere('e."eventType" = :type', { type: EventType.PROFILE_VIEWED })
      .andWhere('e."occurredAt" >= :start', { start: rangeStart })
      .getRawOne()) as UniqueViewersRaw;

    const unique_viewers = Number(uniqueViewersRaw?.count ?? 0);

    const rows = await this.eventRepo
      .createQueryBuilder('e')
      .select(
        `TO_CHAR(e."occurredAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        'date',
      )
      .addSelect('COUNT(*)', 'views')
      .where('e."profileId" = :profileId', { profileId: profile.id })
      .andWhere('e."eventType" = :type', { type: EventType.PROFILE_VIEWED })
      .andWhere('e."occurredAt" >= :start', { start: rangeStart })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<DailyRow>();

    const map = new Map<string, number>();
    for (const row of rows) map.set(row.date, Number(row.views));

    const daily_breakdown: { date: string; views: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - i);
      const key = d.toISOString().split('T')[0];
      daily_breakdown.push({ date: key, views: map.get(key) || 0 });
    }

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
    range: AnalyticsRange,
  ): Promise<LinkClickStatsDto> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new ForbiddenException('Profile not found');
    }

    const cacheKey = `analytics:link-clicks:${profile.id}:${range}`;
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

    const days = RANGE_DAYS[range];
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const rangeStart = new Date(startOfToday);
    rangeStart.setUTCDate(startOfToday.getUTCDate() - (days - 1));

    const rows = await this.eventRepo
      .createQueryBuilder('e')
      .select(`e.metadata->>'linkUrl'`, 'linkUrl')
      .addSelect('COUNT(*)', 'clicks')
      .where('e."profileId" = :profileId', { profileId: profile.id })
      .andWhere('e."eventType" = :type', { type: EventType.LINK_CLICKED })
      .andWhere('e."occurredAt" >= :start', { start: rangeStart })
      .andWhere(`e.metadata->>'linkUrl' IS NOT NULL`)
      .groupBy(`e.metadata->>'linkUrl'`)
      .getRawMany<LinkClickRow>();

    // Merge in JS after normalizing — raw metadata may have unnormalized
    // duplicates (trailing slash, casing) that SQL-level GROUP BY can't
    // collapse, since normalizeUrl's logic isn't expressible as SQL.
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
    range: AnalyticsRange,
  ): Promise<SearchConversionStatsDto> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new ForbiddenException('Profile not found');
    }

    const cacheKey = `analytics:search-conversions:${profile.id}:${range}`;
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

    const days = RANGE_DAYS[range];
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const rangeStart = new Date(startOfToday);
    rangeStart.setUTCDate(startOfToday.getUTCDate() - (days - 1));

    // Denominator: searches in range whose resultProfileIds included this profile.
    // The `?` jsonb operator checks whether a text value exists as a top-level
    // element of a jsonb array — exactly what we need for resultProfileIds.
    const searches_surfaced = await this.eventRepo
      .createQueryBuilder('e')
      .where('e."eventType" = :type', { type: EventType.SEARCH_PERFORMED })
      .andWhere('e."occurredAt" >= :start', { start: rangeStart })
      .andWhere(`e.metadata->'resultProfileIds' ? :profileId`, {
        profileId: profile.id,
      })
      .getCount();

    // Numerator: views of this profile that carry a referrerSearchId — i.e.
    // the visitor clicked through from a search's results, not just an
    // unrelated later view.
    const search_driven_views = await this.eventRepo
      .createQueryBuilder('e')
      .where('e."profileId" = :profileId', { profileId: profile.id })
      .andWhere('e."eventType" = :type', { type: EventType.PROFILE_VIEWED })
      .andWhere('e."occurredAt" >= :start', { start: rangeStart })
      .andWhere(`e.metadata->>'referrerSearchId' IS NOT NULL`)
      .getCount();

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
