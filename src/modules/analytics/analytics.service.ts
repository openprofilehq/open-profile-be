import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Request } from 'express';
import { ProfileView } from './entities/profile-view.entity';
import { Profile } from '../profile/entities/profile.entity';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(ProfileView)
    private readonly profileViewRepo: Repository<ProfileView>,

    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
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
}
