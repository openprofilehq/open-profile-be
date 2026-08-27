export const USER_STATUS_CACHE_KEY_PREFIX = 'user:status:';

export function userStatusCacheKey(userId: string): string {
  return `${USER_STATUS_CACHE_KEY_PREFIX}${userId}`;
}
