import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { QUEUE_JOB_NAMES } from '../../queue/config/queue-names.constant';
import { RedisService } from '../../../common/redis/redis.service';
import { MetricsRollupProcessor } from './metrics-rollup.processor';
import { MetricsRollupService } from '../services/metrics-rollup.service';
import { PlatformSnapshotService } from '../services/platform-snapshot.service';
import { ADMIN_METRICS_CACHE_PREFIX } from '../constants/cache-keys';

jest.mock('@t3-oss/env-core', () => ({
  createEnv: () => ({}) as never,
}));

jest.mock('../../../config/env', () => ({
  env: {
    METRICS_BACKFILL_DELAY_MS: 0,
    METRICS_BACKFILL_LAG_THRESHOLD_MS: 7200000,
    METRICS_BACKFILL_MAX_DURATION_MS: 900000,
  },
}));

describe('MetricsRollupProcessor', () => {
  let processor: MetricsRollupProcessor;
  let rollupService: {
    runDailyRollup: jest.Mock;
    runDailyBackfill: jest.Mock;
  };
  let platformSnapshotService: {
    runDailySnapshot: jest.Mock;
  };
  let redis: {
    delByPattern: jest.Mock;
  };

  beforeEach(async () => {
    rollupService = {
      runDailyRollup: jest.fn(),
      runDailyBackfill: jest.fn(),
    };
    platformSnapshotService = {
      runDailySnapshot: jest.fn(),
    };
    redis = {
      delByPattern: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsRollupProcessor,
        { provide: MetricsRollupService, useValue: rollupService },
        { provide: PlatformSnapshotService, useValue: platformSnapshotService },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    processor = module.get(MetricsRollupProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('routes daily-rollup jobs to runDailyRollup', async () => {
    await processor.process({
      name: QUEUE_JOB_NAMES.METRICS.DAILY_ROLLUP,
    } as Job);

    expect(rollupService.runDailyRollup).toHaveBeenCalledTimes(1);
    expect(rollupService.runDailyBackfill).not.toHaveBeenCalled();
  });

  it('routes backfill jobs to runDailyBackfill', async () => {
    await processor.process({ name: QUEUE_JOB_NAMES.METRICS.BACKFILL } as Job);

    expect(rollupService.runDailyBackfill).toHaveBeenCalledTimes(1);
    expect(rollupService.runDailyRollup).not.toHaveBeenCalled();
  });

  it('routes platform-snapshot jobs to runDailySnapshot', async () => {
    await processor.process({
      name: QUEUE_JOB_NAMES.METRICS.PLATFORM_SNAPSHOT,
    } as Job);

    expect(platformSnapshotService.runDailySnapshot).toHaveBeenCalledTimes(1);
    expect(rollupService.runDailyRollup).not.toHaveBeenCalled();
    expect(rollupService.runDailyBackfill).not.toHaveBeenCalled();
  });

  it('throws for unknown job names', async () => {
    await expect(processor.process({ name: 'nope' } as Job)).rejects.toThrow(
      'Unknown metrics rollup job: nope',
    );
  });

  it('invalidates admin metrics cache after successful daily-rollup', async () => {
    await processor.process({
      name: QUEUE_JOB_NAMES.METRICS.DAILY_ROLLUP,
    } as Job);

    expect(redis.delByPattern).toHaveBeenCalledWith(
      `${ADMIN_METRICS_CACHE_PREFIX}*`,
    );
  });

  it('invalidates admin metrics cache after successful backfill', async () => {
    await processor.process({
      name: QUEUE_JOB_NAMES.METRICS.BACKFILL,
    } as Job);

    expect(redis.delByPattern).toHaveBeenCalledWith(
      `${ADMIN_METRICS_CACHE_PREFIX}*`,
    );
  });

  it('invalidates admin metrics cache after successful platform-snapshot', async () => {
    await processor.process({
      name: QUEUE_JOB_NAMES.METRICS.PLATFORM_SNAPSHOT,
    } as Job);

    expect(redis.delByPattern).toHaveBeenCalledWith(
      `${ADMIN_METRICS_CACHE_PREFIX}*`,
    );
  });

  it('gracefully handles cache invalidation failure', async () => {
    redis.delByPattern.mockRejectedValue(new Error('Redis down'));

    await expect(
      processor.process({
        name: QUEUE_JOB_NAMES.METRICS.DAILY_ROLLUP,
      } as Job),
    ).resolves.toBeUndefined();

    expect(rollupService.runDailyRollup).toHaveBeenCalledTimes(1);
  });
});
