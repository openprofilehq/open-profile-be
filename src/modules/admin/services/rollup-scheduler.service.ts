import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { env } from '../../../config/env';
import {
  QUEUE_JOB_NAMES,
  QUEUE_NAMES,
} from '../../queue/config/queue-names.constant';
import { MetricsRollupService } from './metrics-rollup.service';

const REPEAT_PATTERNS = {
  DAILY: '0 1 * * *',
  SNAPSHOT: '0 2 * * *',
} as const;

@Injectable()
export class RollupScheduler implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(RollupScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.METRICS)
    private readonly metricsQueue: Queue,
    private readonly rollupService: MetricsRollupService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduleRepeatable(
      QUEUE_JOB_NAMES.METRICS.DAILY_ROLLUP,
      REPEAT_PATTERNS.DAILY,
    );

    await this.scheduleRepeatable(
      QUEUE_JOB_NAMES.METRICS.PLATFORM_SNAPSHOT,
      REPEAT_PATTERNS.SNAPSHOT,
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    const { lagMs } = await this.rollupService.getWatermarkStatus();

    if (lagMs === null) {
      this.logger.log(
        'No daily rollup watermark yet; enqueueing metrics catch-up backfill',
      );
      await this.enqueueBackfill();
      return;
    }

    if (lagMs > env.METRICS_BACKFILL_LAG_THRESHOLD_MS) {
      this.logger.log(
        `Daily rollup lag is ${lagMs}ms (threshold ${env.METRICS_BACKFILL_LAG_THRESHOLD_MS}ms); enqueueing catch-up backfill`,
      );
      await this.enqueueBackfill();
      return;
    }

    this.logger.log(
      `Daily rollup lag is ${lagMs}ms — within threshold; skipping backfill`,
    );
  }

  private async enqueueBackfill(): Promise<void> {
    try {
      await this.metricsQueue.add(
        QUEUE_JOB_NAMES.METRICS.BACKFILL,
        {},
        { removeOnComplete: { age: 3600, count: 1000 } },
      );
      this.logger.log('Enqueued metrics catch-up backfill job');
    } catch (err) {
      this.logger.error(
        `Failed to enqueue metrics catch-up backfill: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async scheduleRepeatable(
    jobName: string,
    pattern: string,
  ): Promise<void> {
    try {
      await this.metricsQueue.add(
        jobName,
        {},
        { repeat: { pattern }, removeOnComplete: { age: 3600, count: 1000 } },
      );
      this.logger.log(
        `Scheduled repeatable metrics job ${jobName} (${pattern})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to schedule repeatable metrics job ${jobName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
