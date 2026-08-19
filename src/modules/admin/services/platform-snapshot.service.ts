import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { PlatformSnapshotAction } from '../actions/platform-snapshot.action';

const SNAPSHOT_LOCK_KEY = 'metrics:snapshot:daily:lock';
const LOCK_TTL_SECONDS = 15 * 60;

@Injectable()
export class PlatformSnapshotService {
  private readonly logger = new Logger(PlatformSnapshotService.name);

  constructor(
    private readonly snapshotAction: PlatformSnapshotAction,
    private readonly redis: RedisService,
  ) {}

  async runDailySnapshot(periodDate: Date = new Date()): Promise<void> {
    if (!(await this.acquireLock())) {
      this.logger.log('Platform snapshot skipped: another run is in-flight');
      return;
    }

    try {
      await this.snapshotAction.computeAndUpsert(periodDate);
      this.logger.log(
        `Platform daily snapshot written for ${periodDate.toISOString().slice(0, 10)}`,
      );
    } finally {
      await this.releaseLock();
    }
  }

  private async acquireLock(): Promise<boolean> {
    try {
      return await this.redis.set(
        SNAPSHOT_LOCK_KEY,
        '1',
        LOCK_TTL_SECONDS,
        true,
      );
    } catch (err) {
      this.logger.warn(
        `Snapshot lock acquire failed, proceeding without lock: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      await this.redis.del(SNAPSHOT_LOCK_KEY);
    } catch (err) {
      this.logger.warn(
        `Snapshot lock release failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
