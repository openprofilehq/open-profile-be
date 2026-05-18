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

jest.mock('argon2', () => ({
  hash: jest.fn((val: string) => Promise.resolve(`hashed:${val}`)),
}));

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

const mockInsertQB = {
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orIgnore: jest.fn().mockReturnThis(),
  execute: jest.fn(),
};

const mockProfileViewRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
  query: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue(mockInsertQB),
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
      const req = { ip: '1.2.3.4', headers: {} } as any;

      await expect(service.recordView('profile-id', req)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockInsertQB.execute).not.toHaveBeenCalled();
    });

    it('no insert when duplicate (unique key ignored)', async () => {
      mockProfileRepo.findOne.mockResolvedValue({ id: 'profile-id' });
      mockInsertQB.execute.mockResolvedValue({ identifiers: [] });
      const req = { ip: '1.2.3.4', headers: {} } as any;

      await service.recordView('profile-id', req);

      expect(mockInsertQB.values).toHaveBeenCalled();
      expect(mockInsertQB.execute).toHaveBeenCalled();
    });

    it('inserts row for a new view', async () => {
      mockProfileRepo.findOne.mockResolvedValue({ id: 'profile-id' });
      mockInsertQB.execute.mockResolvedValue({ identifiers: ['new-id'] });
      const req = {
        ip: '1.2.3.4',
        headers: { 'user-agent': 'TestAgent' },
      } as any;

      await service.recordView('profile-id', req);

      expect(mockInsertQB.values).toHaveBeenCalledWith({
        profileId: 'profile-id',
        viewerIp: '1.2.3.4',
        userAgent: 'TestAgent',
        dedupKey: expect.stringMatching(/^profile-id:1\.2\.3\.4:\d+$/),
      });
      expect(mockInsertQB.execute).toHaveBeenCalled();
    });
  });

  describe('extractIp', () => {
    it('returns req.ip when available', () => {
      const req = { ip: '203.0.113.1' } as any;

      const ip = (service as any).extractIp(req);
      expect(ip).toBe('203.0.113.1');
    });

    it('returns fallback when req.ip is undefined', () => {
      const req = {} as any;

      const ip = (service as any).extractIp(req);
      expect(ip).toBe('0.0.0.0');
    });
  });
});
