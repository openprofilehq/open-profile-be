import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { env } from '../../config/env';
import {
  QUEUE_JOB_NAMES,
  QUEUE_NAMES,
} from '../queue/config/queue-names.constant';
import { QueueService } from '../queue/queue.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { Invite } from './entities/invite.entity';
import { InvitesService } from './invites.service';
import { Job } from 'bullmq';

jest.mock('../../config/env', () => ({
  env: {
    FRONTEND_URL: 'https://app.example.test',
  },
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'generated-invite-token'),
}));

jest.mock('uuid', () => ({
  v7: jest.fn(() => 'mocked-uuid'),
}));

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('InvitesService', () => {
  let service: InvitesService;
  let inviteRepository: jest.Mocked<
    Pick<
      Repository<Invite>,
      'findOne' | 'create' | 'save' | 'delete' | 'update' | 'query'
    >
  >;
  let usersService: jest.Mocked<Pick<UsersService, 'findByEmail'>>;
  let eventEmitter: jest.Mocked<Pick<EventEmitter2, 'emit'>>;
  let queueService: jest.Mocked<Pick<QueueService, 'addJob'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let rateLimiterService: jest.Mocked<Pick<RateLimiterService, 'isAllowed'>>;

  const inviterUserId = 'inviter-user-id';
  const claimantUserId = 'claimant-user-id';
  const recipientEmail = 'friend+invite@example.com';
  const generatedInviteToken = 'generated-invite-token';
  const generatedInviteTokenHash = sha256(generatedInviteToken);
  const rawClickToken = 'raw-click-token';
  const rawClickTokenHash = sha256(rawClickToken);
  const rawClaimToken = 'invite-token';
  const rawClaimTokenHash = sha256(rawClaimToken);
  const now = new Date('2026-07-21T15:30:00.000Z');
  const savedInvite = {
    id: 'invite-id',
    inviterUserId,
    recipientEmail,
    token: generatedInviteTokenHash,
    expiresAt: new Date('2026-07-28T15:30:00.000Z'),
    clickedAt: null,
    claimedAt: null,
    claimedByUserId: null,
    createdAt: now,
  } as Invite;

  beforeEach(async () => {
    inviteRepository = {
      findOne: jest.fn(),
      create: jest.fn((invite) => invite as Invite),
      save: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      query: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        Repository<Invite>,
        'findOne' | 'create' | 'save' | 'delete' | 'update' | 'query'
      >
    >;
    usersService = {
      findByEmail: jest.fn(),
    };
    eventEmitter = {
      emit: jest.fn().mockReturnValue(true),
    };
    queueService = {
      addJob: jest.fn(),
    };
    configService = {
      get: jest.fn(),
    };
    rateLimiterService = {
      isAllowed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        { provide: getRepositoryToken(Invite), useValue: inviteRepository },
        { provide: UsersService, useValue: usersService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: QueueService, useValue: queueService },
        { provide: ConfigService, useValue: configService },
        { provide: RateLimiterService, useValue: rateLimiterService },
      ],
    }).compile();

    service = module.get(InvitesService);
    jest.useFakeTimers().setSystemTime(now);
    rateLimiterService.isAllowed.mockResolvedValue(true);
    usersService.findByEmail.mockResolvedValue(null);
    inviteRepository.findOne.mockResolvedValue(null);
    inviteRepository.save.mockResolvedValue(savedInvite);
    queueService.addJob.mockResolvedValue({} as Job);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('createInvite', () => {
    const dto = { recipientEmail };

    it('throws 429/INVITE_RATE_LIMIT_EXCEEDED and does not call downstream dependencies when rate limited', async () => {
      rateLimiterService.isAllowed.mockResolvedValue(false);

      const error = await service
        .createInvite(inviterUserId, dto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(rateLimiterService.isAllowed).toHaveBeenCalledWith(
        `invite:${inviterUserId}`,
        10,
        3600,
      );
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toMatchObject({
        error: 'INVITE_RATE_LIMIT_EXCEEDED',
      });
      expect(usersService.findByEmail).not.toHaveBeenCalled();
      expect(inviteRepository.findOne).not.toHaveBeenCalled();
      expect(inviteRepository.create).not.toHaveBeenCalled();
      expect(queueService.addJob).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('throws account-exists ConflictException with login redirect without creating an invite', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'existing-user-id',
      } as User);

      const error = await service
        .createInvite(inviterUserId, dto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        message: 'An account with this email already exists.',
        redirectTo: '/login',
      });
      expect(inviteRepository.create).not.toHaveBeenCalled();
      expect(inviteRepository.save).not.toHaveBeenCalled();
    });

    it('throws pending-invite ConflictException for a prior unclaimed, unexpired invite', async () => {
      const existingInvite = {
        ...savedInvite,
        id: 'existing-invite-id',
        claimedAt: null,
        expiresAt: new Date('2026-07-22T15:30:00.000Z'),
      } as Invite;
      inviteRepository.findOne.mockResolvedValue(existingInvite);

      const error = await service
        .createInvite(inviterUserId, dto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        message: 'You already have a pending invite to this email address.',
        expiresAt: existingInvite.expiresAt,
      });
      expect(inviteRepository.create).not.toHaveBeenCalled();
      expect(inviteRepository.save).not.toHaveBeenCalled();
    });

    it('does not throw duplicate-invite conflict when the prior invite is claimed', async () => {
      inviteRepository.findOne.mockResolvedValue(null);

      await expect(service.createInvite(inviterUserId, dto)).resolves.toEqual({
        id: savedInvite.id,
        recipientEmail: savedInvite.recipientEmail,
        expiresAt: savedInvite.expiresAt,
      });

      expect(inviteRepository.create).toHaveBeenCalled();
      expect(inviteRepository.save).toHaveBeenCalled();
    });

    it('does not throw duplicate-invite conflict when the prior invite is expired', async () => {
      inviteRepository.findOne.mockResolvedValue({
        ...savedInvite,
        claimedAt: null,
        expiresAt: new Date('2026-07-20T15:30:00.000Z'),
      } as Invite);

      await expect(service.createInvite(inviterUserId, dto)).resolves.toEqual({
        id: savedInvite.id,
        recipientEmail: savedInvite.recipientEmail,
        expiresAt: savedInvite.expiresAt,
      });

      expect(inviteRepository.create).toHaveBeenCalled();
      expect(inviteRepository.save).toHaveBeenCalled();
    });

    it('creates, saves, emails, records an event, and returns the response using configured expiry days', async () => {
      configService.get.mockReturnValue(3);
      const expectedExpiresAt = new Date('2026-07-24T15:30:00.000Z');
      inviteRepository.save.mockResolvedValue({
        ...savedInvite,
        expiresAt: expectedExpiresAt,
      } as Invite);

      const result = await service.createInvite(inviterUserId, dto);

      expect(inviteRepository.create).toHaveBeenCalledWith({
        inviterUserId,
        recipientEmail,
        token: generatedInviteTokenHash,
        expiresAt: expectedExpiresAt,
      });
      expect(inviteRepository.save).toHaveBeenCalledWith({
        inviterUserId,
        recipientEmail,
        token: generatedInviteTokenHash,
        expiresAt: expectedExpiresAt,
      });
      expect(queueService.addJob).toHaveBeenCalledWith(
        QUEUE_NAMES.EMAIL,
        QUEUE_JOB_NAMES.EMAIL.SEND_INVITE_EMAIL,
        {
          to: recipientEmail,
          signupUrl: expect.stringContaining('/auth/register'),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
      const payload = queueService.addJob.mock.calls[0][2] as {
        signupUrl: string;
      };

      const signupUrl = payload.signupUrl;
      expect(signupUrl).toContain(
        `email=${encodeURIComponent(recipientEmail)}`,
      );
      expect(signupUrl).toContain(`invite=${generatedInviteToken}`);
      expect(eventEmitter.emit).toHaveBeenCalledWith('invite.sent', {
        inviterUserId,
        inviteId: savedInvite.id,
      });
      expect(result).toEqual({
        id: savedInvite.id,
        recipientEmail,
        expiresAt: expectedExpiresAt,
      });
    });

    it('uses the seven-day expiry fallback when inviteExpiryDays is undefined', async () => {
      configService.get.mockReturnValue(undefined);
      const expectedExpiresAt = new Date('2026-07-28T15:30:00.000Z');

      await service.createInvite(inviterUserId, dto);

      expect(inviteRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expectedExpiresAt,
        }),
      );
    });

    it('deletes the just-created invite and throws when queueing the invite email fails', async () => {
      queueService.addJob.mockRejectedValue(new Error('queue down'));

      await expect(service.createInvite(inviterUserId, dto)).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(inviteRepository.delete).toHaveBeenCalledWith(savedInvite.id);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('claimInvite', () => {
    it('atomically claims an invite and emits the claimed event', async () => {
      inviteRepository.query.mockResolvedValue([
        { id: 'invite-id', inviterUserId },
      ]);

      await service.claimInvite(rawClaimToken, claimantUserId, recipientEmail);

      expect(inviteRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE invites'),
        [claimantUserId, rawClaimTokenHash, recipientEmail],
      );
      expect(inviteRepository.query.mock.calls[0][0]).toContain(
        'WHERE token = $2 AND "claimedAt" IS NULL AND "expiresAt" > now()',
      );
      expect(inviteRepository.query.mock.calls[0][0]).toContain(
        'AND "recipientEmail" = $3',
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('invite.claimed', {
        inviteId: 'invite-id',
        inviterUserId,
        claimantUserId,
      });
    });

    it('throws when the invite is invalid, expired, or already claimed', async () => {
      inviteRepository.query.mockResolvedValue([]);

      await expect(
        service.claimInvite('missing-token', claimantUserId, recipientEmail),
      ).rejects.toThrow(
        new BadRequestException(
          'This invite is invalid, expired, or already claimed.',
        ),
      );

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it("throws when the verified email does not match the invite's recipientEmail", async () => {
      inviteRepository.query.mockResolvedValue([]);

      await expect(
        service.claimInvite(
          rawClaimToken,
          claimantUserId,
          'someone-else@example.com',
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'This invite is invalid, expired, or already claimed.',
        ),
      );

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('correctly unwraps a [rows, rowCount] tuple result shape', async () => {
      inviteRepository.query.mockResolvedValue([
        [{ id: 'invite-id', inviterUserId }],
        1,
      ]);

      await service.claimInvite(rawClaimToken, claimantUserId, recipientEmail);

      expect(eventEmitter.emit).toHaveBeenCalledWith('invite.claimed', {
        inviteId: 'invite-id',
        inviterUserId,
        claimantUserId,
      });
    });

    it('correctly unwraps a { rows: [...] } object result shape', async () => {
      inviteRepository.query.mockResolvedValue({
        rows: [{ id: 'invite-id', inviterUserId }],
      });

      await service.claimInvite(rawClaimToken, claimantUserId, recipientEmail);

      expect(eventEmitter.emit).toHaveBeenCalledWith('invite.claimed', {
        inviteId: 'invite-id',
        inviterUserId,
        claimantUserId,
      });
    });
  });

  describe('recordInviteClick', () => {
    it('throws when the invite link is invalid', async () => {
      inviteRepository.findOne.mockResolvedValue(null);
      const missingToken = 'missing-token';

      await expect(service.recordInviteClick(missingToken)).rejects.toThrow(
        new BadRequestException('This invite link is invalid.'),
      );
      expect(inviteRepository.findOne).toHaveBeenCalledWith({
        where: { token: sha256(missingToken) },
      });
    });

    it('throws when the invite has already been used', async () => {
      inviteRepository.findOne.mockResolvedValue({
        ...savedInvite,
        claimedAt: new Date('2026-07-21T15:00:00.000Z'),
      } as Invite);

      await expect(service.recordInviteClick(rawClickToken)).rejects.toThrow(
        new BadRequestException(
          'This invite has already been used. Please log in instead.',
        ),
      );
      expect(inviteRepository.findOne).toHaveBeenCalledWith({
        where: { token: rawClickTokenHash },
      });
    });

    it('throws with a fallback signup URL when the invite is expired', async () => {
      inviteRepository.findOne.mockResolvedValue({
        ...savedInvite,
        expiresAt: new Date('2026-07-20T15:30:00.000Z'),
      } as Invite);

      const error = await service
        .recordInviteClick(rawClickToken)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        message: 'This invite has expired. Please ask for a new one.',
        fallbackSignupUrl: `${env.FRONTEND_URL}/auth/register`,
      });
      expect((error as BadRequestException).getResponse()).not.toEqual(
        expect.objectContaining({
          fallbackSignupUrl: expect.stringContaining('?'),
        }),
      );
      expect(inviteRepository.findOne).toHaveBeenCalledWith({
        where: { token: rawClickTokenHash },
      });
    });

    it('records clickedAt on the first valid click and returns lookup data', async () => {
      inviteRepository.findOne.mockResolvedValue({
        ...savedInvite,
        clickedAt: null,
      } as Invite);

      const result = await service.recordInviteClick(rawClickToken);

      expect(inviteRepository.findOne).toHaveBeenCalledWith({
        where: { token: rawClickTokenHash },
      });
      expect(inviteRepository.update).toHaveBeenCalledWith(savedInvite.id, {
        clickedAt: now,
      });
      expect(result).toEqual({
        recipientEmail: savedInvite.recipientEmail,
        expiresAt: savedInvite.expiresAt,
      });
    });

    it('does not update clickedAt again on repeat valid clicks', async () => {
      inviteRepository.findOne.mockResolvedValue({
        ...savedInvite,
        clickedAt: new Date('2026-07-21T15:00:00.000Z'),
      } as Invite);

      const result = await service.recordInviteClick(rawClickToken);

      expect(inviteRepository.findOne).toHaveBeenCalledWith({
        where: { token: rawClickTokenHash },
      });
      expect(inviteRepository.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        recipientEmail: savedInvite.recipientEmail,
        expiresAt: savedInvite.expiresAt,
      });
    });
  });
});
