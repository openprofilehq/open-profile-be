import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Event, EventType } from './entities/event.entity';
import { FailedEvent } from './entities/failed-event.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Repository, IsNull, QueryFailedError } from 'typeorm';
import { CtaType, ProfileContentDto } from '../profile/dto/profile-content.dto';
import { RedisService } from '../../common/redis/redis.service';
import { writeEventWithRetry } from './utils/event-retry.util';

interface RecordEventParams {
  eventType: EventType;
  profileId?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly LINK_CACHE_TTL = 300; // 5 minutes

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(FailedEvent)
    private readonly failedEventRepository: Repository<FailedEvent>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly redisService: RedisService,
  ) {}

  async recordEvent(params: RecordEventParams): Promise<void> {
    const payload = {
      eventType: params.eventType,
      profileId: params.profileId ?? null,
      actorId: params.actorId ?? null,
      metadata: params.metadata ?? null,
    };

    await writeEventWithRetry(
      () => this.eventRepository.save(this.eventRepository.create(payload)),
      async (err, attempts) => {
        const errorCode =
          err instanceof QueryFailedError
            ? (err as unknown as { driverError?: { code?: string } })
                .driverError?.code
            : undefined;

        const failedEvent = this.failedEventRepository.create({
          payload,
          errorMessage: (err as Error)?.message ?? 'unknown error',
          errorCode: errorCode ?? null,
          attemptCount: attempts,
        });
        await this.failedEventRepository.save(failedEvent);
      },
    );
  }

  private buildLinkSet(content: ProfileContentDto): Set<string> {
    const normalize = (u: string) => this.normalizeUrl(u);
    const { links, projects, cta } = content;

    const urls: string[] = [
      ...(links?.items?.map((item) => normalize(item.url)) ?? []),
      ...(projects?.items ?? []).flatMap((item) => {
        const u: string[] = [normalize(item.repoUrl)];
        if (item.liveUrl) u.push(normalize(item.liveUrl));
        return u;
      }),
      ...(cta?.type === CtaType.LINK && cta?.value
        ? [normalize(cta.value)]
        : []),
    ];

    return new Set(urls);
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.href.replace(/\/$/, '').toLowerCase();
    } catch {
      return url.toLowerCase().replace(/\/$/, '');
    }
  }

  async isValidProfileLink(
    profileId: string,
    linkUrl: string,
  ): Promise<boolean> {
    const cacheKey = `profile:links:${profileId}`;
    const lockKey = `profile:links:lock:${profileId}`;
    const normalizedInput = this.normalizeUrl(linkUrl);

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        const linkSet = new Set<string>(JSON.parse(cached));
        return linkSet.has(normalizedInput);
      }

      const lockAcquired = await this.redisService.set(lockKey, '1', 5, true);

      if (!lockAcquired) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          const retried = await this.redisService.get(cacheKey);
          if (retried) {
            const linkSet = new Set<string>(JSON.parse(retried));
            return linkSet.has(normalizedInput);
          }
        }
        const fallbackProfile = await this.profileRepository.findOne({
          where: { id: profileId, isPublished: true, deletedAt: IsNull() },
          select: ['content'],
        });
        return (
          !!fallbackProfile?.content &&
          this.buildLinkSet(fallbackProfile.content).has(normalizedInput)
        );
      }

      try {
        const profile = await this.profileRepository.findOne({
          where: { id: profileId, isPublished: true, deletedAt: IsNull() },
          select: ['content'],
        });

        if (!profile?.content) {
          await this.redisService.set(
            cacheKey,
            JSON.stringify([]),
            this.LINK_CACHE_TTL,
          );
          return false;
        }

        const linkSet = this.buildLinkSet(profile.content);
        await this.redisService.set(
          cacheKey,
          JSON.stringify([...linkSet]),
          this.LINK_CACHE_TTL,
        );
        return linkSet.has(normalizedInput);
      } finally {
        await this.redisService.del(lockKey);
      }
    } catch (err) {
      this.logger.warn(
        `[isValidProfileLink] Redis error, falling back to DB: ${err instanceof Error ? err.message : String(err)}`,
      );
      const fallbackProfile = await this.profileRepository.findOne({
        where: { id: profileId, isPublished: true, deletedAt: IsNull() },
        select: ['content'],
      });
      return (
        !!fallbackProfile?.content &&
        this.buildLinkSet(fallbackProfile.content).has(normalizedInput)
      );
    }
  }
}
