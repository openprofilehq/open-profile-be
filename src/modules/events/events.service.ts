import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Event, EventType } from './entities/event.entity';
import { FailedEvent } from './entities/failed-event.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Repository, IsNull, QueryFailedError } from 'typeorm';
import { CtaType } from '../profile/dto/profile-content.dto';
import { writeEventWithRetry } from './utils/event-retry.util';

interface RecordEventParams {
  eventType: EventType;
  profileId?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(FailedEvent)
    private readonly failedEventRepository: Repository<FailedEvent>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
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
    const profile = await this.profileRepository.findOne({
      where: { id: profileId, isPublished: true, deletedAt: IsNull() },
      select: ['content'],
    });

    if (!profile?.content) return false;

    const { links, projects, cta } = profile.content;
    const normalize = (u: string) => this.normalizeUrl(u);
    const normalizedInput = normalize(linkUrl);

    const linkUrls = links?.items?.map((item) => normalize(item.url)) ?? [];

    const projectUrls = (projects?.items ?? []).flatMap((item) => {
      const urls: string[] = [normalize(item.repoUrl)];
      if (item.liveUrl) urls.push(normalize(item.liveUrl));
      return urls;
    });

    const ctaUrls: string[] =
      cta?.type === CtaType.LINK && cta?.value ? [normalize(cta.value)] : [];

    const allValidUrls = [...linkUrls, ...projectUrls, ...ctaUrls];

    return allValidUrls.includes(normalizedInput);
  }
}
