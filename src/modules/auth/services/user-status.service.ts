import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../../common/redis/redis.service';
import { User, UserStatus } from '../../users/entities/user.entity';
import { userStatusCacheKey } from '../../admin/constants/cache-keys';

const STATUS_CACHE_TTL_SECONDS = 60;
const INACTIVE_STATUSES = new Set<string>([
  UserStatus.BLOCKED,
  UserStatus.SUSPENDED,
  UserStatus.DEACTIVATED,
]);

@Injectable()
export class UserStatusService {
  private readonly logger = new Logger(UserStatusService.name);

  constructor(
    private readonly redis: RedisService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async isActive(userId: string): Promise<boolean> {
    const status = await this.resolveStatus(userId);
    return !INACTIVE_STATUSES.has(status);
  }

  private async resolveStatus(userId: string): Promise<string> {
    const cacheKey = userStatusCacheKey(userId);

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return cached;
    } catch (error) {
      this.logger.warn(
        `Failed to read user status from Redis: ${(error as Error).message}`,
      );
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['status'],
    });

    const status = user?.status ?? UserStatus.ACTIVE;

    try {
      await this.redis.set(cacheKey, status, STATUS_CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(
        `Failed to cache user status in Redis: ${(error as Error).message}`,
      );
    }

    return status;
  }
}
