export type AuthCookieBaseOptions = {
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: '/';
  domain?: string;
};

/**
 * Resolves httpOnly auth cookie attributes by environment.
 *
 * - production: shared backend parent domain (COOKIE_DOMAIN), SameSite=strict
 * - staging: host-only on the API that set the cookie (no Domain), SameSite=none for localhost frontends
 * - development/test: host-only, lax for local HTTP
 */
export function resolveAuthCookieOptions(
  nodeEnv: string,
  cookieDomain: string,
): AuthCookieBaseOptions {
  if (nodeEnv === 'production') {
    return {
      secure: true,
      sameSite: 'strict',
      path: '/',
      domain: cookieDomain,
    };
  }

  if (nodeEnv === 'staging') {
    return {
      secure: true,
      sameSite: 'none',
      path: '/',
    };
  }

  return {
    secure: false,
    sameSite: 'lax',
    path: '/',
  };
}
