import { Request, Response } from 'express';
import { getOrSetAnonymousId, ANONYMOUS_ID_COOKIE } from './anonymous-id.util';

jest.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'development',
    COOKIE_DOMAIN: '',
  },
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(),
}));

import { randomUUID } from 'crypto';

const FIXED_UUID = '11111111-1111-4111-8111-111111111111';

describe('getOrSetAnonymousId', () => {
  let mockReq: Partial<Request>;
  let mockRes: { cookie: jest.Mock };

  beforeEach(() => {
    (randomUUID as jest.Mock).mockReturnValue(FIXED_UUID);
    mockRes = { cookie: jest.fn() };
  });

  it('returns the existing cookie value without setting a new one', () => {
    mockReq = {
      cookies: { [ANONYMOUS_ID_COOKIE]: 'existing-anon-id' },
    };

    const result = getOrSetAnonymousId(
      mockReq as Request,
      mockRes as unknown as Response,
    );

    expect(result).toBe('existing-anon-id');
    expect(mockRes.cookie).not.toHaveBeenCalled();
  });

  it('generates and sets a new cookie when none exists', () => {
    mockReq = { cookies: {} };

    const result = getOrSetAnonymousId(
      mockReq as Request,
      mockRes as unknown as Response,
    );

    expect(result).toBe(FIXED_UUID);
    expect(mockRes.cookie).toHaveBeenCalledTimes(1);
    expect(mockRes.cookie).toHaveBeenCalledWith(
      ANONYMOUS_ID_COOKIE,
      FIXED_UUID,
      expect.objectContaining({
        httpOnly: true,
        maxAge: expect.any(Number),
        secure: false, // development -> resolveAuthCookieOptions returns secure: false
        sameSite: 'lax', // development -> 'lax'
      }),
    );
  });

  it('handles a missing cookies object entirely (no cookie-parser data yet)', () => {
    mockReq = {};

    const result = getOrSetAnonymousId(
      mockReq as Request,
      mockRes as unknown as Response,
    );

    expect(result).toBe(FIXED_UUID);
    expect(mockRes.cookie).toHaveBeenCalledTimes(1);
  });
});
