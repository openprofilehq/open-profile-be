import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class StaleUsersCleanupService {
  private readonly logger = new Logger(StaleUsersCleanupService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanStaleUnverifiedUsers(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const result = await this.userRepository
        .createQueryBuilder()
        .delete()
        .from(User)
        .where('is_verified = :isVerified', { isVerified: false })
        .andWhere(
          '(otp_expires_at IS NULL AND created_at < :cutoff) OR (otp_expires_at < :cutoff)',
          { cutoff },
        )
        .execute();

      if (result.affected && result.affected > 0) {
        this.logger.log(
          `Cleaned up ${result.affected} stale unverified user(s)`,
        );
      }
    } catch (err) {
      this.logger.error(
        'cleanStaleUnverifiedUsers failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
