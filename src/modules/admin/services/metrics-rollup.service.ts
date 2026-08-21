import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../../common/redis/redis.service';
import { env } from '../../../config/env';
import { DailyMetricAction } from '../actions/daily-metric.action';
import { RollupProgressAction } from '../actions/rollup-progress.action';
import { PlatformDailySnapshot } from '../entities/platform-daily-snapshot.entity';
import {
  BACKFILL_IN_PROGRESS_KEY,
  BACKFILL_LAST_CAPPED_AT_KEY,
  BACKFILL_STARTED_AT_KEY,
} from '../constants/cache-keys';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_TTL_SECONDS = 15 * 60;

/** Fallback window start used when no rollup watermark exists yet: the configured launch date, or the start of the present day (UTC). */
function rollupStartFallback(): Date {
  const configured = env.METRICS_ROLLUP_START_DATE;
  if (configured) {
    const parsed = new Date(`${configured}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

const DAILY_LOCK_KEY = 'metrics:rollup:daily:lock';

export interface RollupWatermarkStatus {
  lastDailyRollupAt: Date | null;
  lagMs: number | null;
}

export interface FullHealthStatus {
  lastDailyRollupAt: Date | null;
  lagMs: number | null;
  rollupLastRunStatus: string | null;
  backfillInProgress: boolean;
  backfillStartedAt: string | null;
  backfillLastCappedAt: string | null;
  snapshotLastRunAt: Date | null;
  snapshotLastRunStatus: string | null;
  snapshotLatestPeriodDate: string | null;
  cacheReachable: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
}

const LAG_THRESHOLD_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class MetricsRollupService {
  private readonly logger = new Logger(MetricsRollupService.name);

  constructor(
    private readonly dailyMetricAction: DailyMetricAction,
    private readonly progressAction: RollupProgressAction,
    @InjectRepository(PlatformDailySnapshot)
    private readonly snapshotRepo: Repository<PlatformDailySnapshot>,
    private readonly redis: RedisService,
  ) {}

  async runDailyRollup(): Promise<void> {
    if (!(await this.acquireLock(DAILY_LOCK_KEY))) {
      this.logger.log('Daily rollup skipped: another run is in-flight');
      return;
    }

    try {
      const now = Date.now();
      const from =
        (await this.progressAction.getProgress())?.lastDailyRollupAt ??
        rollupStartFallback();
      const toMs = Math.min(now, from.getTime() + DAY_MS);

      if (toMs <= from.getTime()) {
        this.logger.log('Daily rollup: already caught up, nothing to do');
        return;
      }

      await this.rollupChunk(from, new Date(toMs));
      await this.progressAction.setDailyProgress(new Date(toMs), 'success');
    } catch (error) {
      await this.progressAction.setDailyProgress(new Date(), 'error');
      throw error;
    } finally {
      await this.releaseLock(DAILY_LOCK_KEY);
    }
  }

  async runDailyBackfill(): Promise<void> {
    if (!(await this.acquireLock(DAILY_LOCK_KEY))) {
      this.logger.log('Daily backfill skipped: another run is in-flight');
      return;
    }

    try {
      await this.setRedisKey(BACKFILL_IN_PROGRESS_KEY, 'true', 0);
      await this.setRedisKey(
        BACKFILL_STARTED_AT_KEY,
        new Date().toISOString(),
        0,
      );

      const startedAt = Date.now();
      let chunks = 0;

      while (true) {
        const now = Date.now();

        if (now - startedAt >= env.METRICS_BACKFILL_MAX_DURATION_MS) {
          this.logger.warn(
            `Daily backfill hit max duration (${env.METRICS_BACKFILL_MAX_DURATION_MS}ms) after ${chunks} chunk(s); re-run to continue`,
          );
          await this.setRedisKey(
            BACKFILL_LAST_CAPPED_AT_KEY,
            new Date().toISOString(),
            0,
          );
          break;
        }

        const progress = await this.progressAction.getProgress();
        const fromMs =
          progress?.lastDailyRollupAt?.getTime() ??
          rollupStartFallback().getTime();
        const toMs = Math.min(now, fromMs + DAY_MS);

        if (toMs <= fromMs) break;

        await this.rollupChunk(new Date(fromMs), new Date(toMs));
        await this.progressAction.setDailyProgress(new Date(toMs), 'success');
        chunks += 1;

        if (toMs >= now) break;

        await this.redis.expire(DAILY_LOCK_KEY, LOCK_TTL_SECONDS);

        if ((env.METRICS_BACKFILL_DELAY_MS ?? 0) > 0) {
          await this.delay(env.METRICS_BACKFILL_DELAY_MS ?? 0);
        }
      }

      this.logger.log(`Daily backfill: processed ${chunks} chunk(s)`);
    } catch (error) {
      await this.progressAction.setDailyProgress(new Date(), 'error');
      throw error;
    } finally {
      await this.clearRedisKey(BACKFILL_IN_PROGRESS_KEY);
      await this.clearRedisKey(BACKFILL_STARTED_AT_KEY);
      await this.releaseLock(DAILY_LOCK_KEY);
    }
  }

  async getWatermarkStatus(): Promise<RollupWatermarkStatus> {
    const progress = await this.progressAction.getProgress();
    const lastDailyRollupAt = progress?.lastDailyRollupAt ?? null;
    const lagMs = lastDailyRollupAt
      ? Date.now() - lastDailyRollupAt.getTime()
      : null;

    return { lastDailyRollupAt, lagMs };
  }

  async getFullHealthStatus(): Promise<FullHealthStatus> {
    const progress = await this.progressAction.getProgress();

    const lastDailyRollupAt = progress?.lastDailyRollupAt ?? null;
    const lagMs = lastDailyRollupAt
      ? Date.now() - lastDailyRollupAt.getTime()
      : null;

    const backfillInProgress = await this.tryGetRedis(BACKFILL_IN_PROGRESS_KEY);
    const backfillStartedAt = await this.tryGetRedis(BACKFILL_STARTED_AT_KEY);
    const backfillLastCappedAt = await this.tryGetRedis(
      BACKFILL_LAST_CAPPED_AT_KEY,
    );

    const cacheReachable = await this.probeCache();

    const snapshotLatestPeriodDate = await this.getLatestSnapshotPeriodDate();

    const status = this.deriveStatus({
      lagMs,
      rollupLastRunStatus: progress?.lastDailyRollupStatus ?? null,
      snapshotLastRunStatus: progress?.lastSnapshotStatus ?? null,
      backfillInProgress: backfillInProgress === 'true',
      cacheReachable,
    });

    return {
      lastDailyRollupAt,
      lagMs,
      rollupLastRunStatus: progress?.lastDailyRollupStatus ?? null,
      backfillInProgress: backfillInProgress === 'true',
      backfillStartedAt,
      backfillLastCappedAt,
      snapshotLastRunAt: progress?.lastSnapshotAt ?? null,
      snapshotLastRunStatus: progress?.lastSnapshotStatus ?? null,
      snapshotLatestPeriodDate,
      cacheReachable,
      status,
    };
  }

  private async rollupChunk(from: Date, to: Date): Promise<void> {
    const rows = await this.dailyMetricAction.rollupWindow(from, to);
    this.logger.log(
      `Daily rollup: ${rows.length} bucket(s) written for [${from.toISOString()}, ${to.toISOString()})`,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async acquireLock(key: string): Promise<boolean> {
    try {
      return await this.redis.set(key, '1', LOCK_TTL_SECONDS, true);
    } catch (err) {
      this.logger.warn(
        `Rollup lock acquire failed, proceeding without lock: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
    }
  }

  private async releaseLock(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(
        `Rollup lock release failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async setRedisKey(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, value, ttlSeconds);
    } catch (err) {
      this.logger.warn(
        `Failed to set Redis key ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async clearRedisKey(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(
        `Failed to clear Redis key ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async tryGetRedis(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch {
      return null;
    }
  }

  private async probeCache(): Promise<boolean> {
    try {
      await this.redis.set('admin:health:ping', '1', 1);
      return true;
    } catch {
      return false;
    }
  }

  private async getLatestSnapshotPeriodDate(): Promise<string | null> {
    try {
      const row = await this.snapshotRepo
        .createQueryBuilder('s')
        .select('s.periodDate', 'period_date')
        .orderBy('s.periodDate', 'DESC')
        .limit(1)
        .getRawOne<{ period_date: string }>();
      return row?.period_date ?? null;
    } catch {
      return null;
    }
  }

  private deriveStatus(opts: {
    lagMs: number | null;
    rollupLastRunStatus: string | null;
    snapshotLastRunStatus: string | null;
    backfillInProgress: boolean;
    cacheReachable: boolean;
  }): 'healthy' | 'degraded' | 'unhealthy' {
    if (
      opts.rollupLastRunStatus === 'error' ||
      opts.snapshotLastRunStatus === 'error'
    ) {
      return 'unhealthy';
    }

    if (opts.lagMs !== null && opts.lagMs > LAG_THRESHOLD_MS) {
      if (opts.backfillInProgress) return 'degraded';
      return 'unhealthy';
    }

    if (!opts.cacheReachable) return 'degraded';

    return 'healthy';
  }
}
