import type { Response } from 'express';
import { env } from '../../../config/env';

export interface CookieOptions {
  accessToken: string;
  refreshToken: string;
}

/**
 * Set secure HTTP-only cookies for authentication tokens
 * Implements: httpOnly, Secure, SameSite=Strict
 * @param res Express response object
 * @param tokens Object containing accessToken and refreshToken
 */
export function setAuthCookies(res: Response, tokens: CookieOptions): void {
  const isProduction = env.NODE_ENV === 'production';

  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000,
    domain: isProduction ? env.COOKIE_DOMAIN : undefined,
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth/refresh-token',
    domain: isProduction ? env.COOKIE_DOMAIN : undefined,
  });
}
