import { Injectable, Logger } from '@nestjs/common';
import { SearchAction, PaginatedSearchResult } from './actions/search.action';
import { SearchQueryDto } from './dto/search-query.dto';
import { RedisService } from '../../common/redis/redis.service';

const SEARCH_CACHE_TTL_SECONDS = 300;
const SEARCH_CACHE_PREFIX = 'search:';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly searchAction: SearchAction,
    private readonly redisService: RedisService,
  ) {}

  async searchProfiles(dto: SearchQueryDto): Promise<PaginatedSearchResult> {
    const cacheKey = `${SEARCH_CACHE_PREFIX}${dto.q.toLowerCase()}:page=${dto.page}:limit=${dto.limit}`;

    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit: ${cacheKey}`);
      return JSON.parse(cached) as PaginatedSearchResult;
    }

    this.logger.debug(`Cache miss: ${cacheKey}`);

    const result = await this.searchAction.searchProfiles(dto);

    await this.redisService.set(
      cacheKey,
      JSON.stringify(result),
      SEARCH_CACHE_TTL_SECONDS,
    );

    return result;
  }

  async invalidateSearchCache(q: string): Promise<void> {
    const pattern = `${SEARCH_CACHE_PREFIX}${q.toLowerCase()}:*`;
    this.logger.debug(`Invalidating cache for pattern: ${pattern}`);
    await this.redisService.del(pattern);
  }
}
