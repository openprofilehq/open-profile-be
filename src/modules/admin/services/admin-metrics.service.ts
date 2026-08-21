import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import {
  MetricsRange,
  resolveMetricsRange,
} from '../../../common/utils/metrics-range.util';
import { MetricType } from '../enums/metric-type.enum';
import { DailyMetricAction } from '../actions/daily-metric.action';
import { PlatformSnapshotAction } from '../actions/platform-snapshot.action';
import { InviteMetricAction } from '../actions/invite-metric.action';
import {
  MetricComparisonDto,
  AdminMetricsSummaryDto,
  AdminMetricsSearchActivityDto,
  AdminMetricsRecentActivityDto,
  AdminMetricsPlatformHealthDto,
} from '../dto/admin-metrics-response.dto';

const CACHE_TTL_SECONDS = 300;

@Injectable()
export class AdminMetricsService {
  private readonly logger = new Logger(AdminMetricsService.name);

  constructor(
    private readonly dailyMetricAction: DailyMetricAction,
    private readonly snapshotAction: PlatformSnapshotAction,
    private readonly inviteMetricAction: InviteMetricAction,
    private readonly redis: RedisService,
  ) {}

  async getSummary(
    range: MetricsRange = MetricsRange.THIS_WEEK,
  ): Promise<AdminMetricsSummaryDto> {
    const cacheKey = `admin:metrics:summary:${range}`;
    const cached = await this.tryGetCache<AdminMetricsSummaryDto>(cacheKey);
    if (cached) return cached;

    const { start, end, prevStart, prevEnd } = resolveMetricsRange(range);

    const [currentSnapshot, prevSnapshot] = await Promise.all([
      this.snapshotAction.getLatestBefore(end),
      this.snapshotAction.getLatestBefore(prevEnd),
    ]);

    const [currentInvites, prevInvites] = await Promise.all([
      this.inviteMetricAction.conversionInWindow(start, end),
      this.inviteMetricAction.conversionInWindow(prevStart, prevEnd),
    ]);

    const result: AdminMetricsSummaryDto = {
      totalUsers: this.compareCount(
        currentSnapshot?.totalUsers ?? 0,
        prevSnapshot?.totalUsers ?? 0,
      ),
      publishedProfiles: this.compareCount(
        currentSnapshot?.publishedProfiles ?? 0,
        prevSnapshot?.publishedProfiles ?? 0,
      ),
      profileCompletionRate: this.compareRate(
        currentSnapshot?.profileCompletionRate ?? 0,
        prevSnapshot?.profileCompletionRate ?? 0,
      ),
      weeklyActiveProfiles: this.compareCount(
        currentSnapshot?.weeklyActiveProfiles ?? 0,
        prevSnapshot?.weeklyActiveProfiles ?? 0,
      ),
      invitesSent: this.compareCount(
        Number(currentInvites.sent),
        Number(prevInvites.sent),
      ),
      invitesClaimed: this.compareCount(
        Number(currentInvites.claimed),
        Number(prevInvites.claimed),
      ),
    };

    await this.trySetCache(cacheKey, result);
    return result;
  }

  async getSearchActivity(
    range: MetricsRange = MetricsRange.THIS_WEEK,
  ): Promise<AdminMetricsSearchActivityDto> {
    const cacheKey = `admin:metrics:search-activity:${range}`;
    const cached =
      await this.tryGetCache<AdminMetricsSearchActivityDto>(cacheKey);
    if (cached) return cached;

    const { start, end, prevStart, prevEnd } = resolveMetricsRange(range);

    const [currentTotal, prevTotal, timeseries] = await Promise.all([
      this.dailyMetricAction.sumByTypeInWindow(
        MetricType.SEARCH_EVENTS,
        start,
        end,
      ),
      this.dailyMetricAction.sumByTypeInWindow(
        MetricType.SEARCH_EVENTS,
        prevStart,
        prevEnd,
      ),
      this.dailyMetricAction.timeseriesByTypeInWindow(
        MetricType.SEARCH_EVENTS,
        start,
        end,
      ),
    ]);

    const result: AdminMetricsSearchActivityDto = {
      totalSearches: this.compareCount(currentTotal, prevTotal),
      timeseries: timeseries.map((t) => ({
        date: t.date,
        value: t.value,
      })),
    };

    await this.trySetCache(cacheKey, result);
    return result;
  }

  async getRecentActivity(): Promise<AdminMetricsRecentActivityDto> {
    const cacheKey = 'admin:metrics:recent-activity:today';
    const cached =
      await this.tryGetCache<AdminMetricsRecentActivityDto>(cacheKey);
    if (cached) return cached;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const snapshot = await this.snapshotAction.getLatestBefore(tomorrow);
    const invites = await this.inviteMetricAction.conversionInWindow(
      today,
      tomorrow,
    );

    const result: AdminMetricsRecentActivityDto = {
      newUsersToday: snapshot?.newUsersToday ?? 0,
      profilesPublishedToday: snapshot?.profilesPublishedToday ?? 0,
      invitesSentToday: Number(invites.sent),
      invitesClaimedToday: Number(invites.claimed),
    };

    await this.trySetCache(cacheKey, result);
    return result;
  }

  async getPlatformHealth(
    range: MetricsRange = MetricsRange.THIS_WEEK,
  ): Promise<AdminMetricsPlatformHealthDto> {
    const cacheKey = `admin:metrics:platform-health:${range}`;
    const cached =
      await this.tryGetCache<AdminMetricsPlatformHealthDto>(cacheKey);
    if (cached) return cached;

    const { start, end, prevEnd } = resolveMetricsRange(range);

    const [currentSnapshot, prevSnapshot, publishingTimeseries] =
      await Promise.all([
        this.snapshotAction.getLatestBefore(end),
        this.snapshotAction.getLatestBefore(prevEnd),
        this.snapshotAction.publishingTimeseriesInWindow(start, end),
      ]);

    const result: AdminMetricsPlatformHealthDto = {
      profileCompletionRate: this.compareRate(
        currentSnapshot?.profileCompletionRate ?? 0,
        prevSnapshot?.profileCompletionRate ?? 0,
      ),
      publishingActivity: publishingTimeseries.map((t) => ({
        date: t.date,
        value: t.value,
      })),
    };

    await this.trySetCache(cacheKey, result);
    return result;
  }

  private compareCount(current: number, previous: number): MetricComparisonDto {
    return {
      current,
      previous,
      change:
        previous === 0
          ? null
          : Math.round(((current - previous) / previous) * 10000) / 100,
    };
  }

  private compareRate(current: number, previous: number): MetricComparisonDto {
    return {
      current,
      previous,
      change: Math.round((current - previous) * 100) / 100,
    };
  }

  private async tryGetCache<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(
        `Cache read failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async trySetCache(key: string, value: unknown): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(
        `Cache write failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
