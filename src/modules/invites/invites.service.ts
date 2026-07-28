import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { randomUUID } from 'crypto';
import { Invite } from './entities/invite.entity';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateInviteResponseDto } from './dto/create-invite-response.dto';
import { UsersService } from '../users/users.service';
import { EventsService } from '../events/events.service';
import { EventType } from '../events/entities/event.entity';
import { QueueService } from '../queue/queue.service';
import { NotificationService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  QUEUE_NAMES,
  QUEUE_JOB_NAMES,
} from '../queue/config/queue-names.constant';
import { env } from '../../config/env';
import { InviteLookupResponseDto } from './dto/invite-lookup-response.dto';

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    @InjectRepository(Invite)
    private readonly inviteRepository: Repository<Invite>,
    private readonly usersService: UsersService,
    private readonly eventsService: EventsService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  async createInvite(
    inviterUserId: string,
    dto: CreateInviteDto,
  ): Promise<CreateInviteResponseDto> {
    const rateLimitKey = `invite:${inviterUserId}`;
    const allowed = await this.rateLimiterService.isAllowed(
      rateLimitKey,
      10,
      3600,
    );
    if (!allowed) {
      throw new HttpException(
        {
          error: 'INVITE_RATE_LIMIT_EXCEEDED',
          message:
            'You have sent too many invites. Please wait before sending more.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const existingUser = await this.usersService.findByEmail(
      dto.recipientEmail,
    );
    if (existingUser) {
      throw new ConflictException({
        message: 'An account with this email already exists.',
        redirectTo: '/login',
      });
    }

    const existingInvite = await this.inviteRepository.findOne({
      where: {
        recipientEmail: dto.recipientEmail,
        inviterUserId,
        claimedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (existingInvite && existingInvite.expiresAt > new Date()) {
      throw new ConflictException({
        message: 'You already have a pending invite to this email address.',
        expiresAt: existingInvite.expiresAt,
      });
    }
    if (existingInvite) {
      await this.inviteRepository.delete(existingInvite.id);
    }

    const expiryDays =
      this.configService.get<number>('app.inviteExpiryDays') ?? 7;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    const token = randomUUID();

    const invite = this.inviteRepository.create({
      inviterUserId,
      recipientEmail: dto.recipientEmail,
      token,
      expiresAt,
    });

    let saved: Invite;
    try {
      saved = await this.inviteRepository.save(invite);
    } catch (err: unknown) {
      const isUniqueViolation =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === '23505';

      if (isUniqueViolation) {
        throw new ConflictException({
          message: 'You already have a pending invite to this email address.',
        });
      }
      throw err;
    }

    const signupUrl = `${env.FRONTEND_URL}/auth/register?email=${encodeURIComponent(dto.recipientEmail)}&invite=${token}`;

    try {
      await this.queueService.addJob(
        QUEUE_NAMES.EMAIL,
        QUEUE_JOB_NAMES.EMAIL.SEND_INVITE_EMAIL,
        { to: dto.recipientEmail, signupUrl },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
    } catch {
      await this.inviteRepository.delete(saved.id);
      throw new InternalServerErrorException(
        'Failed to send invite email. Please try again.',
      );
    }

    void this.eventsService
      .recordEvent({
        eventType: EventType.INVITE_SENT,
        actorId: inviterUserId,
        metadata: { inviteId: saved.id },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Failed to record INVITE_SENT for inviteId=${saved.id}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return {
      id: saved.id,
      recipientEmail: saved.recipientEmail,
      expiresAt: saved.expiresAt,
    };
  }

  async claimInvite(token: string, claimantUserId: string): Promise<void> {
    const result: { id: string; inviterUserId: string }[] =
      await this.inviteRepository.query(
        `UPDATE invites SET "claimedAt" = now(), "claimedByUserId" = $1
      WHERE token = $2 AND "claimedAt" IS NULL AND "expiresAt" > now()
       AND "inviterUserId" <> $1
       RETURNING id, "inviterUserId"`,
        [claimantUserId, token],
      );

    if (result.length === 0) {
      throw new BadRequestException(
        'This invite is invalid, expired, or already claimed.',
      );
    }

    const { id: inviteId, inviterUserId } = result[0];

    void this.eventsService
      .recordEvent({
        eventType: EventType.INVITE_CLAIMED,
        actorId: claimantUserId,
        metadata: { inviteId, inviterUserId },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Failed to record INVITE_CLAIMED for inviteId=${inviteId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    void this.notificationService
      .dispatch({
        userId: inviterUserId,
        type: NotificationType.INVITE_CLAIMED,
        title: 'Your invite was accepted!',
        body: 'Someone you invited just joined Open Profile.',
        dedupeKey: `INVITE_CLAIMED_${inviteId}`,
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Failed to notify inviter=${inviterUserId} for inviteId=${inviteId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  async recordInviteClick(token: string): Promise<InviteLookupResponseDto> {
    const invite = await this.inviteRepository.findOne({ where: { token } });

    if (!invite) {
      throw new BadRequestException('This invite link is invalid.');
    }

    if (invite.claimedAt) {
      throw new BadRequestException(
        'This invite has already been used. Please log in instead.',
      );
    }

    if (invite.expiresAt < new Date()) {
      throw new BadRequestException({
        message: 'This invite has expired. Please ask for a new one.',
        fallbackSignupUrl: `${env.FRONTEND_URL}/auth/register`,
      });
    }

    if (!invite.clickedAt) {
      await this.inviteRepository.update(invite.id, { clickedAt: new Date() });
    }

    return {
      recipientEmail: invite.recipientEmail,
      expiresAt: invite.expiresAt,
    };
  }
}
