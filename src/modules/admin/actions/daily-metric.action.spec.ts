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

  describe('sumByTypeInWindow', () => {
    it('returns the sum of counts for the metric type in the window', async () => {
      const start = new Date('2026-08-17T00:00:00.000Z');
      const end = new Date('2026-08-24T00:00:00.000Z');
      metricRepo.query.mockResolvedValue([{ total: '42' }]);

      await expect(
        action.sumByTypeInWindow('search-events', start, end),
      ).resolves.toBe(42);

      const [sql, params] = metricRepo.query.mock.calls[0];
      expect(sql).toContain('SELECT COALESCE(SUM("count"), 0)');
      expect(sql).toContain('FROM daily_metrics');
      expect(sql).toContain('"metricType" = $1');
      expect(params).toEqual(['search-events', start, end]);
    });
  });

  describe('timeseriesByTypeInWindow', () => {
    it('returns daily breakdown ordered by date', async () => {
      const start = new Date('2026-08-17T00:00:00.000Z');
      const end = new Date('2026-08-20T00:00:00.000Z');
      metricRepo.query.mockResolvedValue([
        { date: '2026-08-17', value: '10' },
        { date: '2026-08-18', value: '15' },
        { date: '2026-08-19', value: '8' },
      ]);

      await expect(
        action.timeseriesByTypeInWindow('profile-views', start, end),
      ).resolves.toEqual([
        { date: '2026-08-17', value: 10 },
        { date: '2026-08-18', value: 15 },
        { date: '2026-08-19', value: 8 },
      ]);

      const [sql, params] = metricRepo.query.mock.calls[0];
      expect(sql).toContain('ORDER BY "periodDate" ASC');
      expect(params).toEqual(['profile-views', start, end]);
    });
  });
});
