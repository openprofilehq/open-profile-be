import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { ProfileView } from './entities/profile-view.entity';
import { Profile } from '../profile/entities/profile.entity';
import { NotFoundException } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

jest.mock('@t3-oss/env-core', () => ({
  createEnv: () => ({}) as never,
}));

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

const mockProfileViewRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
  query: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockProfileRepo = {
  findOne: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(ProfileView),
          useValue: mockProfileViewRepo,
        },
        {
          provide: getRepositoryToken(Profile),
          useValue: mockProfileRepo,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  describe('recordView', () => {
    it('throws NotFoundException when profile not found', async () => {
      mockProfileRepo.findOne.mockResolvedValue(null);
      const req = {
        headers: {},
        socket: { remoteAddress: '1.2.3.4' },
      } as any;

      await expect(service.recordView('profile-id', req)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockProfileViewRepo.findOne).not.toHaveBeenCalled();
      expect(mockProfileViewRepo.save).not.toHaveBeenCalled();
    });

    it('no insert when duplicate view within 5 minutes', async () => {
      mockProfileRepo.findOne.mockResolvedValue({ id: 'profile-id' });
      mockProfileViewRepo.findOne.mockResolvedValue({ id: 'existing-view' });
      const req = {
        headers: {},
        socket: { remoteAddress: '1.2.3.4' },
      } as any;

      await service.recordView('profile-id', req);

      expect(mockProfileViewRepo.create).not.toHaveBeenCalled();
      expect(mockProfileViewRepo.save).not.toHaveBeenCalled();
    });

    it('inserts row for a new view', async () => {
      mockProfileRepo.findOne.mockResolvedValue({ id: 'profile-id' });
      mockProfileViewRepo.findOne.mockResolvedValue(null);
      mockProfileViewRepo.create.mockReturnValue({});
      mockProfileViewRepo.save.mockResolvedValue({});
      const req = {
        headers: { 'user-agent': 'TestAgent' },
        socket: { remoteAddress: '1.2.3.4' },
      } as any;

      await service.recordView('profile-id', req);

      expect(mockProfileViewRepo.create).toHaveBeenCalledWith({
        profile: { id: 'profile-id' },
        viewerIp: '1.2.3.4',
        userAgent: 'TestAgent',
      });
      expect(mockProfileViewRepo.save).toHaveBeenCalled();
    });
  });

  describe('extractIp', () => {
    it('returns first IP from x-forwarded-for header', () => {
      const req = {
        headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.2' },
        socket: { remoteAddress: '1.2.3.4' },
      } as any;

      const ip = (service as any).extractIp(req);
      expect(ip).toBe('203.0.113.1');
    });

    it('returns socket remoteAddress when no x-forwarded-for header', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '1.2.3.4' },
      } as any;

      const ip = (service as any).extractIp(req);
      expect(ip).toBe('1.2.3.4');
    });
  });
});
