import { Test, TestingModule } from '@nestjs/testing';
import {
  QUEUE_JOB_NAMES,
  QUEUE_NAMES,
} from '../queue/config/queue-names.constant';
import { QueueService } from '../queue/queue.service';
import { MetricsRollupService } from './services/metrics-rollup.service';
import { AdminMetricsController } from './admin-metrics.controller';

jest.mock('@t3-oss/env-core', () => ({
  createEnv: () => ({}) as never,
}));

jest.mock('../../config/env', () => ({
  env: {
    METRICS_BACKFILL_DELAY_MS: 0,
    METRICS_BACKFILL_LAG_THRESHOLD_MS: 7200000,
    METRICS_BACKFILL_MAX_DURATION_MS: 900000,
  },
}));

describe('AdminMetricsController', () => {
  let controller: AdminMetricsController;
  let rollupService: {
    getWatermarkStatus: jest.Mock;
  };
  let queueService: {
    addJob: jest.Mock;
  };

  beforeEach(async () => {
    rollupService = { getWatermarkStatus: jest.fn() };
    queueService = { addJob: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminMetricsController],
      providers: [
        { provide: MetricsRollupService, useValue: rollupService },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    controller = module.get(AdminMetricsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getHealth', () => {
    it('returns the rollup watermark status', async () => {
      const status = { lastDailyRollupAt: null, lagMs: null };
      rollupService.getWatermarkStatus.mockResolvedValue(status);

      await expect(controller.getHealth()).resolves.toEqual({
        success: true,
        data: status,
      });
    });
  });

  describe('triggerBackfill', () => {
    it('enqueues the metrics backfill job', async () => {
      queueService.addJob.mockResolvedValue({ id: 'backfill-1' });

      const result = await controller.triggerBackfill();

      expect(queueService.addJob).toHaveBeenCalledWith(
        QUEUE_NAMES.METRICS,
        QUEUE_JOB_NAMES.METRICS.BACKFILL,
        {},
      );
      expect(result).toEqual({
        success: true,
        message: 'Metrics backfill enqueued',
        data: { jobId: 'backfill-1' },
      });
    });
  });
});
