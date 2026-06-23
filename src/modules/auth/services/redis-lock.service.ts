import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly LOCK_TTL_SECONDS = 5;

  constructor(private readonly redisService: RedisService) {}

  async acquireLock(key: string): Promise<boolean> {
    const lockKey = `lock:refresh:${key}`;
    try {
      const result = await this.redisService.set(
        lockKey,
        '1',
        this.LOCK_TTL_SECONDS,
        true,
      );
      return result === true;
    } catch (err) {
      this.logger.error(
        `[acquireLock] Redis unavailable, failing open: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true; // fail open — let the refresh proceed
    }
  }

  async releaseLock(key: string): Promise<void> {
    const lockKey = `lock:refresh:${key}`;
    await this.redisService.del(lockKey);
  }
}
