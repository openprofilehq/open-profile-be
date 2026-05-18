import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Request } from 'express';
import { ProfileView } from './entities/profile-view.entity';
import { Profile } from '../profile/entities/profile.entity';
import { AnalyticsStatsDto } from './dto/analytics-stats.dto';
import { RedisService } from '../../common/redis/redis.service';

type UniqueViewersRaw = {
  count: string;
};

type DailyRow = {
  date: string;
  views: string;
};

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(ProfileView)
    private readonly profileViewRepo: Repository<ProfileView>,

    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,

    private readonly redis: RedisService,
  ) {}

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];

    if (forwarded) {
      const first = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(',')[0];

      return first.trim();
    }

    return req.socket.remoteAddress ?? '0.0.0.0';
  }

  private async isDuplicate(
    profileId: string,
    viewerIp: string,
  ): Promise<boolean> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const existing = await this.profileViewRepo.findOne({
      where: {
        profileId,
        viewerIp,
        viewedAt: MoreThan(fiveMinutesAgo),
      },
    });

    return !!existing;
  }

  async recordView(profileId: string, req: Request): Promise<void> {
    const profile = await this.profileRepo.findOne({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException(`Profile not found`);
    }

    const viewerIp = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const duplicate = await this.isDuplicate(profileId, viewerIp);

    if (duplicate) {
      this.logger.log({
        event: 'profile_view_deduplicated',
        profileId,
        viewerIp,
      });
      return;
    }

    const view = this.profileViewRepo.create({
      profile: { id: profileId },
      viewerIp,
      userAgent: userAgent || undefined,
    });

    await this.profileViewRepo.save(view);

    this.logger.log({
      event: 'profile_view_recorded',
      profileId,
      viewerIp,
      userAgent: userAgent ?? 'not_provided',
    });
  }

  async getStats(userId: string): Promise<AnalyticsStatsDto> {
    // Find user's profile
    const profile = await this.profileRepo.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new ForbiddenException('Profile not found');
    }

    // Redis cache check (safe)
    const cacheKey = `analytics:stats:${profile.id}`;

    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch {
      // ignore cache read errors and continue with DB computation
    }

    if (cached) {
      try {
        return JSON.parse(cached) as AnalyticsStatsDto;
      } catch {
        // ignore malformed cache payload and recompute
      }
    }

    // UTC DATE BOUNDARIES (FIXED)

    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setUTCDate(startOfToday.getUTCDate() - 6);

    const startOf30Days = new Date(startOfToday);
    startOf30Days.setUTCDate(startOfToday.getUTCDate() - 29);

    // TOTAL VIEWS

    const total = await this.profileViewRepo.count({
      where: { profileId: profile.id },
    });

    // TODAY

    const today = await this.profileViewRepo
      .createQueryBuilder('view')
      .where('view.profile_id = :profileId', { profileId: profile.id })
      .andWhere('view.viewed_at >= :today', { today: startOfToday })
      .getCount();

    // WEEK

    const thisWeek = await this.profileViewRepo
      .createQueryBuilder('view')
      .where('view.profile_id = :profileId', { profileId: profile.id })
      .andWhere('view.viewed_at >= :week', { week: startOfWeek })
      .getCount();

    // UNIQUE VIEWERS

    const uniqueViewersRaw = (await this.profileViewRepo
      .createQueryBuilder('view')
      .select('COUNT(DISTINCT view.viewer_ip)', 'count')
      .where('view.profile_id = :profileId', { profileId: profile.id })
      .getRawOne()) as UniqueViewersRaw;

    const unique_viewers = Number(uniqueViewersRaw?.count ?? 0);

    // DAILY BREAKDOWN

    const rows = await this.profileViewRepo
      .createQueryBuilder('view')
      .select(`DATE(view.viewed_at)`, 'date')
      .addSelect('COUNT(*)', 'views')
      .where('view.profile_id = :profileId', { profileId: profile.id })
      .andWhere('view.viewed_at >= :startDate', {
        startDate: startOf30Days,
      })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<DailyRow>();

    const map = new Map<string, number>();

    for (const row of rows) {
      map.set(row.date, Number(row.views));
    }

    const daily_breakdown: { date: string; views: number }[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - i);

      const key = d.toISOString().split('T')[0];

      daily_breakdown.push({
        date: key,
        views: map.get(key) || 0,
      });
    }

    const result: AnalyticsStatsDto = {
      total,
      today,
      this_week: thisWeek,
      unique_viewers,
      daily_breakdown,
    };

    // CACHE WRITE (SAFE)

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 60);
    } catch (err) {
      console.error('Redis cache write failed:', err);
    }

    return result;
  }
}
