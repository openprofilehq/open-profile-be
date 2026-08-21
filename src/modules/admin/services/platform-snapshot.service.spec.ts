import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../../common/redis/redis.service';
import { PlatformSnapshotAction } from '../actions/platform-snapshot.action';
import { RollupProgressAction } from '../actions/rollup-progress.action';
import { PlatformSnapshotService } from './platform-snapshot.service';

describe('PlatformSnapshotService', () => {
  let service: PlatformSnapshotService;
  let snapshotAction: {
    computeAndUpsert: jest.Mock;
  };
  let progressAction: {
    setSnapshotProgress: jest.Mock;
  };
  let redis: {
    set: jest.Mock;
    del: jest.Mock;
    expire: jest.Mock;
  };

  beforeEach(async () => {
    snapshotAction = { computeAndUpsert: jest.fn() };
    progressAction = { setSnapshotProgress: jest.fn() };
    redis = {
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn(),
      expire: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformSnapshotService,
        { provide: PlatformSnapshotAction, useValue: snapshotAction },
        { provide: RollupProgressAction, useValue: progressAction },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(PlatformSnapshotService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('acquires the lock, computes the snapshot, and releases the lock', async () => {
    const periodDate = new Date('2026-07-21T00:00:00.000Z');

    await service.runDailySnapshot(periodDate);

    expect(redis.set).toHaveBeenCalledWith(
      'metrics:snapshot:daily:lock',
      '1',
      expect.any(Number),
      true,
    );
    expect(snapshotAction.computeAndUpsert).toHaveBeenCalledWith(periodDate);
    expect(progressAction.setSnapshotProgress).toHaveBeenCalledWith(
      periodDate,
      'success',
    );
    expect(redis.del).toHaveBeenCalledWith('metrics:snapshot:daily:lock');
  });

  it('defaults the period date to now', async () => {
    await service.runDailySnapshot();

    expect(snapshotAction.computeAndUpsert).toHaveBeenCalledWith(
      expect.any(Date),
    );
  });

  it('skips the run when the lock is already held', async () => {
    redis.set.mockResolvedValue(false);

    await service.runDailySnapshot();

    expect(snapshotAction.computeAndUpsert).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('releases the lock and records error status when the computation fails', async () => {
    snapshotAction.computeAndUpsert.mockRejectedValue(new Error('boom'));

    await expect(service.runDailySnapshot()).rejects.toThrow('boom');
    expect(progressAction.setSnapshotProgress).toHaveBeenCalledWith(
      expect.any(Date),
      'error',
    );
    expect(redis.del).toHaveBeenCalledWith('metrics:snapshot:daily:lock');
  });
});
