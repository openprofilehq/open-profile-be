import { ForbiddenException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../common/redis/redis.service';
import { Event, EventType } from '../events/entities/event.entity';
import { Profile } from '../profile/entities/profile.entity';
import { AnalyticsRange } from './dto/analytics-range-query.dto';
import { AnalyticsService } from './analytics.service';

jest.mock('@t3-oss/env-core', () => ({
  createEnv: () => ({}) as never,
}));

jest.mock('argon2', () => ({
  hash: jest.fn((val: string) => Promise.resolve(`hashed:${val}`)),
}));

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

type QueryBuilderMock = {
  select: jest.Mock;
  addSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  groupBy: jest.Mock;
  orderBy: jest.Mock;
  getCount: jest.Mock;
  getRawOne: jest.Mock;
  getRawMany: jest.Mock;
};

const createQueryBuilderMock = (): QueryBuilderMock => {
  const qb = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    groupBy: jest.fn(),
    orderBy: jest.fn(),
    getCount: jest.fn(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
  } as QueryBuilderMock;

  qb.select.mockReturnValue(qb);
  qb.addSelect.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.groupBy.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);

  return qb;
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let eventRepo: jest.Mocked<Pick<Repository<Event>, 'createQueryBuilder'>>;
  let profileRepo: jest.Mocked<Pick<Repository<Profile>, 'findOne'>>;
  let redisService: jest.Mocked<Pick<RedisService, 'get' | 'set'>>;

  const profile = {
    id: 'profile-id',
    userId: 'user-id',
    viewCount: 123,
  } as Profile;

  beforeEach(async () => {
    eventRepo = {
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<Event>, 'createQueryBuilder'>>;
    profileRepo = {
      findOne: jest.fn(),
    };
    redisService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        { provide: getRepositoryToken(Profile), useValue: profileRepo },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    jest.useFakeTimers().setSystemTime(new Date('2026-07-21T15:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('getProfileViewStats', () => {
    it('throws ForbiddenException when profile is not found', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getProfileViewStats('user-id', '7d'),
      ).rejects.toThrow(ForbiddenException);

      expect(redisService.get).not.toHaveBeenCalled();
      expect(eventRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns cached JSON without querying events', async () => {
      const cached = {
        total: 123,
        range_total: 10,
        unique_viewers: 7,
        daily_breakdown: [{ date: '2026-07-21', views: 3 }],
      };
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(JSON.stringify(cached));

      await expect(
        service.getProfileViewStats('user-id', '30d'),
      ).resolves.toEqual(cached);

      expect(redisService.get).toHaveBeenCalledWith(
        'analytics:profile-views:profile-id:30d',
      );
      expect(eventRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('queries profile view events and caches the aggregated result on cache miss', async () => {
      const rangeTotalQb = createQueryBuilderMock();
      const uniqueViewersQb = createQueryBuilderMock();
      const dailyBreakdownQb = createQueryBuilderMock();
      rangeTotalQb.getCount.mockResolvedValue(4);
      uniqueViewersQb.getRawOne.mockResolvedValue({ count: '3' });
      dailyBreakdownQb.getRawMany.mockResolvedValue([
        { date: '2026-07-20', views: '1' },
        { date: '2026-07-21', views: '3' },
      ]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(rangeTotalQb as never)
        .mockReturnValueOnce(uniqueViewersQb as never)
        .mockReturnValueOnce(dailyBreakdownQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getProfileViewStats('user-id', '7d');

      expect(result).toEqual({
        total: 123,
        range_total: 4,
        unique_viewers: 3,
        daily_breakdown: [
          { date: '2026-07-15', views: 0 },
          { date: '2026-07-16', views: 0 },
          { date: '2026-07-17', views: 0 },
          { date: '2026-07-18', views: 0 },
          { date: '2026-07-19', views: 0 },
          { date: '2026-07-20', views: 1 },
          { date: '2026-07-21', views: 3 },
        ],
      });
      expect(rangeTotalQb.andWhere).toHaveBeenCalledWith(
        'e."eventType" = :type',
        { type: EventType.PROFILE_VIEWED },
      );
      expect(redisService.set).toHaveBeenCalledWith(
        'analytics:profile-views:profile-id:7d',
        JSON.stringify(result),
        60,
      );
    });

    it.each([
      ['7d', '2026-07-15T00:00:00.000Z'],
      ['30d', '2026-06-22T00:00:00.000Z'],
      ['90d', '2026-04-23T00:00:00.000Z'],
    ] as [AnalyticsRange, string][])(
      'uses the correct %s range start date',
      async (range, expectedStart) => {
        const rangeTotalQb = createQueryBuilderMock();
        const uniqueViewersQb = createQueryBuilderMock();
        const dailyBreakdownQb = createQueryBuilderMock();
        rangeTotalQb.getCount.mockResolvedValue(0);
        uniqueViewersQb.getRawOne.mockResolvedValue({ count: '0' });
        dailyBreakdownQb.getRawMany.mockResolvedValue([]);
        eventRepo.createQueryBuilder
          .mockReturnValueOnce(rangeTotalQb as never)
          .mockReturnValueOnce(uniqueViewersQb as never)
          .mockReturnValueOnce(dailyBreakdownQb as never);
        profileRepo.findOne.mockResolvedValue(profile);
        redisService.get.mockResolvedValue(null);

        const result = await service.getProfileViewStats('user-id', range);

        expect(rangeTotalQb.andWhere).toHaveBeenCalledWith(
          'e."occurredAt" >= :start',
          { start: new Date(expectedStart) },
        );
        expect(result.daily_breakdown).toHaveLength(Number(range.slice(0, -1)));
      },
    );
  });

  describe('getLinkClickStats', () => {
    it('throws ForbiddenException when profile is not found', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.getLinkClickStats('user-id', '7d')).rejects.toThrow(
        ForbiddenException,
      );

      expect(redisService.get).not.toHaveBeenCalled();
      expect(eventRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns cached JSON without querying events', async () => {
      const cached = {
        range_total: 8,
        links: [{ linkUrl: 'https://example.com', clicks: 8 }],
      };
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(JSON.stringify(cached));

      await expect(
        service.getLinkClickStats('user-id', '90d'),
      ).resolves.toEqual(cached);

      expect(redisService.get).toHaveBeenCalledWith(
        'analytics:link-clicks:profile-id:90d',
      );
      expect(eventRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('queries link click events, normalizes duplicate URLs, and caches the result', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        { linkUrl: 'HTTPS://Example.com/Path/', clicks: '2' },
        { linkUrl: 'https://example.com/path', clicks: '3' },
        { linkUrl: 'https://other.example/link', clicks: '4' },
        { linkUrl: null, clicks: '10' },
      ]);
      eventRepo.createQueryBuilder.mockReturnValue(qb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getLinkClickStats('user-id', '30d');

      expect(result).toEqual({
        range_total: 9,
        links: [
          { linkUrl: 'https://other.example/link', clicks: 4 },
          { linkUrl: 'https://example.com/path', clicks: 3 },
          { linkUrl: 'https://example.com/Path', clicks: 2 },
        ],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('e."eventType" = :type', {
        type: EventType.LINK_CLICKED,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('e."occurredAt" >= :start', {
        start: new Date('2026-06-22T00:00:00.000Z'),
      });
      expect(redisService.set).toHaveBeenCalledWith(
        'analytics:link-clicks:profile-id:30d',
        JSON.stringify(result),
        60,
      );
    });

    it('merges URLs that differ only by normalization', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        { linkUrl: 'https://github.com/calvin', clicks: '2' },
        { linkUrl: 'https://github.com/calvin/', clicks: '5' },
      ]);
      eventRepo.createQueryBuilder.mockReturnValue(qb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      await expect(service.getLinkClickStats('user-id', '7d')).resolves.toEqual(
        {
          range_total: 7,
          links: [{ linkUrl: 'https://github.com/calvin', clicks: 7 }],
        },
      );
    });

    it('returns an empty state when no link click events exist in range', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([]);
      eventRepo.createQueryBuilder.mockReturnValue(qb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getLinkClickStats('user-id', '7d');

      expect(result).toEqual({ range_total: 0, links: [] });
      expect(redisService.set).toHaveBeenCalledWith(
        'analytics:link-clicks:profile-id:7d',
        JSON.stringify(result),
        60,
      );
    });

    it('sorts links descending by clicks', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        { linkUrl: 'https://least.example', clicks: '1' },
        { linkUrl: 'https://most.example', clicks: '9' },
        { linkUrl: 'https://middle.example', clicks: '4' },
      ]);
      eventRepo.createQueryBuilder.mockReturnValue(qb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getLinkClickStats('user-id', '7d');

      expect(result.links).toEqual([
        { linkUrl: 'https://most.example', clicks: 9 },
        { linkUrl: 'https://middle.example', clicks: 4 },
        { linkUrl: 'https://least.example', clicks: 1 },
      ]);
    });

    it('falls through to recompute when cached JSON is malformed', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        { linkUrl: 'https://example.com', clicks: '6' },
      ]);
      eventRepo.createQueryBuilder.mockReturnValue(qb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue('{bad json');

      const result = await service.getLinkClickStats('user-id', '7d');

      expect(result).toEqual({
        range_total: 6,
        links: [{ linkUrl: 'https://example.com', clicks: 6 }],
      });
      expect(eventRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalledWith(
        'analytics:link-clicks:profile-id:7d',
        JSON.stringify(result),
        60,
      );
    });

    it('logs Redis read errors and recomputes without throwing', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([]);
      eventRepo.createQueryBuilder.mockReturnValue(qb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockRejectedValue(new Error('read failed'));

      await expect(service.getLinkClickStats('user-id', '7d')).resolves.toEqual(
        { range_total: 0, links: [] },
      );

      expect(warnSpy).toHaveBeenCalledWith(
        'Redis cache read failed: read failed',
      );
      warnSpy.mockRestore();
    });

    it('logs Redis write errors without throwing', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        { linkUrl: 'https://example.com', clicks: '1' },
      ]);
      eventRepo.createQueryBuilder.mockReturnValue(qb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);
      redisService.set.mockRejectedValue(new Error('write failed'));

      await expect(service.getLinkClickStats('user-id', '7d')).resolves.toEqual(
        {
          range_total: 1,
          links: [{ linkUrl: 'https://example.com', clicks: 1 }],
        },
      );

      expect(warnSpy).toHaveBeenCalledWith(
        'Redis cache write failed: write failed',
      );
      warnSpy.mockRestore();
    });
  });

  describe('getSearchConversionStats', () => {
    it('throws ForbiddenException when profile is not found', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getSearchConversionStats('user-id', '7d'),
      ).rejects.toThrow(ForbiddenException);

      expect(redisService.get).not.toHaveBeenCalled();
      expect(eventRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns cached JSON without querying events', async () => {
      const cached = {
        searches_surfaced: 10,
        search_driven_views: 4,
        conversion_rate: 0.4,
      };
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(JSON.stringify(cached));

      await expect(
        service.getSearchConversionStats('user-id', '30d'),
      ).resolves.toEqual(cached);

      expect(redisService.get).toHaveBeenCalledWith(
        'analytics:search-conversions:profile-id:30d',
      );
      expect(eventRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('computes search conversion stats and caches the result on cache miss', async () => {
      const searchesSurfacedQb = createQueryBuilderMock();
      const searchDrivenViewsQb = createQueryBuilderMock();
      searchesSurfacedQb.getCount.mockResolvedValue(8);
      searchDrivenViewsQb.getCount.mockResolvedValue(2);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getSearchConversionStats('user-id', '7d');

      expect(result).toEqual({
        searches_surfaced: 8,
        search_driven_views: 2,
        conversion_rate: 0.25,
      });
      expect(searchesSurfacedQb.where).toHaveBeenCalledWith(
        'e."eventType" = :type',
        { type: EventType.SEARCH_PERFORMED },
      );
      expect(searchesSurfacedQb.andWhere).toHaveBeenCalledWith(
        `e.metadata->'resultProfileIds' ? :profileId`,
        { profileId: 'profile-id' },
      );
      expect(searchDrivenViewsQb.where).toHaveBeenCalledWith(
        'e."profileId" = :profileId',
        { profileId: 'profile-id' },
      );
      expect(searchDrivenViewsQb.andWhere).toHaveBeenCalledWith(
        'e."eventType" = :type',
        { type: EventType.PROFILE_VIEWED },
      );
      expect(searchDrivenViewsQb.andWhere).toHaveBeenCalledWith(
        `e.metadata->>'referrerSearchId' IS NOT NULL`,
      );
      expect(redisService.set).toHaveBeenCalledWith(
        'analytics:search-conversions:profile-id:7d',
        JSON.stringify(result),
        60,
      );
    });

    it('returns conversion_rate 0 when no searches surfaced the profile', async () => {
      const searchesSurfacedQb = createQueryBuilderMock();
      const searchDrivenViewsQb = createQueryBuilderMock();
      searchesSurfacedQb.getCount.mockResolvedValue(0);
      searchDrivenViewsQb.getCount.mockResolvedValue(0);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getSearchConversionStats('user-id', '7d');

      expect(result).toEqual({
        searches_surfaced: 0,
        search_driven_views: 0,
        conversion_rate: 0,
      });
      expect(result.conversion_rate).toBe(0);
      expect(Number.isNaN(result.conversion_rate)).toBe(false);
    });

    it('falls through to recompute when cached JSON is malformed', async () => {
      const searchesSurfacedQb = createQueryBuilderMock();
      const searchDrivenViewsQb = createQueryBuilderMock();
      searchesSurfacedQb.getCount.mockResolvedValue(3);
      searchDrivenViewsQb.getCount.mockResolvedValue(1);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue('{bad json');

      const result = await service.getSearchConversionStats('user-id', '7d');

      expect(result).toEqual({
        searches_surfaced: 3,
        search_driven_views: 1,
        conversion_rate: 1 / 3,
      });
      expect(eventRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(redisService.set).toHaveBeenCalledWith(
        'analytics:search-conversions:profile-id:7d',
        JSON.stringify(result),
        60,
      );
    });

    it('logs Redis read errors and recomputes without throwing', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const searchesSurfacedQb = createQueryBuilderMock();
      const searchDrivenViewsQb = createQueryBuilderMock();
      searchesSurfacedQb.getCount.mockResolvedValue(0);
      searchDrivenViewsQb.getCount.mockResolvedValue(0);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockRejectedValue(new Error('read failed'));

      await expect(
        service.getSearchConversionStats('user-id', '7d'),
      ).resolves.toEqual({
        searches_surfaced: 0,
        search_driven_views: 0,
        conversion_rate: 0,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        'Redis cache read failed: read failed',
      );
      warnSpy.mockRestore();
    });

    it('logs Redis write errors without throwing', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const searchesSurfacedQb = createQueryBuilderMock();
      const searchDrivenViewsQb = createQueryBuilderMock();
      searchesSurfacedQb.getCount.mockResolvedValue(4);
      searchDrivenViewsQb.getCount.mockResolvedValue(2);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);
      redisService.set.mockRejectedValue(new Error('write failed'));

      await expect(
        service.getSearchConversionStats('user-id', '7d'),
      ).resolves.toEqual({
        searches_surfaced: 4,
        search_driven_views: 2,
        conversion_rate: 0.5,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        'Redis cache write failed: write failed',
      );
      warnSpy.mockRestore();
    });
  });
});
