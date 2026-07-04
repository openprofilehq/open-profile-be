import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Event, EventType } from './entities/event.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Repository, IsNull } from 'typeorm';
import { CtaType, ProfileContentDto } from '../profile/dto/profile-content.dto';
import { RedisService } from '../../common/redis/redis.service';

interface RecordEventParams {
  eventType: EventType;
  profileId?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  private readonly LINK_CACHE_TTL = 300; // 5 minutes in seconds
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly redisService: RedisService,
  ) {}

  async recordEvent(params: RecordEventParams): Promise<void> {
    const event = this.eventRepository.create({
      eventType: params.eventType,
      profileId: params.profileId ?? null,
      actorId: params.actorId ?? null,
      metadata: params.metadata ?? null,
    });

    await this.eventRepository.save(event);
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

    return new Set(urls); // O(1) lookup
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

    // 1. Try cache first
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      const linkSet = new Set<string>(JSON.parse(cached));
      return linkSet.has(normalizedInput); // O(1)
    }

    // 2. Single-flight lock — prevent duplicate DB queries on concurrent cache misses
    const lockAcquired = await this.redisService.set(lockKey, '1', 5, true);

    if (!lockAcquired) {
      // Another request is already fetching — poll briefly then retry cache
      await new Promise((resolve) => setTimeout(resolve, 50));
      const retried = await this.redisService.get(cacheKey);
      if (retried) {
        const linkSet = new Set<string>(JSON.parse(retried));
        return linkSet.has(normalizedInput);
      }
      return false; // lock expired before cache was populated — safe to drop
    }

    try {
      // 3. Cache miss — fetch from DB
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
      return linkSet.has(normalizedInput); // O(1)
    } finally {
      await this.redisService.del(lockKey);
    }
  }
}
