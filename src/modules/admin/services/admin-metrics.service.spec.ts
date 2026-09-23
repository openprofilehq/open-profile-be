import { Test, TestingModule } from '@nestjs/testing';
import { MetricsRange } from '../../../common/utils/metrics-range.util';
import { RedisService } from '../../../common/redis/redis.service';
import { MetricType } from '../enums/metric-type.enum';
import { DailyMetricAction } from '../actions/daily-metric.action';
import { PlatformSnapshotAction } from '../actions/platform-snapshot.action';
import { InviteMetricAction } from '../actions/invite-metric.action';
import { AdminMetricsService } from './admin-metrics.service';

jest.mock('../../../config/env', () => ({
  env: { REDIS_URL: 'redis://localhost:6379', DATABASE_NAME: 'testdb' },
}));

describe('AdminMetricsService', () => {
  let service: AdminMetricsService;
  let dailyMetricAction: {
    sumByTypeInWindow: jest.Mock;
    timeseriesByTypeInWindow: jest.Mock;
  };
  let snapshotAction: {
    getLatestBefore: jest.Mock;
    computeLive: jest.Mock;
    publishingTimeseriesInWindow: jest.Mock;
  };
  let inviteMetricAction: {
    conversionInWindow: jest.Mock;
  };
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(async () => {
    dailyMetricAction = {
      sumByTypeInWindow: jest.fn(),
      timeseriesByTypeInWindow: jest.fn(),
    };
    snapshotAction = {
      getLatestBefore: jest.fn(),
      computeLive: jest.fn(),
      publishingTimeseriesInWindow: jest.fn(),
    };
    inviteMetricAction = { conversionInWindow: jest.fn() };
    redis = { get: jest.fn(), set: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminMetricsService,
        { provide: DailyMetricAction, useValue: dailyMetricAction },
        { provide: PlatformSnapshotAction, useValue: snapshotAction },
        { provide: InviteMetricAction, useValue: inviteMetricAction },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(AdminMetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSummary', () => {
    it('returns cached data on cache hit', async () => {
      const cached = {
        totalUsers: { current: 100, previous: 90, change: 11.1 },
      };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getSummary(MetricsRange.THIS_WEEK);

      expect(result).toEqual(cached);
      expect(snapshotAction.computeLive).not.toHaveBeenCalled();
    });

    it('computes fresh data on cache miss', async () => {
      redis.get.mockResolvedValue(null);
      snapshotAction.computeLive.mockResolvedValueOnce({
        totalUsers: 100,
        publishedProfiles: 50,
        profileCompletionRate: 72.5,
        weeklyActiveProfiles: 30,
      });
      snapshotAction.getLatestBefore.mockResolvedValueOnce({
        totalUsers: 80,
        publishedProfiles: 40,
        profileCompletionRate: 68.0,
        weeklyActiveProfiles: 25,
      });
      inviteMetricAction.conversionInWindow
        .mockResolvedValueOnce({ sent: '12', claimed: '5' })
        .mockResolvedValueOnce({ sent: '8', claimed: '3' });

      const result = await service.getSummary(MetricsRange.THIS_WEEK);

      expect(result.totalUsers.current).toBe(100);
      expect(result.totalUsers.previous).toBe(80);
      expect(result.totalUsers.change).toBe(25);
      expect(result.profileCompletionRate.change).toBe(4.5);
      expect(result.invitesSent.current).toBe(12);
      expect(result.invitesSent.change).toBe(50);
      expect(redis.set).toHaveBeenCalled();
    });

    it('sets change to null when previous count is 0', async () => {
      redis.get.mockResolvedValue(null);
      snapshotAction.computeLive.mockResolvedValueOnce({
        totalUsers: 50,
        publishedProfiles: 0,
        profileCompletionRate: 0,
        weeklyActiveProfiles: 0,
      });
      snapshotAction.getLatestBefore.mockResolvedValueOnce({
        totalUsers: 50,
        publishedProfiles: 0,
        profileCompletionRate: 0,
        weeklyActiveProfiles: 0,
      });
      inviteMetricAction.conversionInWindow
        .mockResolvedValueOnce({ sent: '0', claimed: '0' })
        .mockResolvedValueOnce({ sent: '0', claimed: '0' });

      const result = await service.getSummary(MetricsRange.THIS_WEEK);

      expect(result.publishedProfiles.change).toBeNull();
      expect(result.invitesSent.change).toBeNull();
    });
  });

  describe('getSearchActivity', () => {
    it('returns total searches with timeseries', async () => {
      redis.get.mockResolvedValue(null);
      dailyMetricAction.sumByTypeInWindow
        .mockResolvedValueOnce(42)
        .mockResolvedValueOnce(35);
      dailyMetricAction.timeseriesByTypeInWindow.mockResolvedValue([
        { date: '2026-08-17', value: 10 },
        { date: '2026-08-18', value: 15 },
      ]);

      const result = await service.getSearchActivity(MetricsRange.THIS_WEEK);

      expect(result.totalSearches.current).toBe(42);
      expect(result.totalSearches.previous).toBe(35);
      expect(result.timeseries).toHaveLength(2);
      expect(dailyMetricAction.sumByTypeInWindow).toHaveBeenCalledWith(
        MetricType.SEARCH_EVENTS,
        expect.any(Date),
        expect.any(Date),
      );
    });
  });

  describe('getRecentActivity', () => {
    it('returns today stats from snapshot and invites', async () => {
      redis.get.mockResolvedValue(null);
      snapshotAction.computeLive.mockResolvedValue({
        newUsersToday: 5,
        profilesPublishedToday: 2,
      });
      inviteMetricAction.conversionInWindow.mockResolvedValue({
        sent: '8',
        claimed: '3',
      });

      const result = await service.getRecentActivity();

      expect(result.newUsersToday).toBe(5);
      expect(result.profilesPublishedToday).toBe(2);
      expect(result.invitesSentToday).toBe(8);
      expect(result.invitesClaimedToday).toBe(3);
    });

    it('returns zeros when nothing happened today', async () => {
      redis.get.mockResolvedValue(null);
      snapshotAction.computeLive.mockResolvedValue({
        newUsersToday: 0,
        profilesPublishedToday: 0,
      });
      inviteMetricAction.conversionInWindow.mockResolvedValue({
        sent: '0',
        claimed: '0',
      });

      const result = await service.getRecentActivity();

      expect(result.newUsersToday).toBe(0);
      expect(result.profilesPublishedToday).toBe(0);
    });
  });

  describe('getPlatformHealth', () => {
    it('returns completion rate with publishing activity timeseries', async () => {
      redis.get.mockResolvedValue(null);
      snapshotAction.computeLive.mockResolvedValueOnce({
        profileCompletionRate: 75.5,
      });
      snapshotAction.getLatestBefore.mockResolvedValueOnce({
        profileCompletionRate: 70.0,
      });
      snapshotAction.publishingTimeseriesInWindow.mockResolvedValue([
        { date: '2026-08-17', value: 20 },
      ]);

      const result = await service.getPlatformHealth(MetricsRange.THIS_WEEK);

      expect(result.profileCompletionRate.current).toBe(75.5);
      expect(result.profileCompletionRate.previous).toBe(70.0);
      expect(result.profileCompletionRate.change).toBe(5.5);
      expect(result.publishingActivity).toHaveLength(1);
    });
  });

  describe('cache error handling', () => {
    it('falls through to computation on Redis read error', async () => {
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      snapshotAction.computeLive.mockResolvedValueOnce({
        totalUsers: 10,
        publishedProfiles: 5,
        profileCompletionRate: 50,
        weeklyActiveProfiles: 3,
      });
      snapshotAction.getLatestBefore.mockResolvedValueOnce(null);
      inviteMetricAction.conversionInWindow
        .mockResolvedValueOnce({ sent: '0', claimed: '0' })
        .mockResolvedValueOnce({ sent: '0', claimed: '0' });

      const result = await service.getSummary(MetricsRange.THIS_WEEK);

      expect(result.totalUsers.current).toBe(10);
    });

    it('does not throw on Redis write error', async () => {
      redis.get.mockResolvedValue(null);
      redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
      snapshotAction.computeLive.mockResolvedValueOnce({
        totalUsers: 10,
        publishedProfiles: 5,
        profileCompletionRate: 50,
        weeklyActiveProfiles: 3,
      });
      snapshotAction.getLatestBefore.mockResolvedValueOnce(null);
      inviteMetricAction.conversionInWindow
        .mockResolvedValueOnce({ sent: '0', claimed: '0' })
        .mockResolvedValueOnce({ sent: '0', claimed: '0' });

      await expect(
        service.getSummary(MetricsRange.THIS_WEEK),
      ).resolves.toBeDefined();
    });
  });
  describe('cache keys', () => {
    it('scopes cache keys to the environment database', async () => {
      redis.get.mockResolvedValue(null);
      dailyMetricAction.sumByTypeInWindow.mockResolvedValue(0);
      dailyMetricAction.timeseriesByTypeInWindow.mockResolvedValue([]);

      await service.getSearchActivity(MetricsRange.THIS_WEEK);

      expect(redis.get).toHaveBeenCalledWith(
        'admin:metrics:testdb:search-activity:this_week',
      );
    });
  });

  describe('all time', () => {
    it('reads live figures and has no previous period', async () => {
      redis.get.mockResolvedValue(null);
      snapshotAction.computeLive.mockResolvedValueOnce({
        totalUsers: 6,
        publishedProfiles: 4,
        profileCompletionRate: 40,
        weeklyActiveProfiles: 2,
      });
      snapshotAction.getLatestBefore.mockResolvedValueOnce(null);
      inviteMetricAction.conversionInWindow
        .mockResolvedValueOnce({ sent: '3', claimed: '1' })
        .mockResolvedValueOnce({ sent: '0', claimed: '0' });

      const result = await service.getSummary(MetricsRange.ALL_TIME);

      expect(result.totalUsers.current).toBe(6);
      expect(result.totalUsers.previous).toBe(0);
      expect(result.totalUsers.change).toBeNull();
      expect(snapshotAction.getLatestBefore).toHaveBeenCalledWith(new Date(0));
    });
  });
});
