jest.mock('../../../config/env', () => ({
  env: {
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    JWT_ACCESS_EXPIRES_IN: '15m',
    NODE_ENV: 'test',
    COOKIE_DOMAIN: '',
  },
}));

import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshInProgressException, TokenService } from './token.service';

const RAW = 'raw-refresh-token';
const HASH = crypto.createHash('sha256').update(RAW).digest('hex');
const WINNER_TOKENS = {
  accessToken: 'winner-access',
  refreshToken: 'winner-refresh',
};

describe('TokenService.rotateTokens under contention', () => {
  let jwtService: { signAsync: jest.Mock };
  let repo: Record<string, jest.Mock>;
  let lock: Record<string, jest.Mock>;
  let service: TokenService;

  beforeEach(() => {
    jwtService = { signAsync: jest.fn().mockResolvedValue('new-access') };
    repo = {
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((v: unknown) => v),
      save: jest.fn(),
    };
    lock = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn(),
      storeGrace: jest.fn(),
      readGrace: jest.fn().mockResolvedValue(null),
      waitForGrace: jest.fn().mockResolvedValue(null),
    };
    service = new TokenService(
      jwtService as never,
      repo as never,
      lock as never,
    );
  });

  it('caches the rotated pair under the old token hash', async () => {
    repo.findOne.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'u1',
        email: 'a@b.c',
        role: 'user',
        onboardingComplete: true,
      },
    });

    const result = await service.rotateTokens(RAW);

    expect(lock.storeGrace).toHaveBeenCalledWith(HASH, result);
  });

  it("returns the winner's tokens to a request that lost the lock", async () => {
    lock.acquireLock.mockResolvedValue(false);
    lock.waitForGrace.mockResolvedValue(WINNER_TOKENS);

    await expect(service.rotateTokens(RAW)).resolves.toEqual(WINNER_TOKENS);
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('signals contention, not expiry, when the winner has not finished', async () => {
    lock.acquireLock.mockResolvedValue(false);

    await expect(service.rotateTokens(RAW)).rejects.toBeInstanceOf(
      RefreshInProgressException,
    );
  });

  it('reuses a recent rotation when the old record is already gone', async () => {
    repo.findOne.mockResolvedValue(null);
    lock.readGrace.mockResolvedValue(WINNER_TOKENS);

    await expect(service.rotateTokens(RAW)).resolves.toEqual(WINNER_TOKENS);
  });

  it('still expires a token that was never rotated', async () => {
    repo.findOne.mockResolvedValue(null);

    const err = await service.rotateTokens(RAW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err).not.toBeInstanceOf(RefreshInProgressException);
  });
});
