import { Test, TestingModule } from '@nestjs/testing';
import { MetricsRange } from '../../common/utils/metrics-range.util';
import {
  QUEUE_JOB_NAMES,
  QUEUE_NAMES,
} from '../queue/config/queue-names.constant';
import { QueueService } from '../queue/queue.service';
import { MetricsRollupService } from './services/metrics-rollup.service';
import { AdminMetricsService } from './services/admin-metrics.service';
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
  let metricsService: {
    getSummary: jest.Mock;
    getSearchActivity: jest.Mock;
    getRecentActivity: jest.Mock;
    getPlatformHealth: jest.Mock;
  };

  beforeEach(async () => {
    rollupService = { getWatermarkStatus: jest.fn() };
    queueService = { addJob: jest.fn() };
    metricsService = {
      getSummary: jest.fn(),
      getSearchActivity: jest.fn(),
      getRecentActivity: jest.fn(),
      getPlatformHealth: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminMetricsController],
      providers: [
        { provide: MetricsRollupService, useValue: rollupService },
        { provide: QueueService, useValue: queueService },
        { provide: AdminMetricsService, useValue: metricsService },
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

  describe('getSummary', () => {
    it('delegates to metricsService.getSummary with default range', async () => {
      const summary = {
        totalUsers: { current: 100, previous: 80, change: 25 },
        publishedProfiles: { current: 50, previous: 40, change: 25 },
        profileCompletionRate: { current: 72, previous: 68, change: 4 },
        weeklyActiveProfiles: { current: 30, previous: 25, change: 20 },
        invitesSent: { current: 12, previous: 8, change: 50 },
        invitesClaimed: { current: 5, previous: 3, change: 66.67 },
      };
      metricsService.getSummary.mockResolvedValue(summary);

      const result = await controller.getSummary({ range: undefined });

      expect(metricsService.getSummary).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ success: true, data: summary });
    });
  });

  describe('getSearchActivity', () => {
    it('delegates to metricsService.getSearchActivity', async () => {
      const activity = {
        totalSearches: { current: 42, previous: 35, change: 20 },
        timeseries: [{ date: '2026-08-17', value: 10 }],
      };
      metricsService.getSearchActivity.mockResolvedValue(activity);

      const result = await controller.getSearchActivity({
        range: MetricsRange.LAST_THIRTY_DAYS,
      });

      expect(metricsService.getSearchActivity).toHaveBeenCalledWith(
        MetricsRange.LAST_THIRTY_DAYS,
      );
      expect(result).toEqual({ success: true, data: activity });
    });
  });

  describe('getRecentActivity', () => {
    it('delegates to metricsService.getRecentActivity', async () => {
      const activity = {
        newUsersToday: 5,
        profilesPublishedToday: 2,
        invitesSentToday: 8,
        invitesClaimedToday: 3,
      };
      metricsService.getRecentActivity.mockResolvedValue(activity);

      const result = await controller.getRecentActivity();

      expect(result).toEqual({ success: true, data: activity });
    });
  });

  describe('getPlatformHealth', () => {
    it('delegates to metricsService.getPlatformHealth', async () => {
      const health = {
        profileCompletionRate: { current: 75, previous: 70, change: 5 },
        publishingActivity: [{ date: '2026-08-17', value: 20 }],
      };
      metricsService.getPlatformHealth.mockResolvedValue(health);

      const result = await controller.getPlatformHealth({ range: undefined });

      expect(result).toEqual({ success: true, data: health });
    });
  });
});
