import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RedisService } from '../../../common/redis/redis.service';
import { RollupProgress } from '../entities/rollup-progress.entity';
import { PlatformDailySnapshot } from '../entities/platform-daily-snapshot.entity';
import { DailyMetricAction } from '../actions/daily-metric.action';
import { RollupProgressAction } from '../actions/rollup-progress.action';
import { MetricsRollupService } from './metrics-rollup.service';

jest.mock('@t3-oss/env-core', () => ({
  createEnv: () => ({}) as never,
}));

jest.mock('../../../config/env', () => ({
  env: {
    METRICS_BACKFILL_DELAY_MS: 0,
    METRICS_BACKFILL_LAG_THRESHOLD_MS: 7200000,
    METRICS_BACKFILL_MAX_DURATION_MS: 900000,
    METRICS_ROLLUP_START_DATE: undefined,
  },
}));

import { env as realEnv } from '../../../config/env';

const env = realEnv as unknown as {
  METRICS_BACKFILL_DELAY_MS: number;
  METRICS_BACKFILL_LAG_THRESHOLD_MS: number;
  METRICS_BACKFILL_MAX_DURATION_MS: number;
  METRICS_ROLLUP_START_DATE: string | undefined;
};

const DAY_MS = 24 * 60 * 60 * 1000;

