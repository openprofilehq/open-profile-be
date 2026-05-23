import type { Response } from 'express';
import { env } from '../../../config/env';

export interface CookieOptions {
  accessToken: string;
  refreshToken: string;
}

export function setAuthCookies(res: Response, tokens: CookieOptions): void {
  const isProd = env.NODE_ENV === 'production';
  const isStaging = env.NODE_ENV === 'staging';

  const secure = isProd || isStaging;
  const sameSite = isProd ? 'strict' : 'lax';

  const baseOptions = {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    domain: isProd ? env.COOKIE_DOMAIN : undefined,
  } as const;

  res.cookie('accessToken', tokens.accessToken, {
    ...baseOptions,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    ...baseOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
