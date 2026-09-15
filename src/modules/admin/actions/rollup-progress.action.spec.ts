import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RollupProgress } from '../entities/rollup-progress.entity';
import { RollupProgressAction } from './rollup-progress.action';

describe('RollupProgressAction', () => {
  let action: RollupProgressAction;
  let progressRepo: {
    findOne: jest.Mock;
    query: jest.Mock;
  };

  beforeEach(async () => {
    progressRepo = { findOne: jest.fn(), query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RollupProgressAction,
        { provide: getRepositoryToken(RollupProgress), useValue: progressRepo },
      ],
    }).compile();

    action = module.get(RollupProgressAction);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProgress', () => {
    it('reads the singleton progress row', async () => {
      progressRepo.findOne.mockResolvedValue({ id: 'singleton' });

      await expect(action.getProgress()).resolves.toEqual({ id: 'singleton' });
      expect(progressRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'singleton' },
      });
    });
  });

  describe('setDailyProgress', () => {
    it('upserts the singleton row with the daily watermark and status', async () => {
      const at = new Date('2026-07-21T00:00:00.000Z');

      await action.setDailyProgress(at, 'success');

      expect(progressRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT ("id") DO UPDATE'),
        ['singleton', at, 'success'],
      );
    });

    it('defaults status to success', async () => {
      const at = new Date('2026-07-21T00:00:00.000Z');

      await action.setDailyProgress(at);

      expect(progressRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT ("id") DO UPDATE'),
        ['singleton', at, 'success'],
      );
    });
  });

  describe('setSnapshotProgress', () => {
    it('upserts the singleton row with the snapshot timestamp and status', async () => {
      const at = new Date('2026-07-21T00:00:00.000Z');

      await action.setSnapshotProgress(at, 'success');

      expect(progressRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('"lastSnapshotAt"'),
        ['singleton', at, 'success'],
      );
    });
  });
});
