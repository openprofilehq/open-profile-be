import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  QUEUE_JOB_NAMES,
  QUEUE_NAMES,
} from '../../queue/config/queue-names.constant';
import { RollupScheduler } from './rollup-scheduler.service';
import { MetricsRollupService } from './metrics-rollup.service';

jest.mock('../../../config/env', () => ({
  env: {
    METRICS_BACKFILL_DELAY_MS: 0,
    METRICS_BACKFILL_LAG_THRESHOLD_MS: 7200000,
    METRICS_BACKFILL_MAX_DURATION_MS: 900000,
  },
}));

import { env as realEnv } from '../../../config/env';

const env = realEnv as unknown as {
  METRICS_BACKFILL_LAG_THRESHOLD_MS: number;
};

describe('RollupScheduler', () => {
  let scheduler: RollupScheduler;
  let metricsQueue: {
    add: jest.Mock;
  };
  let rollupService: {
    getWatermarkStatus: jest.Mock;
  };

  beforeEach(async () => {
    metricsQueue = { add: jest.fn().mockResolvedValue({ id: 'job-id' }) };
    rollupService = { getWatermarkStatus: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RollupScheduler,
        { provide: getQueueToken(QUEUE_NAMES.METRICS), useValue: metricsQueue },
        { provide: MetricsRollupService, useValue: rollupService },
      ],
    }).compile();

    scheduler = module.get(RollupScheduler);
    env.METRICS_BACKFILL_LAG_THRESHOLD_MS = 7200000;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('schedules the daily rollup and snapshot jobs on module init', async () => {
      await scheduler.onModuleInit();

      expect(metricsQueue.add).toHaveBeenCalledTimes(2);
      expect(metricsQueue.add).toHaveBeenCalledWith(
        QUEUE_JOB_NAMES.METRICS.DAILY_ROLLUP,
        {},
        expect.objectContaining({ repeat: { pattern: '0 1 * * *' } }),
      );
      expect(metricsQueue.add).toHaveBeenCalledWith(
        QUEUE_JOB_NAMES.METRICS.PLATFORM_SNAPSHOT,
        {},
        expect.objectContaining({ repeat: { pattern: '0 2 * * *' } }),
      );
    });
  });

  describe('onApplicationBootstrap', () => {
    it('enqueues a backfill when no watermark exists yet', async () => {
      rollupService.getWatermarkStatus.mockResolvedValue({
        lastDailyRollupAt: null,
        lagMs: null,
      });

      await scheduler.onApplicationBootstrap();

      expect(metricsQueue.add).toHaveBeenCalledWith(
        QUEUE_JOB_NAMES.METRICS.BACKFILL,
        {},
        expect.any(Object),
      );
    });

    it('enqueues a backfill when lag exceeds the threshold', async () => {
      rollupService.getWatermarkStatus.mockResolvedValue({
        lastDailyRollupAt: new Date('2026-07-20T00:00:00.000Z'),
        lagMs: 8 * 60 * 60 * 1000,
      });

      await scheduler.onApplicationBootstrap();

      expect(metricsQueue.add).toHaveBeenCalledWith(
        QUEUE_JOB_NAMES.METRICS.BACKFILL,
        {},
        expect.any(Object),
      );
    });

    it('does not enqueue a backfill when lag is within threshold', async () => {
      rollupService.getWatermarkStatus.mockResolvedValue({
        lastDailyRollupAt: new Date('2026-07-21T00:00:00.000Z'),
        lagMs: 1000,
      });

      await scheduler.onApplicationBootstrap();

      expect(metricsQueue.add).not.toHaveBeenCalled();
    });
  });
});
