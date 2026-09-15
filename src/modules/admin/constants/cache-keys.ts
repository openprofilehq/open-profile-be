export const USER_STATUS_CACHE_KEY_PREFIX = 'user:status:';
export const ADMIN_METRICS_CACHE_PREFIX = 'admin:metrics:';

export const BACKFILL_IN_PROGRESS_KEY = 'admin:metrics:backfill:in-progress';
export const BACKFILL_STARTED_AT_KEY = 'admin:metrics:backfill:started-at';
export const BACKFILL_LAST_CAPPED_AT_KEY =
  'admin:metrics:backfill:last-capped-at';

export function userStatusCacheKey(userId: string): string {
  return `${USER_STATUS_CACHE_KEY_PREFIX}${userId}`;
}
