import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { resolveAuthCookieOptions } from '../../modules/auth/utils/auth-cookie-policy';

export const ANONYMOUS_ID_COOKIE = 'anonymous_id';
const ANONYMOUS_ID_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365; // 1 year

/**
 * Reads the anonymousId cookie if present; generates and sets a new one
 * (UUID) if absent.
 *
 * Call this only on public, unauthenticated tracking routes. The caller
 * checks for an authenticated actorId first and skips this if one exists.
 *
 * httpOnly since nothing client-side reads this value directly. Reuses
 * the same secure/sameSite/domain policy as auth cookies (TokenService),
 * since this cookie needs to survive the same cross-origin deployment
 * conditions.
 */
export function getOrSetAnonymousId(req: Request, res: Response): string {
  const existing = req.cookies?.[ANONYMOUS_ID_COOKIE] as string | undefined;
  if (existing) return existing;

  const anonymousId = randomUUID();
  const cookieOptions = resolveAuthCookieOptions(
    env.NODE_ENV,
    env.COOKIE_DOMAIN,
  );

  res.cookie(ANONYMOUS_ID_COOKIE, anonymousId, {
    httpOnly: true,
    maxAge: ANONYMOUS_ID_MAX_AGE_MS,
    ...cookieOptions,
  });

  return anonymousId;
}
