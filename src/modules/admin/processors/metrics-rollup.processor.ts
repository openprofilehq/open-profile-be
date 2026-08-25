import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  QUEUE_JOB_NAMES,
  QUEUE_NAMES,
} from '../../queue/config/queue-names.constant';
import { MetricsRollupService } from '../services/metrics-rollup.service';
import { PlatformSnapshotService } from '../services/platform-snapshot.service';

@Processor(QUEUE_NAMES.METRICS, { concurrency: 1 })
export class MetricsRollupProcessor extends WorkerHost {
  private readonly logger = new Logger(MetricsRollupProcessor.name);

  constructor(
    private readonly rollupService: MetricsRollupService,
    private readonly platformSnapshotService: PlatformSnapshotService,
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
}
