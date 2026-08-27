import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Event, EventType } from './entities/event.entity';
import { FailedEvent } from './entities/failed-event.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Repository, IsNull, QueryFailedError } from 'typeorm';
import { CtaType, ProfileContentDto } from '../profile/dto/profile-content.dto';
import { RedisService } from '../../common/redis/redis.service';
import { writeEventWithRetry } from './utils/event-retry.util';
import { NotificationService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { normalizeUrl } from './utils/normalize-url.util';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENT_NAMES } from '../../common/events/event-names.constant';

interface RecordEventParams {
  eventType: EventType;
  profileId?: string;
  actorId?: string;
  anonymousId?: string;
  metadata?: Record<string, unknown>;
  dedupKey?: string;
  dedupTtlSeconds?: number;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly LINK_CACHE_TTL = 300; // 5 minutes
  private readonly DEFAULT_DEDUP_TTL_SECONDS = 300; // 5 minutes

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(FailedEvent)
    private readonly failedEventRepository: Repository<FailedEvent>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly redisService: RedisService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  async recordEvent(params: RecordEventParams): Promise<void> {
    if (params.dedupKey) {
      const isDuplicate = await this.isDuplicateEvent(
        params.dedupKey,
        params.dedupTtlSeconds ?? this.DEFAULT_DEDUP_TTL_SECONDS,
      );
      if (isDuplicate) return;
    }

    const payload = {
      eventType: params.eventType,
      profileId: params.profileId ?? null,
      actorId: params.actorId ?? null,
      anonymousId: params.anonymousId ?? null,
      metadata: params.metadata ?? null,
    };

    const written = await writeEventWithRetry(
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

    if (
      written &&
      params.eventType === EventType.PROFILE_VIEWED &&
      params.profileId
    ) {
      await this.checkProfileViewMilestone(params.profileId);
    }
  }

  private async checkProfileViewMilestone(profileId: string): Promise<void> {
    try {
      const result: { view_count: number; user_id: string }[] =
        await this.profileRepository.query(
          `UPDATE profiles SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count, user_id`,
          [profileId],
        );

      const profile = result[0];
      if (!profile) return;

      const viewCount = profile.view_count;
      const userId = profile.user_id;

      const milestones = this.configService.get<number[]>(
        'app.profileViewMilestones',
      );

      if (milestones?.includes(viewCount)) {
        await this.notificationService.dispatch({
          userId,
          type: NotificationType.PROFILE_VIEW_MILESTONE,
          title: 'Milestone reached!',
          body: `Your profile has been viewed ${viewCount} times.`,
          metadata: { viewCount },
          dedupeKey: `MILESTONE_${profileId}_${viewCount}`,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to check profile view milestone for ${profileId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async isDuplicateEvent(
    dedupKey: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const isNew = await this.redisService.set(
        dedupKey,
        '1',
        ttlSeconds,
        true,
      );
      return !isNew;
    } catch (err) {
      this.logger.warn(
        `[isDuplicateEvent] Redis error, treating as not-duplicate: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  async mergeAnonymousEvents(
    anonymousId: string,
    actorId: string,
  ): Promise<void> {
    await this.eventRepository.update(
      { anonymousId, actorId: IsNull() },
      { actorId },
    );
  }

  @OnEvent(EVENT_NAMES.AUTH.IDENTITY_MERGED)
  async handleIdentityMerged(payload: {
    anonymousId: string;
    userId: string;
  }): Promise<void> {
    try {
      await this.mergeAnonymousEvents(payload.anonymousId, payload.userId);
    } catch (err) {
      this.logger.warn(
        `Failed to merge anonymous events for userId=${payload.userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @OnEvent(EVENT_NAMES.INVITE.SENT)
  async handleInviteSent(payload: {
    inviterUserId: string;
    inviteId: string;
  }): Promise<void> {
    try {
      await this.recordEvent({
        eventType: EventType.INVITE_SENT,
        actorId: payload.inviterUserId,
        metadata: { inviteId: payload.inviteId },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record INVITE_SENT for inviteId=${payload.inviteId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @OnEvent(EVENT_NAMES.INVITE.CLAIMED)
  async handleInviteClaimed(payload: {
    inviteId: string;
    inviterUserId: string;
    claimantUserId: string;
  }): Promise<void> {
    try {
      await this.recordEvent({
        eventType: EventType.INVITE_CLAIMED,
        actorId: payload.claimantUserId,
        metadata: {
          inviteId: payload.inviteId,
          inviterUserId: payload.inviterUserId,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record INVITE_CLAIMED for inviteId=${payload.inviteId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
    return normalizeUrl(url);
  }

  async validateProfileLink(
    username: string,
    linkUrl: string,
  ): Promise<{ valid: boolean; profileId: string | null }> {
    const normalizedUsername = username.toLowerCase();
    const cacheKey = `profile:links:${normalizedUsername}`;
    const lockKey = `profile:links:lock:${normalizedUsername}`;
    const normalizedInput = this.normalizeUrl(linkUrl);

    const resolveFromDb = () =>
      this.profileRepository.findOne({
        where: {
          username: normalizedUsername,
          isPublished: true,
          deletedAt: IsNull(),
        },
        select: ['id', 'content'],
      });

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          profileId: string | null;
          links: string[];
        };
        return {
          valid: parsed.links.includes(normalizedInput),
          profileId: parsed.profileId,
        };
      }

      const lockAcquired = await this.redisService.set(lockKey, '1', 5, true);

      if (!lockAcquired) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          const retried = await this.redisService.get(cacheKey);
          if (retried) {
            const parsed = JSON.parse(retried) as {
              profileId: string | null;
              links: string[];
            };
            return {
              valid: parsed.links.includes(normalizedInput),
              profileId: parsed.profileId,
            };
          }
        }
        const profile = await resolveFromDb();
        return {
          valid:
            !!profile?.content &&
            this.buildLinkSet(profile.content).has(normalizedInput),
          profileId: profile?.id ?? null,
        };
      }

      try {
        const profile = await resolveFromDb();

        if (!profile?.content) {
          await this.redisService.set(
            cacheKey,
            JSON.stringify({ profileId: profile?.id ?? null, links: [] }),
            this.LINK_CACHE_TTL,
          );
          return { valid: false, profileId: profile?.id ?? null };
        }

        const linkSet = this.buildLinkSet(profile.content);
        await this.redisService.set(
          cacheKey,
          JSON.stringify({ profileId: profile.id, links: [...linkSet] }),
          this.LINK_CACHE_TTL,
        );
        return { valid: linkSet.has(normalizedInput), profileId: profile.id };
      } finally {
        await this.redisService.del(lockKey);
      }
    } catch (err) {
      this.logger.warn(
        `[validateProfileLink] Redis error, falling back to DB: ${err instanceof Error ? err.message : String(err)}`,
      );
      const profile = await resolveFromDb();
      return {
        valid:
          !!profile?.content &&
          this.buildLinkSet(profile.content).has(normalizedInput),
        profileId: profile?.id ?? null,
      };
    }
  }
}
