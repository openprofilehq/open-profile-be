import { resolveAuthCookieOptions } from './auth-cookie-policy';

describe('resolveAuthCookieOptions', () => {
  it('uses backend shared domain and strict SameSite in production', () => {
    expect(
      resolveAuthCookieOptions('production', '.open-profile.hng14.com'),
    ).toEqual({
      secure: true,
      sameSite: 'strict',
      path: '/',
      domain: '.open-profile.hng14.com',
    });
  });

  it('uses shared domain and none SameSite in staging for cross-origin frontends', () => {
    expect(
      resolveAuthCookieOptions('staging', 'staging.open-profile.hng14.com'),
    ).toEqual({
      secure: true,
      sameSite: 'none',
      path: '/',
      domain: 'staging.open-profile.hng14.com',
    });
  });

  it('omits domain and uses lax SameSite in development', () => {
    expect(resolveAuthCookieOptions('development', '')).toEqual({
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('omits domain and uses lax SameSite in test', () => {
    expect(resolveAuthCookieOptions('test', '')).toEqual({
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });
});
