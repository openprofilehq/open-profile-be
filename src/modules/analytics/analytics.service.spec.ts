import { ForbiddenException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../common/redis/redis.service';
import { Event, EventType } from '../events/entities/event.entity';
import { Profile } from '../profile/entities/profile.entity';
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

const DEFAULT_START = new Date('2026-06-21T00:00:00.000Z');
const DEFAULT_END = new Date('2026-07-21T23:59:59.999Z');
const DEFAULT_RANGE_KEY = `${DEFAULT_START.toISOString()}:${DEFAULT_END.toISOString()}`;
const EXPLICIT_QUERY = {
  startDate: '2026-07-01',
  endDate: '2026-07-10',
};
const EXPLICIT_START = new Date('2026-07-01T00:00:00.000Z');
const EXPLICIT_END = new Date('2026-07-10T23:59:59.999Z');
const EXPLICIT_RANGE_KEY = `${EXPLICIT_START.toISOString()}:${EXPLICIT_END.toISOString()}`;

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

      await expect(service.getProfileViewStats('user-id', {})).rejects.toThrow(
        ForbiddenException,
      );

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

      await expect(service.getProfileViewStats('user-id', {})).resolves.toEqual(
        cached,
      );

      expect(redisService.get).toHaveBeenCalledWith(
        `analytics:profile-views:profile-id:${DEFAULT_RANGE_KEY}`,
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

      const result = await service.getProfileViewStats('user-id', {});

      expect(result).toEqual({
        total: 123,
        range_total: 4,
        unique_viewers: 3,
        daily_breakdown: [
          { date: '2026-07-20', views: 1 },
          { date: '2026-07-21', views: 3 },
        ],
      });
      expect(rangeTotalQb.andWhere).toHaveBeenCalledWith(
        'e."eventType" = :type',
        { type: EventType.PROFILE_VIEWED },
      );
      expect(rangeTotalQb.andWhere).toHaveBeenCalledWith(
        'e."occurredAt" >= :start',
        { start: DEFAULT_START },
      );
      expect(rangeTotalQb.andWhere).toHaveBeenCalledWith(
        'e."occurredAt" <= :end',
        { end: DEFAULT_END },
      );
      expect(redisService.set).toHaveBeenCalledWith(
        `analytics:profile-views:profile-id:${DEFAULT_RANGE_KEY}`,
        JSON.stringify(result),
        60,
      );
    });

    it('uses the default date range when no dates are provided', async () => {
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

      await service.getProfileViewStats('user-id', {});

      expect(rangeTotalQb.andWhere).toHaveBeenCalledWith(
        'e."occurredAt" >= :start',
        { start: DEFAULT_START },
      );
      expect(rangeTotalQb.andWhere).toHaveBeenCalledWith(
        'e."occurredAt" <= :end',
        { end: DEFAULT_END },
      );
    });

    it('uses the explicit startDate and endDate when provided', async () => {
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

      await service.getProfileViewStats('user-id', EXPLICIT_QUERY);

      expect(rangeTotalQb.andWhere).toHaveBeenCalledWith(
        'e."occurredAt" >= :start',
        { start: EXPLICIT_START },
      );
      expect(rangeTotalQb.andWhere).toHaveBeenCalledWith(
        'e."occurredAt" <= :end',
        { end: EXPLICIT_END },
      );
      expect(redisService.set).toHaveBeenCalledWith(
        `analytics:profile-views:profile-id:${EXPLICIT_RANGE_KEY}`,
        expect.any(String),
        60,
      );
    });
  });

  describe('getLinkClickStats', () => {
    it('throws ForbiddenException when profile is not found', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.getLinkClickStats('user-id', {})).rejects.toThrow(
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

      await expect(service.getLinkClickStats('user-id', {})).resolves.toEqual(
        cached,
      );

      expect(redisService.get).toHaveBeenCalledWith(
        `analytics:link-clicks:profile-id:${DEFAULT_RANGE_KEY}`,
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

      const result = await service.getLinkClickStats('user-id', {});

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
        start: DEFAULT_START,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('e."occurredAt" <= :end', {
        end: DEFAULT_END,
      });
      expect(redisService.set).toHaveBeenCalledWith(
        `analytics:link-clicks:profile-id:${DEFAULT_RANGE_KEY}`,
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

      await expect(service.getLinkClickStats('user-id', {})).resolves.toEqual({
        range_total: 7,
        links: [{ linkUrl: 'https://github.com/calvin', clicks: 7 }],
      });
    });

    it('returns an empty state when no link click events exist in range', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([]);
      eventRepo.createQueryBuilder.mockReturnValue(qb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getLinkClickStats('user-id', {});

      expect(result).toEqual({ range_total: 0, links: [] });
      expect(redisService.set).toHaveBeenCalledWith(
        `analytics:link-clicks:profile-id:${DEFAULT_RANGE_KEY}`,
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

      const result = await service.getLinkClickStats('user-id', {});

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

      const result = await service.getLinkClickStats('user-id', {});

      expect(result).toEqual({
        range_total: 6,
        links: [{ linkUrl: 'https://example.com', clicks: 6 }],
      });
      expect(eventRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalledWith(
        `analytics:link-clicks:profile-id:${DEFAULT_RANGE_KEY}`,
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

      await expect(service.getLinkClickStats('user-id', {})).resolves.toEqual({
        range_total: 0,
        links: [],
      });

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

      await expect(service.getLinkClickStats('user-id', {})).resolves.toEqual({
        range_total: 1,
        links: [{ linkUrl: 'https://example.com', clicks: 1 }],
      });

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
        service.getSearchConversionStats('user-id', {}),
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
        service.getSearchConversionStats('user-id', {}),
      ).resolves.toEqual(cached);

      expect(redisService.get).toHaveBeenCalledWith(
        `analytics:search-conversions:profile-id:${DEFAULT_RANGE_KEY}`,
      );
      expect(eventRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('computes search conversion stats and caches the result on cache miss', async () => {
      const searchesSurfacedQb = createQueryBuilderMock();
      const searchDrivenViewsQb = createQueryBuilderMock();
      searchesSurfacedQb.getRawMany.mockResolvedValue([
        { searchId: 'search-1' },
        { searchId: 'search-2' },
        { searchId: 'search-3' },
        { searchId: 'search-4' },
        { searchId: 'search-5' },
        { searchId: 'search-6' },
        { searchId: 'search-7' },
        { searchId: 'search-8' },
      ]);
      searchDrivenViewsQb.getRawMany.mockResolvedValue([
        { referrerSearchId: 'search-1' },
        { referrerSearchId: 'search-2' },
      ]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getSearchConversionStats('user-id', {});

      expect(result).toEqual({
        searches_surfaced: 8,
        search_driven_views: 2,
        conversion_rate: 0.25,
      });
      expect(searchesSurfacedQb.select).toHaveBeenCalledWith(
        `e.metadata->>'searchId'`,
        'searchId',
      );
      expect(searchesSurfacedQb.where).toHaveBeenCalledWith(
        'e."eventType" = :type',
        { type: EventType.SEARCH_PERFORMED },
      );
      expect(searchesSurfacedQb.andWhere).toHaveBeenCalledWith(
        'e."occurredAt" >= :start',
        { start: DEFAULT_START },
      );
      expect(searchesSurfacedQb.andWhere).toHaveBeenCalledWith(
        'e."occurredAt" <= :end',
        { end: DEFAULT_END },
      );
      expect(searchesSurfacedQb.andWhere).toHaveBeenCalledWith(
        `e.metadata->'resultProfileIds' ? :profileId`,
        { profileId: 'profile-id' },
      );
      expect(searchDrivenViewsQb.where).toHaveBeenCalledWith(
        'e."profileId" = :profileId',
        { profileId: 'profile-id' },
      );
      expect(searchDrivenViewsQb.select).toHaveBeenCalledWith(
        `e.metadata->>'referrerSearchId'`,
        'referrerSearchId',
      );
      expect(searchDrivenViewsQb.andWhere).toHaveBeenCalledWith(
        'e."eventType" = :type',
        { type: EventType.PROFILE_VIEWED },
      );
      expect(searchDrivenViewsQb.andWhere).toHaveBeenCalledWith(
        'e."occurredAt" >= :start',
        { start: DEFAULT_START },
      );
      expect(searchDrivenViewsQb.andWhere).toHaveBeenCalledWith(
        'e."occurredAt" <= :end',
        { end: DEFAULT_END },
      );
      expect(searchDrivenViewsQb.andWhere).toHaveBeenCalledWith(
        `e.metadata->>'referrerSearchId' IS NOT NULL`,
      );
      expect(redisService.set).toHaveBeenCalledWith(
        `analytics:search-conversions:profile-id:${DEFAULT_RANGE_KEY}`,
        JSON.stringify(result),
        60,
      );
      expect(searchesSurfacedQb.getRawMany).toHaveBeenCalled();
      expect(searchDrivenViewsQb.getRawMany).toHaveBeenCalled();
    });

    it('returns conversion_rate 0 when no searches surfaced the profile', async () => {
      const searchesSurfacedQb = createQueryBuilderMock();
      const searchDrivenViewsQb = createQueryBuilderMock();
      searchesSurfacedQb.getRawMany.mockResolvedValue([]);
      searchDrivenViewsQb.getRawMany.mockResolvedValue([]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getSearchConversionStats('user-id', {});

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
      searchesSurfacedQb.getRawMany.mockResolvedValue([
        { searchId: 'search-1' },
        { searchId: 'search-2' },
        { searchId: 'search-3' },
      ]);
      searchDrivenViewsQb.getRawMany.mockResolvedValue([
        { referrerSearchId: 'search-2' },
      ]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue('{bad json');

      const result = await service.getSearchConversionStats('user-id', {});

      expect(result).toEqual({
        searches_surfaced: 3,
        search_driven_views: 1,
        conversion_rate: 1 / 3,
      });
      expect(eventRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(redisService.set).toHaveBeenCalledWith(
        `analytics:search-conversions:profile-id:${DEFAULT_RANGE_KEY}`,
        JSON.stringify(result),
        60,
      );
    });

    it('logs Redis read errors and recomputes without throwing', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const searchesSurfacedQb = createQueryBuilderMock();
      const searchDrivenViewsQb = createQueryBuilderMock();
      searchesSurfacedQb.getRawMany.mockResolvedValue([]);
      searchDrivenViewsQb.getRawMany.mockResolvedValue([]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockRejectedValue(new Error('read failed'));

      await expect(
        service.getSearchConversionStats('user-id', {}),
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
      searchesSurfacedQb.getRawMany.mockResolvedValue([
        { searchId: 'search-1' },
        { searchId: 'search-2' },
        { searchId: 'search-3' },
        { searchId: 'search-4' },
      ]);
      searchDrivenViewsQb.getRawMany.mockResolvedValue([
        { referrerSearchId: 'search-1' },
        { referrerSearchId: 'search-3' },
      ]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);
      redisService.set.mockRejectedValue(new Error('write failed'));

      await expect(
        service.getSearchConversionStats('user-id', {}),
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

    it('counts one converted search once when it drives multiple profile views', async () => {
      const searchesSurfacedQb = createQueryBuilderMock();
      const searchDrivenViewsQb = createQueryBuilderMock();
      searchesSurfacedQb.getRawMany.mockResolvedValue([
        { searchId: 'search-1' },
      ]);
      searchDrivenViewsQb.getRawMany.mockResolvedValue([
        { referrerSearchId: 'search-1' },
        { referrerSearchId: 'search-1' },
        { referrerSearchId: 'search-1' },
      ]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getSearchConversionStats('user-id', {});

      expect(result).toEqual({
        searches_surfaced: 1,
        search_driven_views: 1,
        conversion_rate: 1,
      });
    });

    it('excludes referrerSearchIds that did not surface this profile in range', async () => {
      const searchesSurfacedQb = createQueryBuilderMock();
      const searchDrivenViewsQb = createQueryBuilderMock();
      searchesSurfacedQb.getRawMany.mockResolvedValue([
        { searchId: 'search-1' },
        { searchId: 'search-2' },
      ]);
      searchDrivenViewsQb.getRawMany.mockResolvedValue([
        { referrerSearchId: 'search-1' },
        { referrerSearchId: 'orphan-search' },
      ]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(searchesSurfacedQb as never)
        .mockReturnValueOnce(searchDrivenViewsQb as never);
      profileRepo.findOne.mockResolvedValue(profile);
      redisService.get.mockResolvedValue(null);

      const result = await service.getSearchConversionStats('user-id', {});

      expect(result).toEqual({
        searches_surfaced: 2,
        search_driven_views: 1,
        conversion_rate: 0.5,
      });
    });
  });

  describe('getInviteConversionStats', () => {
    it('returns cached JSON without querying events', async () => {
      const cached = {
        invites_sent: 5,
        invites_claimed: 2,
        conversion_rate: 0.4,
      };
      redisService.get.mockResolvedValue(JSON.stringify(cached));

      await expect(
        service.getInviteConversionStats('user-id', {}),
      ).resolves.toEqual(cached);

      expect(redisService.get).toHaveBeenCalledWith(
        `analytics:invite-conversions:user-id:${DEFAULT_RANGE_KEY}`,
      );
      expect(eventRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('computes conversion stats, dedupes invite IDs, and caches the result on cache miss', async () => {
      const sentQb = createQueryBuilderMock();
      const claimedQb = createQueryBuilderMock();
      sentQb.getRawMany.mockResolvedValue([
        { inviteId: 'invite-1' },
        { inviteId: 'invite-1' }, // duplicate — should count once
        { inviteId: 'invite-2' },
        { inviteId: 'invite-3' },
      ]);
      claimedQb.getRawMany.mockResolvedValue([
        { inviteId: 'invite-1' },
        { inviteId: 'invite-1' }, // duplicate — should count once
        { inviteId: 'orphan-invite' }, // not in sent set — should be excluded
      ]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(sentQb as never)
        .mockReturnValueOnce(claimedQb as never);
      redisService.get.mockResolvedValue(null);

      const result = await service.getInviteConversionStats('user-id', {});

      expect(result).toEqual({
        invites_sent: 3,
        invites_claimed: 1,
        conversion_rate: 1 / 3,
      });
      expect(sentQb.where).toHaveBeenCalledWith('e."eventType" = :type', {
        type: EventType.INVITE_SENT,
      });
      expect(sentQb.andWhere).toHaveBeenCalledWith('e."actorId" = :userId', {
        userId: 'user-id',
      });
      expect(sentQb.andWhere).toHaveBeenCalledWith('e."occurredAt" >= :start', {
        start: DEFAULT_START,
      });
      expect(sentQb.andWhere).toHaveBeenCalledWith('e."occurredAt" <= :end', {
        end: DEFAULT_END,
      });
      expect(claimedQb.where).toHaveBeenCalledWith('e."eventType" = :type', {
        type: EventType.INVITE_CLAIMED,
      });
      expect(claimedQb.andWhere).toHaveBeenCalledWith(
        `e.metadata->>'inviterUserId' = :userId`,
        { userId: 'user-id' },
      );
      expect(redisService.set).toHaveBeenCalledWith(
        `analytics:invite-conversions:user-id:${DEFAULT_RANGE_KEY}`,
        JSON.stringify(result),
        60,
      );
    });

    it('returns conversion_rate 0, not NaN, when no invites were sent', async () => {
      const sentQb = createQueryBuilderMock();
      const claimedQb = createQueryBuilderMock();
      sentQb.getRawMany.mockResolvedValue([]);
      claimedQb.getRawMany.mockResolvedValue([]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(sentQb as never)
        .mockReturnValueOnce(claimedQb as never);
      redisService.get.mockResolvedValue(null);

      const result = await service.getInviteConversionStats('user-id', {});

      expect(result).toEqual({
        invites_sent: 0,
        invites_claimed: 0,
        conversion_rate: 0,
      });
      expect(Number.isNaN(result.conversion_rate)).toBe(false);
    });

    it('excludes claimed invite IDs not present in the sent set within range', async () => {
      const sentQb = createQueryBuilderMock();
      const claimedQb = createQueryBuilderMock();
      sentQb.getRawMany.mockResolvedValue([{ inviteId: 'invite-1' }]);
      claimedQb.getRawMany.mockResolvedValue([
        { inviteId: 'invite-1' },
        { inviteId: 'invite-outside-range' },
      ]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(sentQb as never)
        .mockReturnValueOnce(claimedQb as never);
      redisService.get.mockResolvedValue(null);

      const result = await service.getInviteConversionStats('user-id', {});

      expect(result).toEqual({
        invites_sent: 1,
        invites_claimed: 1,
        conversion_rate: 1,
      });
    });

    it('falls through to recompute when cached JSON is malformed', async () => {
      const sentQb = createQueryBuilderMock();
      const claimedQb = createQueryBuilderMock();
      sentQb.getRawMany.mockResolvedValue([
        { inviteId: 'invite-1' },
        { inviteId: 'invite-2' },
      ]);
      claimedQb.getRawMany.mockResolvedValue([{ inviteId: 'invite-1' }]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(sentQb as never)
        .mockReturnValueOnce(claimedQb as never);
      redisService.get.mockResolvedValue('{bad json');

      const result = await service.getInviteConversionStats('user-id', {});

      expect(result).toEqual({
        invites_sent: 2,
        invites_claimed: 1,
        conversion_rate: 0.5,
      });
      expect(eventRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(redisService.set).toHaveBeenCalledWith(
        `analytics:invite-conversions:user-id:${DEFAULT_RANGE_KEY}`,
        JSON.stringify(result),
        60,
      );
    });

    it('logs Redis read errors and recomputes without throwing', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const sentQb = createQueryBuilderMock();
      const claimedQb = createQueryBuilderMock();
      sentQb.getRawMany.mockResolvedValue([]);
      claimedQb.getRawMany.mockResolvedValue([]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(sentQb as never)
        .mockReturnValueOnce(claimedQb as never);
      redisService.get.mockRejectedValue(new Error('read failed'));

      await expect(
        service.getInviteConversionStats('user-id', {}),
      ).resolves.toEqual({
        invites_sent: 0,
        invites_claimed: 0,
        conversion_rate: 0,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        'Redis cache read failed: read failed',
      );
      warnSpy.mockRestore();
    });

    it('logs Redis write errors without throwing', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const sentQb = createQueryBuilderMock();
      const claimedQb = createQueryBuilderMock();
      sentQb.getRawMany.mockResolvedValue([
        { inviteId: 'invite-1' },
        { inviteId: 'invite-2' },
      ]);
      claimedQb.getRawMany.mockResolvedValue([{ inviteId: 'invite-2' }]);
      eventRepo.createQueryBuilder
        .mockReturnValueOnce(sentQb as never)
        .mockReturnValueOnce(claimedQb as never);
      redisService.get.mockResolvedValue(null);
      redisService.set.mockRejectedValue(new Error('write failed'));

      await expect(
        service.getInviteConversionStats('user-id', {}),
      ).resolves.toEqual({
        invites_sent: 2,
        invites_claimed: 1,
        conversion_rate: 0.5,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        'Redis cache write failed: write failed',
      );
      warnSpy.mockRestore();
    });
  });
});
