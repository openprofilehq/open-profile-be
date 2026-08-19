import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlatformDailySnapshot } from '../entities/platform-daily-snapshot.entity';
import { PlatformSnapshotAction } from './platform-snapshot.action';

describe('PlatformSnapshotAction', () => {
  let action: PlatformSnapshotAction;
  let snapshotRepo: {
    query: jest.Mock;
  };

  beforeEach(async () => {
    snapshotRepo = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformSnapshotAction,
        {
          provide: getRepositoryToken(PlatformDailySnapshot),
          useValue: snapshotRepo,
        },
      ],
    }).compile();

    action = module.get(PlatformSnapshotAction);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('computeAndUpsert', () => {
    it('runs the idempotent upsert query for the given period date', async () => {
      const periodDate = new Date('2026-07-21T00:00:00.000Z');
      snapshotRepo.query.mockResolvedValue([{ periodDate: '2026-07-21' }]);

      await expect(
        action.computeAndUpsert(periodDate),
      ).resolves.toBeUndefined();

      expect(snapshotRepo.query).toHaveBeenCalledTimes(1);

      const [sql, params] = snapshotRepo.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO platform_daily_snapshot');
      expect(sql).toContain('FROM users u');
      expect(sql).toContain('LEFT JOIN profiles p');
      expect(sql).toContain('ON CONFLICT ("periodDate") DO UPDATE');
      expect(sql).toContain(
        '"profileCompletionRate" = EXCLUDED."profileCompletionRate"',
      );
      expect(sql).toContain('portfolio_items pi WHERE pi."user_id" = u."id"');
      expect(sql).toContain('we."profile_id" = p."id"');
      expect(sql).toContain('e."occurredAt" >= now() - interval \'7 days\'');
      expect(params).toEqual([periodDate]);
    });

    it('writes all snapshot columns', async () => {
      await action.computeAndUpsert('2026-07-21');
      const [sql] = snapshotRepo.query.mock.calls[0];

      for (const column of [
        '"periodDate"',
        '"totalUsers"',
        '"publishedProfiles"',
        '"profileCompletionRate"',
        '"weeklyActiveProfiles"',
        '"newUsersToday"',
        '"profilesPublishedToday"',
        '"flaggedForReview"',
        '"activeSuspensions"',
      ]) {
        expect(sql).toContain(column);
      }
    });
  });
});
