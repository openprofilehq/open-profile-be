jest.mock('../../config/env', () => ({
  env: {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../common/redis/redis.service';
import { SearchAction, PaginatedSearchResult } from './actions/search.action';
import { SearchService } from './search.service';
import { EventsService } from '../events/events.service';
import { EventType } from '../events/entities/event.entity';

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

    await expect(service.searchProfiles(dto)).resolves.toEqual(result);

    expect(redisService.get).toHaveBeenCalledWith('search:ada:page=2:limit=10');
    expect(searchAction.searchProfiles).not.toHaveBeenCalled();
    expect(redisService.set).not.toHaveBeenCalled();
    expect(eventsService.recordEvent).toHaveBeenCalledWith({
      eventType: EventType.SEARCH_PERFORMED,
      actorId: undefined,
      metadata: { query: 'Ada' },
    });
  });

  it('caches action results on cache miss', async () => {
    redisService.get.mockResolvedValue(null);
    searchAction.searchProfiles.mockResolvedValue(result);

    await expect(service.searchProfiles(dto, 'user-id')).resolves.toEqual(
      result,
    );

    expect(searchAction.searchProfiles).toHaveBeenCalledWith(dto);
    expect(eventsService.recordEvent).toHaveBeenCalledWith({
      eventType: EventType.SEARCH_PERFORMED,
      actorId: 'user-id',
      metadata: { query: 'Ada' },
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

  it('deletes matching cache keys by lowercased query pattern', async () => {
    await service.invalidateSearchCache('Ada');

    expect(redisService.delByPattern).toHaveBeenCalledWith('search:ada:*');
  });
});
