import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { env } from '../../../config/env';
import { DailyMetricAction } from '../actions/daily-metric.action';
import { RollupProgressAction } from '../actions/rollup-progress.action';

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

@Injectable()
export class MetricsRollupService {
  private readonly logger = new Logger(MetricsRollupService.name);

  constructor(
    private readonly dailyMetricAction: DailyMetricAction,
    private readonly progressAction: RollupProgressAction,
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

      if (toMs <= from.getTime()) return;

      await this.rollupChunk(from, new Date(toMs));
      await this.progressAction.setDailyProgress(new Date(toMs));
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
      const startedAt = Date.now();
      let chunks = 0;

      while (true) {
        const now = Date.now();

        if (now - startedAt >= env.METRICS_BACKFILL_MAX_DURATION_MS) {
          this.logger.warn(
            `Daily backfill hit max duration (${env.METRICS_BACKFILL_MAX_DURATION_MS}ms) after ${chunks} chunk(s); re-run to continue`,
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
        await this.progressAction.setDailyProgress(new Date(toMs));
        chunks += 1;

        if (toMs >= now) break;

        await this.redis.expire(DAILY_LOCK_KEY, LOCK_TTL_SECONDS);

        if ((env.METRICS_BACKFILL_DELAY_MS ?? 0) > 0) {
          await this.delay(env.METRICS_BACKFILL_DELAY_MS ?? 0);
        }
      }

      this.logger.log(`Daily backfill: processed ${chunks} chunk(s)`);
    } finally {
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
}
