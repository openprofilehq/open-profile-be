jest.mock('uuid', () => ({
  v7: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000000'),
}));

jest.mock('../../config/env', () => ({
  env: {},
}));

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mocked-argon2-hash'),
  verify: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UsersService } from '../users/users.service';
import { QueueService } from '../queue/queue.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../../common/redis/redis.service';
import { TokenService } from './services/token.service';
import { EventsService } from '../events/events.service';
import { InvitesService } from '../invites/invites.service';
import { ANONYMOUS_ID_COOKIE } from '../../common/cookies/anonymous-id.util';
import {
  QUEUE_NAMES,
  QUEUE_JOB_NAMES,
} from '../queue/config/queue-names.constant';
import { AuthProvider, User, UserRole } from '../users/entities/user.entity';

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  fullName: 'Test User',
  isVerified: false,
} as User;

const mockRegisterDto = {
  email: 'test@example.com',
  password: 'StrongPass1!',
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Record<string, jest.Mock>;
  let queueService: Record<string, jest.Mock>;
  let tokenService: Record<string, jest.Mock>;
  let jwtService: Record<string, jest.Mock>;
  let redisService: Record<string, jest.Mock>;
  let eventsService: Record<string, jest.Mock>;
  let invitesService: Record<string, jest.Mock>;

  beforeEach(async () => {
    const mockUsersService = {
      createEmailUser: jest.fn(),
      storeOtpHash: jest.fn(),
      findByEmail: jest.fn(),
      clearOtp: jest.fn(),
      clearOtpOnly: jest.fn(),
      findOne: jest.fn(),
      updatePassword: jest.fn(),
      updateLastLoginIp: jest.fn(),
    };

    const mockQueueService = {
      addJob: jest.fn(),
    };

    const mockTokenService = {
      invalidateAllRefreshTokens: jest.fn(),
      generateAccessToken: jest.fn(),
      generateRefreshToken: jest.fn(),
      setTokenCookies: jest.fn(),
    };

    const mockJwtService = {
      verifyAsync: jest.fn(),
    };

    const mockRedisService = {
      increment: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockEventsService = {
      mergeAnonymousEvents: jest.fn().mockResolvedValue(undefined),
    };

    const mockInvitesService = {
      claimInvite: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: RateLimiterService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: RedisService, useValue: mockRedisService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: EventsService, useValue: mockEventsService },
        { provide: InvitesService, useValue: mockInvitesService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    queueService = module.get(QueueService);
    tokenService = module.get(TokenService);
    jwtService = module.get(JwtService);
    redisService = module.get(RedisService);
    eventsService = module.get(EventsService);
    invitesService = module.get(InvitesService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    const loginDto = { email: 'test@example.com', password: 'StrongPass1!' };
    const ip = '203.0.113.5';

    const verifiedUser = {
      ...mockUser,
      password: 'stored-hash',
      authProvider: AuthProvider.EMAIL,
      isVerified: true,
      role: UserRole.USER,
      onboardingComplete: true,
      lastLoginIp: ip, // matches `ip` so the "new IP" email branch is skipped
    } as User;

    function buildReqRes(cookies: Record<string, string> = {}) {
      const req = { cookies } as unknown as Request;
      const res = {} as unknown as Response;
      return { req, res };
    }

    beforeEach(() => {
      redisService.increment.mockResolvedValue(1); // under IP rate limit
      redisService.get.mockResolvedValue(null); // account not locked
      redisService.del.mockResolvedValue(undefined);
      usersService.findByEmail.mockResolvedValue(verifiedUser);
      usersService.updateLastLoginIp.mockResolvedValue(undefined);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      tokenService.generateAccessToken.mockResolvedValue('access-token');
      tokenService.generateRefreshToken.mockResolvedValue('refresh-token');
      tokenService.setTokenCookies.mockReturnValue(undefined);
    });

    it('merges anonymous events when an anonymous_id cookie is present', async () => {
      const { req, res } = buildReqRes({
        [ANONYMOUS_ID_COOKIE]: 'anon-uuid-123',
      });

      await service.login(loginDto, ip, req, res);

      expect(eventsService.mergeAnonymousEvents).toHaveBeenCalledWith(
        'anon-uuid-123',
        verifiedUser.id,
      );
    });

    it('does not attempt a merge when no anonymous_id cookie is present', async () => {
      const { req, res } = buildReqRes({});

      await service.login(loginDto, ip, req, res);

      expect(eventsService.mergeAnonymousEvents).not.toHaveBeenCalled();
    });

    it('still returns a successful login when the anonymous-event merge fails', async () => {
      const { req, res } = buildReqRes({
        [ANONYMOUS_ID_COOKIE]: 'anon-uuid-123',
      });
      eventsService.mergeAnonymousEvents.mockRejectedValue(
        new Error('merge failed'),
      );

      const result = await service.login(loginDto, ip, req, res);

      expect(result).toMatchObject({ status: 'success' });
      // let the fire-and-forget .catch() settle before the test ends
      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe('register', () => {
    it('creates user, stores OTP hash, and queues verification email', async () => {
      usersService.createEmailUser.mockResolvedValue(mockUser);

      const result = await service.register(mockRegisterDto);

      expect(usersService.createEmailUser).toHaveBeenCalledWith({
        email: mockRegisterDto.email,
        password: mockRegisterDto.password,
      });

      expect(usersService.storeOtpHash).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String),
        expect.any(Date),
      );

      expect(queueService.addJob).toHaveBeenCalledWith(
        QUEUE_NAMES.EMAIL,
        QUEUE_JOB_NAMES.EMAIL.SEND_OTP,
        {
          to: mockUser.email,
          otp: expect.any(String),
          fullName: mockUser.fullName,
        },
      );

      expect(result).toEqual({
        status: 'success',
        message: 'A verification code has been sent to your email address.',
      });
    });

    it('does not call storeOtpHash or addJob when user creation fails', async () => {
      usersService.createEmailUser.mockRejectedValue(
        new ConflictException({
          error: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists.',
        }),
      );

      await expect(service.register(mockRegisterDto)).rejects.toThrow(
        ConflictException,
      );

      expect(usersService.storeOtpHash).not.toHaveBeenCalled();
      expect(queueService.addJob).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    const verifiedOtpUser = {
      ...mockUser,
      role: UserRole.USER,
      onboardingComplete: false,
      otpHash: 'stored-otp-hash',
      otpExpiresAt: new Date(Date.now() + 60_000),
    } as User;

    const baseDto = {
      email: mockUser.email,
      otp: '123456',
    };

    function buildReqRes() {
      const req = { cookies: {} } as unknown as Request;
      const res = {} as unknown as Response;
      return { req, res };
    }

    beforeEach(() => {
      usersService.findByEmail.mockResolvedValue(verifiedOtpUser);
      usersService.clearOtp.mockResolvedValue(undefined);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      tokenService.generateAccessToken.mockResolvedValue('access-token');
      tokenService.generateRefreshToken.mockResolvedValue('refresh-token');
      tokenService.setTokenCookies.mockReturnValue(undefined);
    });

    it('claims an invite when inviteToken is provided and still returns the standard success response', async () => {
      const { req, res } = buildReqRes();
      const dto = { ...baseDto, inviteToken: 'invite-token-123' };

      const result = await service.verifyOtp(dto, req, res);

      expect(invitesService.claimInvite).toHaveBeenCalledWith(
        dto.inviteToken,
        verifiedOtpUser.id,
        dto.email.toLowerCase(),
      );
      expect(result).toEqual({
        status: 'success',
        message: 'Email verified successfully.',
        user: {
          id: verifiedOtpUser.id,
          email: verifiedOtpUser.email,
          role: verifiedOtpUser.role,
          onboardingComplete: verifiedOtpUser.onboardingComplete,
        },
      });
    });

    it('logs and still returns the standard success response when invite claiming fails', async () => {
      const { req, res } = buildReqRes();
      const dto = { ...baseDto, inviteToken: 'invite-token-123' };
      invitesService.claimInvite.mockRejectedValue(new Error('claim failed'));
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const result = await service.verifyOtp(dto, req, res);

      expect(invitesService.claimInvite).toHaveBeenCalledWith(
        dto.inviteToken,
        verifiedOtpUser.id,
        dto.email.toLowerCase(),
      );
      expect(warnSpy).toHaveBeenCalled();
      expect(result).toEqual({
        status: 'success',
        message: 'Email verified successfully.',
        user: {
          id: verifiedOtpUser.id,
          email: verifiedOtpUser.email,
          role: verifiedOtpUser.role,
          onboardingComplete: verifiedOtpUser.onboardingComplete,
        },
      });

      warnSpy.mockRestore();
    });

    it('does not claim an invite when inviteToken is omitted', async () => {
      const { req, res } = buildReqRes();

      await service.verifyOtp(baseDto, req, res);

      expect(invitesService.claimInvite).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    const userId = mockUser.id;
    const dto = { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' };

    const emailUser = {
      ...mockUser,
      password: 'stored-hash',
      authProvider: AuthProvider.EMAIL,
    } as User;

    const googleUser = {
      ...mockUser,
      password: 'unusable-random-hash',
      authProvider: AuthProvider.GOOGLE,
    } as User;

    it('updates the password, revokes all refresh tokens, then queues the email, in that order', async () => {
      usersService.findOne.mockResolvedValue(emailUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      usersService.updatePassword.mockResolvedValue(undefined);
      tokenService.invalidateAllRefreshTokens.mockResolvedValue(undefined);
      queueService.addJob.mockResolvedValue(undefined);

      const result = await service.changePassword(userId, dto);

      expect(argon2.verify).toHaveBeenCalledWith(
        emailUser.password,
        dto.currentPassword,
      );
      expect(usersService.updatePassword).toHaveBeenCalledWith(
        userId,
        dto.newPassword,
      );
      expect(tokenService.invalidateAllRefreshTokens).toHaveBeenCalledWith(
        userId,
      );
      expect(queueService.addJob).toHaveBeenCalledWith(
        QUEUE_NAMES.EMAIL,
        QUEUE_JOB_NAMES.EMAIL.SEND_PASSWORD_CHANGED,
        { to: emailUser.email },
      );

      const updateOrder =
        usersService.updatePassword.mock.invocationCallOrder[0];
      const invalidateOrder =
        tokenService.invalidateAllRefreshTokens.mock.invocationCallOrder[0];
      const emailOrder = queueService.addJob.mock.invocationCallOrder[0];

      expect(updateOrder).toBeLessThan(invalidateOrder);
      expect(invalidateOrder).toBeLessThan(emailOrder);

      expect(result).toEqual({
        status: 'success',
        message:
          'Your password has been changed. All sessions have been signed out and will require logging in again.',
      });
    });

    it('still returns success and logs when the password-changed email fails to enqueue', async () => {
      usersService.findOne.mockResolvedValue(emailUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      usersService.updatePassword.mockResolvedValue(undefined);
      tokenService.invalidateAllRefreshTokens.mockResolvedValue(undefined);
      queueService.addJob.mockRejectedValue(new Error('queue unavailable'));
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const result = await service.changePassword(userId, dto);

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        userId,
        dto.newPassword,
      );
      expect(tokenService.invalidateAllRefreshTokens).toHaveBeenCalledWith(
        userId,
      );
      expect(errorSpy).toHaveBeenCalled();
      expect(result).toEqual({
        status: 'success',
        message:
          'Your password has been changed. All sessions have been signed out and will require logging in again.',
      });

      errorSpy.mockRestore();
    });

    it('lets a refresh-token revocation failure bubble, after the write but before the email is queued', async () => {
      usersService.findOne.mockResolvedValue(emailUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      usersService.updatePassword.mockResolvedValue(undefined);
      tokenService.invalidateAllRefreshTokens.mockRejectedValue(
        new Error('revocation failed'),
      );

      await expect(service.changePassword(userId, dto)).rejects.toThrow(
        'revocation failed',
      );

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        userId,
        dto.newPassword,
      );
      expect(queueService.addJob).not.toHaveBeenCalled();
    });

    it('rejects a GOOGLE-provider account with 400/WRONG_PROVIDER before verifying any password', async () => {
      usersService.findOne.mockResolvedValue(googleUser);

      const error = await service
        .changePassword(userId, dto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        error: 'WRONG_PROVIDER',
      });

      expect(argon2.verify).not.toHaveBeenCalled();
      expect(usersService.updatePassword).not.toHaveBeenCalled();
      expect(tokenService.invalidateAllRefreshTokens).not.toHaveBeenCalled();
      expect(queueService.addJob).not.toHaveBeenCalled();
    });

    it('rejects with 400/CURRENT_PASSWORD_INCORRECT when the current password does not match, with no side effects', async () => {
      usersService.findOne.mockResolvedValue(emailUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      const error = await service
        .changePassword(userId, dto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        error: 'CURRENT_PASSWORD_INCORRECT',
      });

      expect(usersService.updatePassword).not.toHaveBeenCalled();
      expect(tokenService.invalidateAllRefreshTokens).not.toHaveBeenCalled();
      expect(queueService.addJob).not.toHaveBeenCalled();
    });

    it('rejects with 400/PASSWORD_UNCHANGED when newPassword equals currentPassword, with no side effects', async () => {
      usersService.findOne.mockResolvedValue(emailUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const sameDto = {
        currentPassword: 'SamePass1!',
        newPassword: 'SamePass1!',
      };

      const error = await service
        .changePassword(userId, sameDto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        error: 'PASSWORD_UNCHANGED',
      });

      expect(usersService.updatePassword).not.toHaveBeenCalled();
      expect(tokenService.invalidateAllRefreshTokens).not.toHaveBeenCalled();
      expect(queueService.addJob).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const resetDto = {
      resetToken: 'valid-reset-token',
      newPassword: 'NewPass1!',
    };
    const emailUser = {
      ...mockUser,
      password: 'stored-hash',
      authProvider: AuthProvider.EMAIL,
    } as User;

    it('still returns success and logs when the password-changed email fails to enqueue', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: emailUser.id,
        purpose: 'password_reset',
      });
      usersService.findOne.mockResolvedValue(emailUser);
      usersService.updatePassword.mockResolvedValue(undefined);
      tokenService.invalidateAllRefreshTokens.mockResolvedValue(undefined);
      queueService.addJob.mockRejectedValue(new Error('queue unavailable'));
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const result = await service.resetPassword(resetDto);

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        emailUser.id,
        resetDto.newPassword,
      );
      expect(tokenService.invalidateAllRefreshTokens).toHaveBeenCalledWith(
        emailUser.id,
      );
      expect(errorSpy).toHaveBeenCalled();
      expect(result).toEqual({
        status: 'success',
        message:
          'Your password has been updated. Please log in with your new password.',
      });

      errorSpy.mockRestore();
    });

    it('lets a refresh-token revocation failure bubble, after the write but before the email is queued', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: emailUser.id,
        purpose: 'password_reset',
      });
      usersService.findOne.mockResolvedValue(emailUser);
      usersService.updatePassword.mockResolvedValue(undefined);
      tokenService.invalidateAllRefreshTokens.mockRejectedValue(
        new Error('revocation failed'),
      );

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        'revocation failed',
      );

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        emailUser.id,
        resetDto.newPassword,
      );
      expect(queueService.addJob).not.toHaveBeenCalled();
    });
  });

  describe('ChangePasswordDto validation', () => {
    const validate422 = (payload: Record<string, unknown>) =>
      validate(plainToInstance(ChangePasswordDto, payload));

    it('accepts a strong password with no violations', async () => {
      const errors = await validate422({
        currentPassword: 'OldPass1!',
        newPassword: 'NewPass1!',
      });

      expect(errors).toHaveLength(0);
    });

    it('rejects a newPassword shorter than 8 characters', async () => {
      const errors = await validate422({
        currentPassword: 'OldPass1!',
        newPassword: 'Sh0rt!',
      });

      const newPasswordErrors = errors.find(
        (e) => e.property === 'newPassword',
      );
      expect(newPasswordErrors?.constraints).toHaveProperty('minLength');
    });

    it('rejects a newPassword missing complexity requirements', async () => {
      const errors = await validate422({
        currentPassword: 'OldPass1!',
        newPassword: 'alllowercase',
      });

      const newPasswordErrors = errors.find(
        (e) => e.property === 'newPassword',
      );
      expect(newPasswordErrors?.constraints).toHaveProperty('matches');
    });

    it('rejects a currentPassword longer than 128 characters', async () => {
      const errors = await validate422({
        currentPassword: 'a'.repeat(129),
        newPassword: 'NewPass1!',
      });

      const currentPasswordErrors = errors.find(
        (e) => e.property === 'currentPassword',
      );
      expect(currentPasswordErrors?.constraints).toHaveProperty('maxLength');
    });
  });
});
