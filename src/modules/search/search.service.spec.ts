jest.mock('../../config/env', () => ({
  env: {},
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'search-id'),
}));

jest.mock('../../common/cookies/anonymous-id.util', () => ({
  getOrSetAnonymousId: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { RedisService } from '../../common/redis/redis.service';
import { SearchAction, PaginatedSearchResult } from './actions/search.action';
import { SearchService } from './search.service';
import { EventsService } from '../events/events.service';
import { EventType } from '../events/entities/event.entity';
import { getOrSetAnonymousId } from '../../common/cookies/anonymous-id.util';

describe('SearchService', () => {
  let service: SearchService;
  let searchAction: jest.Mocked<Pick<SearchAction, 'searchProfiles'>>;
  let redisService: jest.Mocked<
    Pick<RedisService, 'get' | 'set' | 'delByPattern'>
  >;
  let eventsService: jest.Mocked<Pick<EventsService, 'recordEvent'>>;

  const dto = { q: 'Ada', page: 2, limit: 10 };
  const result: PaginatedSearchResult = {
    results: [
      {
        id: '1',
        username: 'ada',
        fullName: 'Ada Lovelace',
        bio: 'Mathematician',
        photoUrl: null,
      },
    ],
    total: 1,
    page: 2,
    limit: 10,
    totalPages: 1,
  };
  const publicResult = {
    ...result,
    results: result.results.map(({ id: _id, ...row }) => row),
  };

  beforeEach(async () => {
    searchAction = {
      searchProfiles: jest.fn(),
    };
    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      delByPattern: jest.fn(),
    };
    eventsService = {
      recordEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: SearchAction, useValue: searchAction },
        { provide: RedisService, useValue: redisService },
        { provide: EventsService, useValue: eventsService },
      ],
    }).compile();

    service = module.get(SearchService);
  });

  it('returns cached search results without calling the action', async () => {
    redisService.get.mockResolvedValue(JSON.stringify(result));

    await expect(service.searchProfiles(dto)).resolves.toEqual({
      ...publicResult,
      searchId: 'search-id',
    });

    expect(redisService.get).toHaveBeenCalledWith('search:ada:page=2:limit=10');
    expect(searchAction.searchProfiles).not.toHaveBeenCalled();
    expect(redisService.set).not.toHaveBeenCalled();
    expect(eventsService.recordEvent).toHaveBeenCalledWith({
      eventType: EventType.SEARCH_PERFORMED,
      actorId: undefined,
      anonymousId: undefined,
      metadata: {
        query: 'Ada',
        searchId: 'search-id',
        resultProfileIds: [1],
      },
    });
  });

  it('caches action results on cache miss', async () => {
    redisService.get.mockResolvedValue(null);
    searchAction.searchProfiles.mockResolvedValue(result);

    await expect(service.searchProfiles(dto, 'user-id')).resolves.toEqual({
      ...publicResult,
      searchId: 'search-id',
    });

    expect(searchAction.searchProfiles).toHaveBeenCalledWith(dto);
    expect(eventsService.recordEvent).toHaveBeenCalledWith({
      eventType: EventType.SEARCH_PERFORMED,
      actorId: 'user-id',
      anonymousId: undefined,
      metadata: {
        query: 'Ada',
        searchId: 'search-id',
        resultProfileIds: [1],
      },
    });
    expect(redisService.set).toHaveBeenCalledWith(
      'search:ada:page=2:limit=10',
      JSON.stringify(result),
      300,
    );
  });

  it('uses the raw dto page and limit values when building the cache key', async () => {
    const dtoWithDefaults = { q: 'React', page: 1, limit: 5 };
    redisService.get.mockResolvedValue(null);
    searchAction.searchProfiles.mockResolvedValue({
      ...result,
      page: 1,
      limit: 5,
    });

    await service.searchProfiles(dtoWithDefaults);

    expect(redisService.get).toHaveBeenCalledWith(
      'search:react:page=1:limit=5',
    );
  });

  it('records anonymous search events with the anonymous id cookie value', async () => {
    const req = { cookies: {} } as unknown as Request;
    const res = { cookie: jest.fn() } as unknown as Response;
    (getOrSetAnonymousId as jest.Mock).mockReturnValue('anonymous-id');
    redisService.get.mockResolvedValue(null);
    searchAction.searchProfiles.mockResolvedValue(result);

    await expect(
      service.searchProfiles(dto, undefined, req, res),
    ).resolves.toEqual({
      ...publicResult,
      searchId: 'search-id',
    });

    expect(getOrSetAnonymousId).toHaveBeenCalledWith(req, res);
    expect(eventsService.recordEvent).toHaveBeenCalledWith({
      eventType: EventType.SEARCH_PERFORMED,
      actorId: undefined,
      anonymousId: 'anonymous-id',
      metadata: {
        query: 'Ada',
        searchId: 'search-id',
        resultProfileIds: [1],
      },
    });
  });

  it('deletes matching cache keys by lowercased query pattern', async () => {
    await service.invalidateSearchCache('Ada');

    expect(redisService.delByPattern).toHaveBeenCalledWith('search:ada:*');
  });
});
