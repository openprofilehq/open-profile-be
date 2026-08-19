import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { QUEUE_JOB_NAMES } from '../../queue/config/queue-names.constant';
import { MetricsRollupProcessor } from './metrics-rollup.processor';
import { MetricsRollupService } from '../services/metrics-rollup.service';

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

  beforeEach(async () => {
    rollupService = {
      runDailyRollup: jest.fn(),
      runDailyBackfill: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsRollupProcessor,
        { provide: MetricsRollupService, useValue: rollupService },
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

  it('throws for unknown job names', async () => {
    await expect(processor.process({ name: 'nope' } as Job)).rejects.toThrow(
      'Unknown metrics rollup job: nope',
    );
  });
});
