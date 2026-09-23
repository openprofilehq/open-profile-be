import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { env } from '../../../config/env';

export type RotatedTokens = { accessToken: string; refreshToken: string };

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly LOCK_TTL_SECONDS = 5;
  private readonly GRACE_TTL_SECONDS = 10;
  private readonly GRACE_POLL_ATTEMPTS = 10;
  private readonly GRACE_POLL_INTERVAL_MS = 100;

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
      return true;
    }
  }

  async releaseLock(key: string): Promise<void> {
    const lockKey = `lock:refresh:${key}`;
    await this.redisService.del(lockKey);
  }

  async storeGrace(key: string, tokens: RotatedTokens): Promise<void> {
    try {
      await this.redisService.set(
        this.graceKey(key),
        JSON.stringify(tokens),
        this.GRACE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `[storeGrace] Could not cache rotated tokens: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async readGrace(key: string): Promise<RotatedTokens | null> {
    try {
      const raw = await this.redisService.get(this.graceKey(key));
      return raw ? (JSON.parse(raw) as RotatedTokens) : null;
    } catch {
      return null;
    }
  }

  async waitForGrace(key: string): Promise<RotatedTokens | null> {
    for (let attempt = 0; attempt < this.GRACE_POLL_ATTEMPTS; attempt++) {
      const tokens = await this.readGrace(key);
      if (tokens) return tokens;
      await new Promise((resolve) =>
        setTimeout(resolve, this.GRACE_POLL_INTERVAL_MS),
      );
    }
    return null;
  }

  private graceKey(key: string): string {
    return `refresh:grace:${env.DATABASE_NAME}:${key}`;
  }
}
