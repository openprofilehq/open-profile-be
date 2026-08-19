import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DailyMetric } from '../entities/daily-metric.entity';
import { DailyMetricAction } from './daily-metric.action';

describe('DailyMetricAction', () => {
  let action: DailyMetricAction;
  let metricRepo: {
    query: jest.Mock;
  };

  beforeEach(async () => {
    metricRepo = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyMetricAction,
        { provide: getRepositoryToken(DailyMetric), useValue: metricRepo },
      ],
    }).compile();

    action = module.get(DailyMetricAction);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('rollupWindow', () => {
    it('runs the idempotent upsert query for the given window', async () => {
      const from = new Date('2026-07-20T00:00:00.000Z');
      const to = new Date('2026-07-21T00:00:00.000Z');
      const rows = [
        { metricType: 'profile-views', count: '12' },
        { metricType: 'search-events', count: '4' },
      ];
      metricRepo.query.mockResolvedValue(rows);

      await expect(action.rollupWindow(from, to)).resolves.toEqual(rows);
      expect(metricRepo.query).toHaveBeenCalledTimes(1);

      const [sql, params] = metricRepo.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO daily_metrics');
      expect(sql).toContain('GROUP BY 1, 2');
      expect(sql).toContain(
        'ON CONFLICT ("metricType", "periodDate") DO UPDATE',
      );
      expect(sql).toContain('SET "count" = EXCLUDED."count"');
      expect(params).toEqual([from, to]);
    });
  });
});
