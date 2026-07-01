import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Event, EventType } from './entities/event.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Repository, IsNull } from 'typeorm';
import { CtaType } from '../profile/dto/profile-content.dto';

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
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
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

    // Links section
    const linkUrls = links?.items?.map((item) => item.url) ?? [];

    // Project repo and live URLs
    const projectUrls = (projects?.items ?? []).flatMap((item) => {
      const urls: string[] = [item.repoUrl];
      if (item.liveUrl) urls.push(item.liveUrl);
      return urls;
    });

    // CTA — only valid if type is LINK
    const ctaUrls: string[] =
      cta?.type === CtaType.LINK && cta?.value ? [cta.value] : [];

    const allValidUrls = [...linkUrls, ...projectUrls, ...ctaUrls];

    return allValidUrls.includes(linkUrl);
  }
}
