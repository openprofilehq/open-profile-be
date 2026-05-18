import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { hash as argon2Hash } from 'argon2';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ProfileView } from './entities/profile-view.entity';
import { Profile } from '../profile/entities/profile.entity';
import { ProfileEvent } from './entities/profile-event.entity';
import { LinkClick } from './entities/link-click.entity';
import { MetricSnapshot } from './entities/metric-snapshot.entity';
import { AnalyticsStatsDto } from './dto/analytics-stats.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { RedisService } from '../../common/redis/redis.service';
import { FingerprintService } from '../../common/fingerprint/fingerprint.service';
import {
  ANALYTICS_QUEUE,
  ProfileEventJobPayload,
} from './dto/profile-event-job.dto';
import { InsightsPeriod } from './dto/insights-query.dto';
import { EventType, SnapshotBucket } from '../../common/types/analytics.types';

interface AuthRequest extends Request {
  user?: { id: string };
}

type UniqueViewersRaw = { count: string };
type DailyRow = { date: string; views: string };

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(ProfileView)
    private readonly profileViewRepo: Repository<ProfileView>,

    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,

    @InjectRepository(ProfileEvent)
    private readonly profileEventRepo: Repository<ProfileEvent>,

    @InjectRepository(LinkClick)
    private readonly linkClickRepo: Repository<LinkClick>,

    @InjectRepository(MetricSnapshot)
    private readonly metricSnapshotRepo: Repository<MetricSnapshot>,

    private readonly redis: RedisService,
    private readonly fingerprint: FingerprintService,

    @InjectQueue(ANALYTICS_QUEUE)
    private readonly analyticsQueue: Queue,
  ) {}

  private extractIp(req: Request): string {
    return req.ip ?? '0.0.0.0';
  }

  private async hashSensitive(value: string): Promise<string> {
    const salt = Buffer.from('open-profile-log-salt-2024', 'utf8');
    return argon2Hash(value, { salt, type: 2 });
  }

  //  NEW METHODS

  async enqueueEvent(dto: CreateEventDto, req: AuthRequest): Promise<void> {
    const profile = await this.profileRepo.findOne({
      where: { id: dto.profileId },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const visitorFp = this.fingerprint.generate(req as Request);

    // Write thin event row immediately
    const event = this.profileEventRepo.create({
      profileId: dto.profileId,
      eventType: dto.eventType,
      visitorFp,
      viewerId: req.user?.id ?? null,
      metadata: dto.metadata ?? {},
    });
    const saved = await this.profileEventRepo.save(event);

    // Enqueue heavy work
    const payload: ProfileEventJobPayload = {
      eventId: saved.id,
      profileId: dto.profileId,
      eventType: dto.eventType,
      visitorFp,
      viewerId: req.user?.id ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      referrer: (req.headers['referer'] as string) ?? null,
      occurredAt: saved.occurredAt.toISOString(),
    };

    await this.analyticsQueue.add(dto.eventType, payload);

    this.logger.log({
      event: 'analytics_event_enqueued',
      eventId: saved.id,
      eventType: dto.eventType,
    });
  }

  async resolveAndLogLinkClick(
    linkId: string,
    req: Request,
  ): Promise<{ url: string }> {
    const link = await this.linkClickRepo.findOne({
      where: { id: linkId },
    });
    if (!link) throw new NotFoundException('Link not found');

    // Enqueue the click event
    await this.analyticsQueue.add(EventType.LINK_CLICK, {
      eventId: linkId,
      profileId: link.profileId,
      eventType: EventType.LINK_CLICK,
      visitorFp: this.fingerprint.generate(req),
      viewerId: null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      referrer: (req.headers['referer'] as string) ?? null,
      occurredAt: new Date().toISOString(),
    } satisfies ProfileEventJobPayload);

    // Return the target URL from metadata
    const url = '/';
    return { url };
  }

  async getInsights(
    userId: string,
    period: InsightsPeriod = InsightsPeriod.DAY,
  ) {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) throw new ForbiddenException('Profile not found');

    const cacheKey = `analytics:insights:${profile.id}:${period}`;
    const cached: string | null = null;
    if (cached) {
      try {
        return JSON.parse(cached) as {
          period: InsightsPeriod;
          profileId: string;
          snapshots: unknown[];
        };
      } catch {
        /* ignore */
      }
    }

    const snapshots = await this.metricSnapshotRepo.find({
      where: {
        profileId: profile.id,
        bucket: period as unknown as SnapshotBucket,
      },
      order: { periodStart: 'DESC' },
      take: 30,
    });

    const result = {
      period,
      profileId: profile.id,
      snapshots: snapshots.map((s) => ({
        periodStart: s.periodStart,
        views: s.views,
        uniqueReach: s.uniqueReach,
        linkClicks: s.linkClicks,
        searchImpressions: s.searchImpressions,
        computedAt: s.computedAt,
      })),
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 300);
    } catch {
      /* ignore */
    }

    return result;
  }

  //  EXISTING METHODS
  async recordView(profileId: string, req: Request): Promise<void> {
    const viewerIp = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const profile = await this.profileRepo.findOne({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const dedupKey = `view:${profileId}:${viewerIp}`;
    const isDuplicate = !(await this.redis.set(dedupKey, '1', 5 * 60, true));

    if (isDuplicate) {
      this.logger.log({
        event: 'profile_view_deduplicated',
        profileId,
        viewerIp: await this.hashSensitive(viewerIp),
      });
      return;
    }

    const dbDedupKey = `${profileId}:${viewerIp}:${Math.floor(Date.now() / (5 * 60 * 1000))}`;
    const result = await this.profileViewRepo
      .createQueryBuilder()
      .insert()
      .into(ProfileView)
      .values({
        profileId,
        viewerIp,
        userAgent: userAgent || undefined,
        dedupKey: dbDedupKey,
      })
      .orIgnore()
      .execute();

    if (result.identifiers.length === 0) {
      this.logger.log({
        event: 'profile_view_deduplicated',
        profileId,
        viewerIp: await this.hashSensitive(viewerIp),
      });
      return;
    }

    this.logger.log({
      event: 'profile_view_recorded',
      profileId,
      viewerIp: await this.hashSensitive(viewerIp),
      userAgent: userAgent
        ? await this.hashSensitive(userAgent)
        : 'not_provided',
    });
  }

  async getStats(userId: string): Promise<AnalyticsStatsDto> {
    const profile = await this.profileRepo.findOne({ where: { userId } });

    if (!profile) {
      throw new ForbiddenException('Profile not found');
    }

    const cacheKey = `analytics:stats:${profile.id}`;
    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch {
      /* ignore */
    }

    if (cached) {
      try {
        return JSON.parse(cached) as AnalyticsStatsDto;
      } catch {
        /* ignore */
      }
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setUTCDate(startOfToday.getUTCDate() - 6);

    const startOf30Days = new Date(startOfToday);
    startOf30Days.setUTCDate(startOfToday.getUTCDate() - 29);

    const total = await this.profileViewRepo.count({
      where: { profileId: profile.id },
    });

    const today = await this.profileViewRepo
      .createQueryBuilder('view')
      .where('view.profile_id = :profileId', { profileId: profile.id })
      .andWhere('view.viewed_at >= :today', { today: startOfToday })
      .getCount();

    const thisWeek = await this.profileViewRepo
      .createQueryBuilder('view')
      .where('view.profile_id = :profileId', { profileId: profile.id })
      .andWhere('view.viewed_at >= :week', { week: startOfWeek })
      .getCount();

    const uniqueViewersRaw = (await this.profileViewRepo
      .createQueryBuilder('view')
      .select('COUNT(DISTINCT view.viewer_ip)', 'count')
      .where('view.profile_id = :profileId', { profileId: profile.id })
      .getRawOne()) as UniqueViewersRaw;

    const unique_viewers = Number(uniqueViewersRaw?.count ?? 0);

    const rows = await this.profileViewRepo
      .createQueryBuilder('view')
      .select(`DATE(view.viewed_at)`, 'date')
      .addSelect('COUNT(*)', 'views')
      .where('view.profile_id = :profileId', { profileId: profile.id })
      .andWhere('view.viewed_at >= :startDate', { startDate: startOf30Days })
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
      daily_breakdown.push({ date: key, views: map.get(key) || 0 });
    }

    const result: AnalyticsStatsDto = {
      total,
      today,
      this_week: thisWeek,
      unique_viewers,
      daily_breakdown,
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 60);
    } catch (err) {
      console.error('Redis cache write failed:', err);
    }

    return result;
  }
}
