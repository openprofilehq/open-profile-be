jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

jest.mock('../../config/env', () => ({
  env: {},
}));

import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
// Internal subpath (not re-exported from package root) — pinned deliberately so a throttler version bump fails this test loudly rather than silently.
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AuthController } from './auth.controller';

describe('AuthController (decorator audit)', () => {
  it('does not mark PATCH /auth/password as public', () => {
    const reflector = new Reflector();

    const isPublic = reflector.get(
      IS_PUBLIC_KEY,
      AuthController.prototype.changePassword,
    );

    expect(isPublic).toBeUndefined();
  });

  it('applies ThrottlerGuard with the tighter sensitive-route limit to PATCH /auth/password', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthController.prototype.changePassword,
    ) as unknown[] | undefined;

    expect(guards).toContain(ThrottlerGuard);

    const ttl = Reflect.getMetadata(
      THROTTLER_TTL + 'default',
      AuthController.prototype.changePassword,
    );
    const limit = Reflect.getMetadata(
      THROTTLER_LIMIT + 'default',
      AuthController.prototype.changePassword,
    );

    expect(ttl).toBe(60_000);
    expect(limit).toBe(10);
  });
});
