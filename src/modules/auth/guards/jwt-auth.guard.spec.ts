jest.mock('../../../config/env', () => ({
  env: {},
}));

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshInProgressException } from '../services/token.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';

type MockRequest = {
  cookies: Record<string, string>;
  headers: Record<string, string>;
  user?: unknown;
};

function buildContext(req: MockRequest): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard account status enforcement', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let tokenService: Record<string, jest.Mock>;
  let userStatusService: { isActive: jest.Mock };
  let guard: JwtAuthGuard;

  const payload = {
    sub: USER_ID,
    email: 'user@example.com',
    role: 'user',
    onboardingComplete: true,
    exp: Math.floor(Date.now() / 1000) + 900,
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    tokenService = {
      verifyAccessToken: jest.fn().mockResolvedValue(payload),
      needsSilentRefresh: jest.fn().mockReturnValue(false),
      rotateTokens: jest.fn().mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      }),
      setTokenCookies: jest.fn(),
      clearTokenCookies: jest.fn(),
    };
    userStatusService = { isActive: jest.fn().mockResolvedValue(true) };
    guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      tokenService as never,
      userStatusService as never,
    );
  });

  it('allows an active user with a valid access token', async () => {
    const req: MockRequest = {
      cookies: { accessToken: 'valid' },
      headers: {},
    };

    await expect(guard.canActivate(buildContext(req))).resolves.toBe(true);
    expect(req.user).toEqual(payload);
  });

  it('rejects a blocked user with a valid access token and clears cookies', async () => {
    userStatusService.isActive.mockResolvedValue(false);
    const req: MockRequest = {
      cookies: { accessToken: 'valid' },
      headers: {},
    };

    await expect(guard.canActivate(buildContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokenService.clearTokenCookies).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('rejects a blocked user whose session is refreshed from the refresh token', async () => {
    userStatusService.isActive.mockResolvedValue(false);
    const req: MockRequest = {
      cookies: { refreshToken: 'raw-refresh' },
      headers: {},
    };

    await expect(guard.canActivate(buildContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokenService.setTokenCookies).not.toHaveBeenCalled();
    expect(tokenService.clearTokenCookies).toHaveBeenCalled();
  });

  it('treats a blocked user as anonymous on a public route', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    userStatusService.isActive.mockResolvedValue(false);
    const req: MockRequest = {
      cookies: { accessToken: 'valid' },
      headers: {},
    };

    await expect(guard.canActivate(buildContext(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('sets new cookies when an active user refreshes', async () => {
    const req: MockRequest = {
      cookies: { refreshToken: 'raw-refresh' },
      headers: {},
    };

    await expect(guard.canActivate(buildContext(req))).resolves.toBe(true);
    expect(tokenService.setTokenCookies).toHaveBeenCalledWith(
      {},
      { accessToken: 'new-access', refreshToken: 'new-refresh' },
    );
    expect(req.user).toEqual(payload);
  });

  it('keeps cookies intact when a refresh loses the race', async () => {
    tokenService.rotateTokens.mockRejectedValue(
      new RefreshInProgressException(),
    );
    const req: MockRequest = {
      cookies: { refreshToken: 'raw-refresh' },
      headers: {},
    };

    await expect(guard.canActivate(buildContext(req))).rejects.toBeInstanceOf(
      RefreshInProgressException,
    );
    expect(tokenService.clearTokenCookies).not.toHaveBeenCalled();
  });

  it('clears cookies when the refresh token is genuinely invalid', async () => {
    tokenService.rotateTokens.mockRejectedValue(
      new UnauthorizedException({ error: 'SESSION_EXPIRED' }),
    );
    const req: MockRequest = {
      cookies: { refreshToken: 'raw-refresh' },
      headers: {},
    };

    await expect(guard.canActivate(buildContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokenService.clearTokenCookies).toHaveBeenCalled();
  });
});
