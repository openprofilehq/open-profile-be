import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  QUEUE_JOB_NAMES,
  QUEUE_NAMES,
} from '../../queue/config/queue-names.constant';
import { RedisService } from '../../../common/redis/redis.service';
import { MetricsRollupService } from '../services/metrics-rollup.service';
import { PlatformSnapshotService } from '../services/platform-snapshot.service';
import { ADMIN_METRICS_CACHE_PREFIX } from '../constants/cache-keys';

@Processor(QUEUE_NAMES.METRICS, { concurrency: 1 })
export class MetricsRollupProcessor extends WorkerHost {
  private readonly logger = new Logger(MetricsRollupProcessor.name);

  constructor(
    private readonly rollupService: MetricsRollupService,
    private readonly platformSnapshotService: PlatformSnapshotService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case QUEUE_JOB_NAMES.METRICS.DAILY_ROLLUP:
        await this.rollupService.runDailyRollup();
        break;
      case QUEUE_JOB_NAMES.METRICS.BACKFILL:
        await this.rollupService.runDailyBackfill();
        break;
      case QUEUE_JOB_NAMES.METRICS.PLATFORM_SNAPSHOT:
        await this.platformSnapshotService.runDailySnapshot();
        break;
      default:
        throw new Error(`Unknown metrics rollup job: ${String(job.name)}`);
    }

    await this.invalidateMetricsCache();

    this.logger.log(
      `Metrics rollup job ${String(job.name)} (${job.id}) completed`,
    );
  }

  @OnWorkerEvent('failed')
  handleFailed(job: Job, error: Error): void {
    this.logger.error(
      `Metrics rollup job ${String(job.name)} (${job.id}) failed: ${error.message}`,
      error.stack,
    );
  }

  private async invalidateMetricsCache(): Promise<void> {
    try {
      await this.redis.delByPattern(`${ADMIN_METRICS_CACHE_PREFIX}*`);
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate admin metrics cache: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
