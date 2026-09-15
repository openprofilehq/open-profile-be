import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../../common/redis/redis.service';
import { User, UserStatus } from '../../users/entities/user.entity';
import { UserStatusHistory } from '../entities/user-status-history.entity';
import { userStatusCacheKey } from '../constants/cache-keys';
import {
  STATUS_TRANSITIONS,
  UserStatusAction,
} from '../constants/status-transitions';

export interface StatusChangeResult {
  from: UserStatus;
  to: UserStatus;
  changed: boolean;
}

@Injectable()
export class AccountStatusService {
  private readonly logger = new Logger(AccountStatusService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  block(userId: string, actingAdminId: string): Promise<StatusChangeResult> {
    return this.apply(userId, UserStatusAction.BLOCK, actingAdminId);
  }

  suspend(userId: string, actingAdminId: string): Promise<StatusChangeResult> {
    return this.apply(userId, UserStatusAction.SUSPEND, actingAdminId);
  }

  deactivate(
    userId: string,
    actingAdminId: string,
  ): Promise<StatusChangeResult> {
    return this.apply(userId, UserStatusAction.DEACTIVATE, actingAdminId);
  }

  reactivate(
    userId: string,
    actingAdminId: string,
  ): Promise<StatusChangeResult> {
    return this.apply(userId, UserStatusAction.REACTIVATE, actingAdminId);
  }

  flagForReview(
    userId: string,
    actingAdminId: string,
  ): Promise<StatusChangeResult> {
    return this.apply(userId, UserStatusAction.FLAG_FOR_REVIEW, actingAdminId);
  }

  async apply(
    userId: string,
    action: UserStatusAction,
    actingAdminId: string,
  ): Promise<StatusChangeResult> {
    const transition = STATUS_TRANSITIONS[action];

    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === transition.target) {
      return { from: user.status, to: transition.target, changed: false };
    }

    if (!transition.allowedFrom.includes(user.status)) {
      throw new ConflictException(
        `Cannot ${action} a user with status ${user.status}`,
      );
    }

    await this.dataSource.transaction(async (tx) => {
      await tx.getRepository(User).update(userId, {
        status: transition.target,
      });
      await tx.getRepository(UserStatusHistory).insert({
        userId,
        fromStatus: user.status,
        toStatus: transition.target,
        changedBy: actingAdminId,
      });
    });

    await this.redis.del(userStatusCacheKey(userId));
    this.logger.log(
      `User ${userId} status ${user.status} -> ${transition.target} by admin ${actingAdminId}`,
    );

    return { from: user.status, to: transition.target, changed: true };
  }
}
