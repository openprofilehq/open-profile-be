jest.mock('uuid', () => ({
  v7: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000000'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UsersService, EMAIL_ALREADY_EXISTS } from './users.service';
import { UserModelAction } from './actions/user.action';
import { ResetPasswordModelAction } from './actions/reset-password.action';
import { User, AuthProvider } from './entities/user.entity';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mocked-password-hash'),
}));

const baseUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  username: 'testuser',
  fullName: 'Test User',
  authProvider: AuthProvider.EMAIL,
  isVerified: false,
  onboardingComplete: false,
  role: null,
  otpHash: null,
  otpExpiresAt: null,
} as User;

describe('UsersService', () => {
  let service: UsersService;
  let action: Record<string, jest.Mock>;

  beforeEach(async () => {
    const mockAction = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserModelAction, useValue: mockAction },
        { provide: ResetPasswordModelAction, useValue: {} },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    action = module.get(UserModelAction);
    jest.clearAllMocks();
  });

  describe('createEmailUser', () => {
    const dto = {
      email: 'test@example.com',
      password: 'StrongPass1!',
    };

    const lowercasedEmail = 'test@example.com';

    it('creates a new user when email is not taken', async () => {
      action.findByEmail.mockResolvedValue(null);
      action.create.mockResolvedValue(baseUser);

      const result = await service.createEmailUser(dto);

      expect(action.findByEmail).toHaveBeenCalledWith(lowercasedEmail);
      expect(action.create).toHaveBeenCalledWith({
        createPayload: {
          email: lowercasedEmail,
          password: 'mocked-password-hash',
          authProvider: AuthProvider.EMAIL,
          role: null,
          otpHash: null,
          otpExpiresAt: null,
        },
        transactionOptions: { useTransaction: false as const },
      });
      expect(result).toEqual(baseUser);
    });

    it('throws ConflictException when email belongs to a verified user', async () => {
      const verifiedUser = { ...baseUser, isVerified: true };
      action.findByEmail.mockResolvedValue(verifiedUser);

      await expect(service.createEmailUser(dto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.createEmailUser(dto)).rejects.toMatchObject({
        response: { error: EMAIL_ALREADY_EXISTS },
      });

      expect(action.create).not.toHaveBeenCalled();
      expect(action.update).not.toHaveBeenCalled();
    });

    it('updates existing user when unverified and has a valid OTP (idempotent)', async () => {
      const futureDate = new Date(Date.now() + 60_000);
      const unverifiedWithOTP = {
        ...baseUser,
        otpExpiresAt: futureDate,
      };
      action.findByEmail.mockResolvedValue(unverifiedWithOTP);
      action.update.mockResolvedValue(unverifiedWithOTP);

      const result = await service.createEmailUser(dto);

      expect(action.update).toHaveBeenCalled();
      expect(action.create).not.toHaveBeenCalled();
    });

    it('updates existing user when unverified and OTP has expired', async () => {
      const pastDate = new Date(Date.now() - 60_000);
      const unverifiedExpired = {
        ...baseUser,
        otpExpiresAt: pastDate,
      };
      action.findByEmail.mockResolvedValue(unverifiedExpired);
      action.update.mockResolvedValue(unverifiedExpired);

      const result = await service.createEmailUser(dto);

      expect(action.findByEmail).toHaveBeenCalledWith(lowercasedEmail);
      expect(action.update).toHaveBeenCalledWith({
        identifierOptions: { id: unverifiedExpired.id },
        updatePayload: {
          password: 'mocked-password-hash',
          otpHash: null,
          otpExpiresAt: null,
        },
        transactionOptions: { useTransaction: false as const },
      });
      expect(action.create).not.toHaveBeenCalled();
      expect(result).toEqual(unverifiedExpired);
    });

    it('updates existing user when unverified and OTP was never set', async () => {
      const unverifiedNoOtp = {
        ...baseUser,
        otpHash: null,
        otpExpiresAt: null,
      };
      action.findByEmail.mockResolvedValue(unverifiedNoOtp);
      action.update.mockResolvedValue(unverifiedNoOtp);

      const result = await service.createEmailUser(dto);

      expect(action.update).toHaveBeenCalled();
      expect(action.create).not.toHaveBeenCalled();
    });

    it('throws InternalServerErrorException when update returns null', async () => {
      const pastDate = new Date(Date.now() - 60_000);
      const unverifiedExpired = {
        ...baseUser,
        otpExpiresAt: pastDate,
      };
      action.findByEmail.mockResolvedValue(unverifiedExpired);
      action.update.mockResolvedValue(null);

      await expect(service.createEmailUser(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getSettings', () => {
    it('returns only the v1 settings fields, excluding sensitive data', async () => {
      action.get.mockResolvedValue({
        ...baseUser,
        password: 'hashed-password',
        otpHash: 'some-otp-hash',
        otpExpiresAt: new Date(),
        lastLoginIp: '127.0.0.1',
      });

      const result = await service.getSettings(baseUser.id);

      expect(result).toEqual({
        email: baseUser.email,
        username: baseUser.username,
        fullName: baseUser.fullName,
        isVerified: baseUser.isVerified,
        authProvider: baseUser.authProvider,
        onboardingComplete: baseUser.onboardingComplete,
      });
      expect(Object.keys(result)).toEqual([
        'email',
        'username',
        'fullName',
        'isVerified',
        'authProvider',
        'onboardingComplete',
      ]);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('otpHash');
      expect(result).not.toHaveProperty('otpExpiresAt');
      expect(result).not.toHaveProperty('lastLoginIp');
    });

    it('throws NotFoundException when the user no longer exists', async () => {
      action.get.mockResolvedValue(null);

      await expect(service.getSettings(baseUser.id)).rejects.toThrow(
        `User ${baseUser.id} not found`,
      );
    });
  });

  describe('getBillingInfo', () => {
    it('returns the static Free-plan stub for an existing user', async () => {
      action.get.mockResolvedValue(baseUser);

      const result = await service.getBillingInfo(baseUser.id);

      expect(result).toEqual({ plan: 'Free', nextBillingDate: null });
    });

    it('throws NotFoundException when the user no longer exists', async () => {
      action.get.mockResolvedValue(null);

      await expect(service.getBillingInfo(baseUser.id)).rejects.toThrow(
        `User ${baseUser.id} not found`,
      );
    });
  });

  describe('updateEmail', () => {
    const newEmailDto = { email: 'new@example.com' };

    it('updates the email and returns the new value', async () => {
      action.get.mockResolvedValue(baseUser);
      action.findByEmail.mockResolvedValue(null);
      action.update.mockResolvedValue({
        ...baseUser,
        email: newEmailDto.email,
      });

      const result = await service.updateEmail(baseUser.id, newEmailDto);

      expect(action.findByEmail).toHaveBeenCalledWith(newEmailDto.email);
      expect(action.update).toHaveBeenCalledWith({
        identifierOptions: { id: baseUser.id },
        updatePayload: { email: newEmailDto.email },
        transactionOptions: { useTransaction: false as const },
      });
      expect(result).toEqual({ email: newEmailDto.email });
    });

    it('is a no-op and returns the current email when unchanged', async () => {
      action.get.mockResolvedValue(baseUser);

      const result = await service.updateEmail(baseUser.id, {
        email: baseUser.email,
      });

      expect(result).toEqual({ email: baseUser.email });
      expect(action.findByEmail).not.toHaveBeenCalled();
      expect(action.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the email is already taken (pre-check)', async () => {
      action.get.mockResolvedValue(baseUser);
      action.findByEmail.mockResolvedValue({
        ...baseUser,
        id: 'other-user-id',
        email: newEmailDto.email,
      });

      await expect(
        service.updateEmail(baseUser.id, newEmailDto),
      ).rejects.toMatchObject({
        response: { error: EMAIL_ALREADY_EXISTS },
      });
      expect(action.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException on a unique-constraint race from a concurrent update', async () => {
      action.get.mockResolvedValue(baseUser);
      action.findByEmail.mockResolvedValue(null);
      const driverError = Object.assign(
        new QueryFailedError('query', [], new Error('duplicate key')),
        { code: '23505' },
      );
      action.update.mockRejectedValue(driverError);

      await expect(
        service.updateEmail(baseUser.id, newEmailDto),
      ).rejects.toMatchObject({
        response: { error: EMAIL_ALREADY_EXISTS },
      });
    });

    it('rethrows non-constraint errors from update unchanged', async () => {
      action.get.mockResolvedValue(baseUser);
      action.findByEmail.mockResolvedValue(null);
      const unrelatedError = new Error('connection lost');
      action.update.mockRejectedValue(unrelatedError);

      await expect(service.updateEmail(baseUser.id, newEmailDto)).rejects.toBe(
        unrelatedError,
      );
    });

    it('throws ForbiddenException for a GOOGLE-provider account', async () => {
      action.get.mockResolvedValue({
        ...baseUser,
        authProvider: AuthProvider.GOOGLE,
      });

      await expect(
        service.updateEmail(baseUser.id, newEmailDto),
      ).rejects.toThrow(ForbiddenException);
      expect(action.findByEmail).not.toHaveBeenCalled();
      expect(action.update).not.toHaveBeenCalled();
    });
  });
});
