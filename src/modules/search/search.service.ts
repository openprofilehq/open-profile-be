import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import {
  SearchAction,
  PaginatedSearchResult,
  SearchProfileRow,
} from './actions/search.action';
import { SearchQueryDto } from './dto/search-query.dto';
import { RedisService } from '../../common/redis/redis.service';
import { EventsService } from '../events/events.service';
import { EventType } from '../events/entities/event.entity';
import { getOrSetAnonymousId } from '../../common/cookies/anonymous-id.util';

type PublicSearchResult = Omit<PaginatedSearchResult, 'results'> & {
  results: Omit<SearchProfileRow, 'id'>[];
  searchId: string;
};

const SEARCH_CACHE_TTL_SECONDS = 300;
const SEARCH_CACHE_PREFIX = 'search:';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly searchAction: SearchAction,
    private readonly redisService: RedisService,
    private readonly eventsService: EventsService,
  ) {}

  async searchProfiles(
    dto: SearchQueryDto,
    actorId?: string,
    req?: Request,
    res?: Response,
  ): Promise<PublicSearchResult> {
    const cacheKey = `${SEARCH_CACHE_PREFIX}${dto.q.toLowerCase()}:page=${dto.page}:limit=${dto.limit}`;
    const anonymousId =
      !actorId && req && res ? getOrSetAnonymousId(req, res) : undefined;
    const searchId = randomUUID();

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit: ${cacheKey}`);
        const result = JSON.parse(cached) as PaginatedSearchResult;
        const resultProfileIds = result.results.map((r) => r.id);
        void this.eventsService
          .recordEvent({
            eventType: EventType.SEARCH_PERFORMED,
            actorId: actorId ?? undefined,
            anonymousId,
            metadata: { query: dto.q, resultProfileIds, searchId },
          })
          .catch(() => {});
        return {
          ...result,
          results: result.results.map(({ id: _id, ...rest }) => rest),
          searchId,
        };
      }
    } catch (error) {
      this.logger.warn(
        `Cache read/parse failed for key ${cacheKey}`,
        error as Error,
      );
    }

    this.logger.debug(`Cache miss: ${cacheKey}`);

    const result = await this.searchAction.searchProfiles(dto);
    const resultProfileIds = result.results.map((r) => r.id);

    void this.eventsService
      .recordEvent({
        eventType: EventType.SEARCH_PERFORMED,
        actorId: actorId ?? undefined,
        anonymousId,
        metadata: { query: dto.q, resultProfileIds, searchId },
      })
      .catch(() => {});
    try {
      await this.redisService.set(
        cacheKey,
        JSON.stringify(result),
        SEARCH_CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `Cache write failed for key ${cacheKey}`,
        error as Error,
      );
    }

    return {
      ...result,
      results: result.results.map(({ id: _id, ...rest }) => rest),
      searchId,
    };
  }

  async invalidateSearchCache(q: string): Promise<void> {
    const pattern = `${SEARCH_CACHE_PREFIX}${q.toLowerCase()}:*`;
    this.logger.debug(`Invalidating cache for pattern: ${pattern}`);
    await this.redisService.delByPattern(pattern);
  }
}
