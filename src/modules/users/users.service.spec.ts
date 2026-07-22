jest.mock('uuid', () => ({
  v7: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000000'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityNotFoundError, QueryFailedError } from 'typeorm';
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
  let lockedUserRepo: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    const mockAction = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };

    lockedUserRepo = {
      createQueryBuilder: jest.fn(),
      save: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
        cb({ getRepository: () => lockedUserRepo }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserModelAction, useValue: mockAction },
        { provide: ResetPasswordModelAction, useValue: {} },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    action = module.get(UserModelAction);
    jest.clearAllMocks();
  });

  function mockLockedUser(preferences: Record<string, unknown>) {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn().mockResolvedValue({ ...baseUser, preferences }),
    };
    lockedUserRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    return queryBuilder;
  }

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
        NotFoundException,
      );
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

  describe('getPreferences', () => {
    it('returns the schema defaults for a user with no saved preferences', async () => {
      action.get.mockResolvedValue({ ...baseUser, preferences: {} });

      const result = await service.getPreferences(baseUser.id);

      expect(result).toEqual({ mode: 'system', colorTheme: 'default' });
    });

    it('merges saved values over defaults for keys not yet saved', async () => {
      action.get.mockResolvedValue({
        ...baseUser,
        preferences: { mode: 'dark' },
      });

      const result = await service.getPreferences(baseUser.id);

      expect(result).toEqual({ mode: 'dark', colorTheme: 'default' });
    });

    it('throws NotFoundException when the user no longer exists', async () => {
      action.get.mockResolvedValue(null);

      await expect(service.getPreferences(baseUser.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updatePreferences', () => {
    it('persists valid mode and colorTheme and returns the full merged object', async () => {
      action.get.mockResolvedValue({ ...baseUser, preferences: {} });
      const queryBuilder = mockLockedUser({});
      lockedUserRepo.save.mockResolvedValue(undefined);

      const result = await service.updatePreferences(baseUser.id, {
        mode: 'dark',
        colorTheme: 'default',
      });

      expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(lockedUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: { mode: 'dark', colorTheme: 'default' },
        }),
      );
      expect(result).toEqual({ mode: 'dark', colorTheme: 'default' });
    });

    it('preserves the sibling key when only one key is patched', async () => {
      action.get.mockResolvedValue({
        ...baseUser,
        preferences: { mode: 'dark', colorTheme: 'default' },
      });
      mockLockedUser({ mode: 'dark', colorTheme: 'default' });
      lockedUserRepo.save.mockResolvedValue(undefined);

      const result = await service.updatePreferences(baseUser.id, {
        mode: 'light',
      });

      expect(lockedUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: { mode: 'light', colorTheme: 'default' },
        }),
      );
      expect(result).toEqual({ mode: 'light', colorTheme: 'default' });
    });

    it('throws NotFoundException when the user no longer exists', async () => {
      action.get.mockResolvedValue(null);

      await expect(
        service.updatePreferences(baseUser.id, { mode: 'dark' }),
      ).rejects.toThrow(NotFoundException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('ignores an explicit undefined key on the dto instead of clobbering the stored value', async () => {
      // class-transformer's plainToInstance sets every declared DTO field
      // as an own key, so an omitted field arrives here as
      // `{ colorTheme: undefined }`, not simply absent — a naive
      // `{ ...stored, ...dto }` merge would overwrite the saved value.
      action.get.mockResolvedValue({
        ...baseUser,
        preferences: { mode: 'dark', colorTheme: 'default' },
      });
      mockLockedUser({ mode: 'dark', colorTheme: 'default' });
      lockedUserRepo.save.mockResolvedValue(undefined);

      await service.updatePreferences(baseUser.id, {
        mode: 'light',
        colorTheme: undefined,
      });

      expect(lockedUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: { mode: 'light', colorTheme: 'default' },
        }),
      );
    });

    it('merges against the locked row, not the stale pre-transaction read', async () => {
      // The outer `findOne` 404 check and the in-transaction locked read can
      // observe different `preferences` values under concurrent writers —
      // the merge must use the locked read, never the outer one.
      action.get.mockResolvedValue({
        ...baseUser,
        preferences: { mode: 'dark', colorTheme: 'default' },
      });
      mockLockedUser({ mode: 'light', colorTheme: 'default' });
      lockedUserRepo.save.mockResolvedValue(undefined);

      const result = await service.updatePreferences(baseUser.id, {
        colorTheme: 'default',
      });

      expect(lockedUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: { mode: 'light', colorTheme: 'default' },
        }),
      );
      expect(result).toEqual({ mode: 'light', colorTheme: 'default' });
    });

    it('converts a not-found-during-lock race into the controlled error message', async () => {
      action.get.mockResolvedValue({
        ...baseUser,
        preferences: { mode: 'dark', colorTheme: 'default' },
      });
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOneOrFail: jest
          .fn()
          .mockRejectedValue(
            new EntityNotFoundError(User, { id: baseUser.id }),
          ),
      };
      lockedUserRepo.createQueryBuilder.mockReturnValue(queryBuilder);

      await expect(
        service.updatePreferences(baseUser.id, { mode: 'light' }),
      ).rejects.toThrow(InternalServerErrorException);
      await expect(
        service.updatePreferences(baseUser.id, { mode: 'light' }),
      ).rejects.toThrow('Failed to update preferences');
    });
  });
});
