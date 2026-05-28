jest.mock('uuid', () => ({
  v7: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000000'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
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
  fullName: 'Test User',
  authProvider: AuthProvider.EMAIL,
  isVerified: false,
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
});
