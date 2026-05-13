import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../../config/env';

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(env.REDIS_URL);
  }

  async isAllowed(
    key: string,
    maxAttempts: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return count <= maxAttempts;
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
