jest.mock('uuid', () => ({
  v7: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000000'),
}));

jest.mock('../../config/env', () => ({
  env: {},
}));

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mocked-argon2-hash'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { QueueService } from '../queue/queue.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../../common/redis/redis.service';
import { TokenService } from './services/token.service';
import {
  QUEUE_NAMES,
  QUEUE_JOB_NAMES,
} from '../queue/config/queue-names.constant';
import { User } from '../users/entities/user.entity';

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

  beforeEach(async () => {
    const mockUsersService = {
      createEmailUser: jest.fn(),
      storeOtpHash: jest.fn(),
      findByEmail: jest.fn(),
      clearOtp: jest.fn(),
    };

    const mockQueueService = {
      addJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: {} },
        { provide: QueueService, useValue: mockQueueService },
        { provide: RateLimiterService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: TokenService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    queueService = module.get(QueueService);
    jest.clearAllMocks();
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
});