describe('MetricsRollupService', () => {
  let service: MetricsRollupService;
  let dailyMetricAction: {
    rollupWindow: jest.Mock;
  };
  let progressAction: {
    getProgress: jest.Mock;
    setDailyProgress: jest.Mock;
  };
  let snapshotRepo: {
    createQueryBuilder: jest.Mock;
  };
  let redis: {
    set: jest.Mock;
    del: jest.Mock;
    expire: jest.Mock;
    get: jest.Mock;
  };

  const progress = (overrides: Partial<RollupProgress> = {}): RollupProgress =>
    ({
      id: 'singleton',
      lastDailyRollupAt: null,
      lastDailyRollupStatus: 'success',
      lastSnapshotAt: null,
      lastSnapshotStatus: 'success',
      ...overrides,
    }) as RollupProgress;

  beforeEach(async () => {
    dailyMetricAction = { rollupWindow: jest.fn() };
    progressAction = {
      getProgress: jest.fn(),
      setDailyProgress: jest.fn(),
    };
    snapshotRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      }),
    };
    redis = {
      set: jest.fn(),
      del: jest.fn(),
      expire: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsRollupService,
        { provide: DailyMetricAction, useValue: dailyMetricAction },
        { provide: RollupProgressAction, useValue: progressAction },
        {
          provide: getRepositoryToken(PlatformDailySnapshot),
          useValue: snapshotRepo,
        },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(MetricsRollupService);
    env.METRICS_BACKFILL_DELAY_MS = 0;
    env.METRICS_BACKFILL_MAX_DURATION_MS = 900000;
    env.METRICS_ROLLUP_START_DATE = undefined;
    jest.useFakeTimers().setSystemTime(new Date('2026-07-21T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('runDailyRollup', () => {
    it('skips when another run is in-flight (lock not acquired)', async () => {
      redis.set.mockResolvedValue(false);

      await service.runDailyRollup();

      expect(dailyMetricAction.rollupWindow).not.toHaveBeenCalled();
      expect(progressAction.setDailyProgress).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('rolls up a single 1-day chunk from the watermark and advances it', async () => {
      const from = new Date('2026-07-20T00:00:00.000Z');
      const to = new Date('2026-07-21T00:00:00.000Z');
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: from }),
      );
      dailyMetricAction.rollupWindow.mockResolvedValue([
        { metricType: 'profile-views', count: '12' },
      ]);

      await service.runDailyRollup();

      expect(dailyMetricAction.rollupWindow).toHaveBeenCalledTimes(1);
      expect(dailyMetricAction.rollupWindow).toHaveBeenCalledWith(from, to);
      expect(progressAction.setDailyProgress).toHaveBeenCalledWith(
        to,
        'success',
      );
      expect(redis.del).toHaveBeenCalledWith('metrics:rollup:daily:lock');
    });

    it('processes a partial chunk when the watermark is within a day of now', async () => {
      const from = new Date('2026-07-20T18:00:00.000Z');
      const to = new Date('2026-07-21T00:00:00.000Z');
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: from }),
      );
      dailyMetricAction.rollupWindow.mockResolvedValue([]);

      await service.runDailyRollup();

      expect(dailyMetricAction.rollupWindow).toHaveBeenCalledWith(from, to);
      expect(progressAction.setDailyProgress).toHaveBeenCalledWith(
        to,
        'success',
      );
    });

    it('starts from the start of the present day when no watermark exists', async () => {
      jest.setSystemTime(new Date('2026-07-21T12:34:56.789Z'));
      const from = new Date('2026-07-21T00:00:00.000Z');
      const to = new Date('2026-07-21T12:34:56.789Z');
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(progress());
      dailyMetricAction.rollupWindow.mockResolvedValue([]);

      await service.runDailyRollup();

      expect(dailyMetricAction.rollupWindow).toHaveBeenCalledWith(from, to);
      expect(progressAction.setDailyProgress).toHaveBeenCalledWith(
        to,
        'success',
      );
    });

    it('starts from the configured launch date when no watermark exists', async () => {
      jest.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
      env.METRICS_ROLLUP_START_DATE = '2026-07-01';
      const from = new Date('2026-07-01T00:00:00.000Z');
      const to = new Date('2026-07-02T00:00:00.000Z');
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(progress());
      dailyMetricAction.rollupWindow.mockResolvedValue([]);

      await service.runDailyRollup();

      expect(dailyMetricAction.rollupWindow).toHaveBeenCalledWith(from, to);
      expect(progressAction.setDailyProgress).toHaveBeenCalledWith(
        to,
        'success',
      );
    });

    it('releases the lock and records error status when the rollup fails', async () => {
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: new Date('2026-07-20T00:00:00.000Z') }),
      );
      dailyMetricAction.rollupWindow.mockRejectedValue(new Error('boom'));

      await expect(service.runDailyRollup()).rejects.toThrow('boom');
      expect(progressAction.setDailyProgress).toHaveBeenCalledWith(
        expect.any(Date),
        'error',
      );
      expect(redis.del).toHaveBeenCalledWith('metrics:rollup:daily:lock');
    });

    it('releases the lock when already caught up (no-op)', async () => {
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: new Date('2026-07-21T00:00:00.000Z') }),
      );

      await service.runDailyRollup();

      expect(dailyMetricAction.rollupWindow).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith('metrics:rollup:daily:lock');
    });
  });

  describe('runDailyBackfill', () => {
    it('skips when another run is in-flight (lock not acquired)', async () => {
      redis.set.mockResolvedValue(false);

      await service.runDailyBackfill();

      expect(dailyMetricAction.rollupWindow).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('drains the backlog in continuous 1-day chunks until caught up', async () => {
      redis.set.mockResolvedValue(true);
      const day1 = new Date('2026-07-19T00:00:00.000Z');
      const day2 = new Date('2026-07-20T00:00:00.000Z');
      const day3 = new Date('2026-07-21T00:00:00.000Z');
      progressAction.getProgress
        .mockResolvedValueOnce(progress({ lastDailyRollupAt: day1 }))
        .mockResolvedValueOnce(progress({ lastDailyRollupAt: day2 }))
        .mockResolvedValueOnce(progress({ lastDailyRollupAt: day3 }));
      dailyMetricAction.rollupWindow.mockResolvedValue([]);

      await service.runDailyBackfill();

      expect(dailyMetricAction.rollupWindow).toHaveBeenCalledTimes(2);
      expect(dailyMetricAction.rollupWindow).toHaveBeenNthCalledWith(
        1,
        day1,
        day2,
      );
      expect(dailyMetricAction.rollupWindow).toHaveBeenNthCalledWith(
        2,
        day2,
        day3,
      );
      expect(progressAction.setDailyProgress).toHaveBeenNthCalledWith(
        1,
        day2,
        'success',
      );
      expect(progressAction.setDailyProgress).toHaveBeenNthCalledWith(
        2,
        day3,
        'success',
      );
      expect(redis.del).toHaveBeenCalledWith('metrics:rollup:daily:lock');
    });

    it('does nothing when already caught up', async () => {
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: new Date('2026-07-21T00:00:00.000Z') }),
      );

      await service.runDailyBackfill();

      expect(dailyMetricAction.rollupWindow).not.toHaveBeenCalled();
    });

    it('does not start a chunk when the max duration is already exhausted', async () => {
      env.METRICS_BACKFILL_MAX_DURATION_MS = 0;
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: new Date('2026-07-19T00:00:00.000Z') }),
      );

      await service.runDailyBackfill();

      expect(dailyMetricAction.rollupWindow).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith('metrics:rollup:daily:lock');
    });

    it('stops at max duration with backlog remaining and preserves progress', async () => {
      env.METRICS_BACKFILL_MAX_DURATION_MS = 2000;
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: new Date('2026-07-19T00:00:00.000Z') }),
      );
      dailyMetricAction.rollupWindow.mockImplementation(async () => {
        jest.advanceTimersByTime(3000);
        return [];
      });

      await service.runDailyBackfill();

      expect(dailyMetricAction.rollupWindow).toHaveBeenCalledTimes(1);
      expect(progressAction.setDailyProgress).toHaveBeenCalledWith(
        new Date('2026-07-20T00:00:00.000Z'),
        'success',
      );
      expect(redis.del).toHaveBeenCalledWith('metrics:rollup:daily:lock');
    });

    it('records backfillLastCappedAt when max duration is hit', async () => {
      env.METRICS_BACKFILL_MAX_DURATION_MS = 0;
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: new Date('2026-07-19T00:00:00.000Z') }),
      );

      await service.runDailyBackfill();

      expect(redis.set).toHaveBeenCalledWith(
        'admin:metrics:backfill:last-capped-at',
        expect.any(String),
        0,
      );
    });

    it('refreshes the lock TTL between chunks', async () => {
      redis.set.mockResolvedValue(true);
      const day1 = new Date('2026-07-19T00:00:00.000Z');
      const day2 = new Date('2026-07-20T00:00:00.000Z');
      const day3 = new Date('2026-07-21T00:00:00.000Z');
      progressAction.getProgress
        .mockResolvedValueOnce(progress({ lastDailyRollupAt: day1 }))
        .mockResolvedValueOnce(progress({ lastDailyRollupAt: day2 }))
        .mockResolvedValueOnce(progress({ lastDailyRollupAt: day3 }));
      dailyMetricAction.rollupWindow.mockResolvedValue([]);

      await service.runDailyBackfill();

      expect(redis.expire).toHaveBeenCalledWith(
        'metrics:rollup:daily:lock',
        900,
      );
    });

    it('releases the lock when a chunk fails and does not continue', async () => {
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: new Date('2026-07-19T00:00:00.000Z') }),
      );
      dailyMetricAction.rollupWindow.mockRejectedValue(new Error('boom'));

      await expect(service.runDailyBackfill()).rejects.toThrow('boom');
      expect(progressAction.setDailyProgress).toHaveBeenCalledWith(
        expect.any(Date),
        'error',
      );
      expect(redis.del).toHaveBeenCalledWith('metrics:rollup:daily:lock');
    });

    it('throttles between chunks when a delay is configured', async () => {
      env.METRICS_BACKFILL_DELAY_MS = 1000;
      const delaySpy = jest
        .spyOn(
          service as unknown as { delay: (ms: number) => Promise<void> },
          'delay',
        )
        .mockResolvedValue(undefined);
      redis.set.mockResolvedValue(true);
      const day1 = new Date('2026-07-19T00:00:00.000Z');
      const day2 = new Date('2026-07-20T00:00:00.000Z');
      const day3 = new Date('2026-07-21T00:00:00.000Z');
      progressAction.getProgress
        .mockResolvedValueOnce(progress({ lastDailyRollupAt: day1 }))
        .mockResolvedValueOnce(progress({ lastDailyRollupAt: day2 }))
        .mockResolvedValueOnce(progress({ lastDailyRollupAt: day3 }));
      dailyMetricAction.rollupWindow.mockResolvedValue([]);

      await service.runDailyBackfill();

      expect(dailyMetricAction.rollupWindow).toHaveBeenCalledTimes(2);
      expect(delaySpy).toHaveBeenCalledWith(1000);
      expect(redis.expire).toHaveBeenCalled();
    });

    it('sets backfill in-progress key on start and clears on completion', async () => {
      redis.set.mockResolvedValue(true);
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: new Date('2026-07-21T00:00:00.000Z') }),
      );

      await service.runDailyBackfill();

      expect(redis.set).toHaveBeenCalledWith(
        'admin:metrics:backfill:in-progress',
        'true',
        0,
      );
      expect(redis.set).toHaveBeenCalledWith(
        'admin:metrics:backfill:started-at',
        expect.any(String),
        0,
      );
      expect(redis.del).toHaveBeenCalledWith(
        'admin:metrics:backfill:in-progress',
      );
      expect(redis.del).toHaveBeenCalledWith(
        'admin:metrics:backfill:started-at',
      );
    });
  });

  describe('getWatermarkStatus', () => {
    it('returns the watermark and lag in ms', async () => {
      progressAction.getProgress.mockResolvedValue(
        progress({ lastDailyRollupAt: new Date('2026-07-20T00:00:00.000Z') }),
      );

      await expect(service.getWatermarkStatus()).resolves.toEqual({
        lastDailyRollupAt: new Date('2026-07-20T00:00:00.000Z'),
        lagMs: DAY_MS,
      });
    });

    it('returns null lag when no watermark exists', async () => {
      progressAction.getProgress.mockResolvedValue(null);

      await expect(service.getWatermarkStatus()).resolves.toEqual({
        lastDailyRollupAt: null,
        lagMs: null,
      });
    });
  });

  describe('getFullHealthStatus', () => {
    it('returns healthy status when lag is within threshold and last runs succeeded', async () => {
      progressAction.getProgress.mockResolvedValue(
        progress({
          lastDailyRollupAt: new Date('2026-07-20T23:00:00.000Z'),
          lastDailyRollupStatus: 'success',
          lastSnapshotAt: new Date('2026-07-21T02:00:00.000Z'),
          lastSnapshotStatus: 'success',
        }),
      );
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(true);
      snapshotRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ period_date: '2026-07-21' }),
      });

      const result = await service.getFullHealthStatus();

      expect(result.status).toBe('healthy');
      expect(result.rollupLastRunStatus).toBe('success');
      expect(result.snapshotLastRunStatus).toBe('success');
      expect(result.cacheReachable).toBe(true);
      expect(result.backfillInProgress).toBe(false);
      expect(result.snapshotLatestPeriodDate).toBe('2026-07-21');
    });

    it('returns unhealthy when rollup last run errored', async () => {
      progressAction.getProgress.mockResolvedValue(
        progress({
          lastDailyRollupAt: new Date('2026-07-20T00:00:00.000Z'),
          lastDailyRollupStatus: 'error',
        }),
      );
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(true);

      const result = await service.getFullHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.rollupLastRunStatus).toBe('error');
    });

    it('returns unhealthy when snapshot last run errored', async () => {
      progressAction.getProgress.mockResolvedValue(
        progress({
          lastDailyRollupAt: new Date('2026-07-20T23:00:00.000Z'),
          lastDailyRollupStatus: 'success',
          lastSnapshotStatus: 'error',
        }),
      );
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(true);

      const result = await service.getFullHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.snapshotLastRunStatus).toBe('error');
    });

    it('returns degraded when lag is large but backfill is in progress', async () => {
      progressAction.getProgress.mockResolvedValue(
        progress({
          lastDailyRollupAt: new Date('2026-07-19T00:00:00.000Z'),
          lastDailyRollupStatus: 'success',
        }),
      );
      redis.get.mockImplementation(async (key: string) => {
        if (key === 'admin:metrics:backfill:in-progress') return 'true';
        return null;
      });
      redis.set.mockResolvedValue(true);

      const result = await service.getFullHealthStatus();

      expect(result.status).toBe('degraded');
      expect(result.backfillInProgress).toBe(true);
    });

    it('returns unhealthy when lag is large and no backfill is running', async () => {
      progressAction.getProgress.mockResolvedValue(
        progress({
          lastDailyRollupAt: new Date('2026-07-19T00:00:00.000Z'),
          lastDailyRollupStatus: 'success',
        }),
      );
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(true);

      const result = await service.getFullHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.backfillInProgress).toBe(false);
    });

    it('returns degraded when cache is unreachable', async () => {
      progressAction.getProgress.mockResolvedValue(
        progress({
          lastDailyRollupAt: new Date('2026-07-20T23:00:00.000Z'),
          lastDailyRollupStatus: 'success',
          lastSnapshotStatus: 'success',
        }),
      );
      redis.get.mockResolvedValue(null);
      redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
      snapshotRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ period_date: '2026-07-21' }),
      });

      const result = await service.getFullHealthStatus();

      expect(result.status).toBe('degraded');
      expect(result.cacheReachable).toBe(false);
    });
  });
});
