jest.mock('../../config/env', () => ({
  env: {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../common/redis/redis.service';
import { SearchAction, PaginatedSearchResult } from './actions/search.action';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let searchAction: jest.Mocked<Pick<SearchAction, 'searchProfiles'>>;
  let redisService: jest.Mocked<
    Pick<RedisService, 'get' | 'set' | 'delByPattern'>
  >;

  const dto = { q: 'Ada', page: 2, limit: 10 };
  const result: PaginatedSearchResult = {
    results: [
      {
        username: 'ada',
        fullName: 'Ada Lovelace',
        bio: 'Mathematician',
        photoUrl: null,
        isVerified: true,
        skills: ['software'],
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: SearchAction, useValue: searchAction },
        { provide: RedisService, useValue: redisService },
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
  });

  it('caches action results on cache miss', async () => {
    redisService.get.mockResolvedValue(null);
    searchAction.searchProfiles.mockResolvedValue(result);

    await expect(service.searchProfiles(dto)).resolves.toEqual(result);

    expect(searchAction.searchProfiles).toHaveBeenCalledWith(dto);
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
