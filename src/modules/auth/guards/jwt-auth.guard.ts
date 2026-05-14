// src/modules/auth/guards/jwt-auth.guard.ts

import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { TokenService } from '../services/token.service';
import { RedisLockService } from '../services/redis-lock.service';
import { JwtPayload } from '../strategies/jwt.strategy';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly redisLockService: RedisLockService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip guard for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const cookies = req.cookies as Record<string, string> | undefined;
    const accessToken = cookies?.['accessToken'];

    // No access token — reject immediately
    if (!accessToken) {
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }

    let payload: JwtPayload & { exp: number };

    try {
      payload = await this.tokenService.verifyAccessToken(accessToken);
    } catch {
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }

    // Silent refresh — if token has less than 3 minutes remaining
    if (this.tokenService.needsSilentRefresh(payload)) {
      const rawRefreshToken = cookies?.['refreshToken'];

      if (rawRefreshToken) {
        const deviceId = this.tokenService.extractDeviceId(req);
        const lockAcquired = await this.redisLockService.acquireLock(
          payload.sub,
        );

        if (lockAcquired) {
          try {
            const tokens = await this.tokenService.rotateTokens(
              rawRefreshToken,
              deviceId,
            );
            this.tokenService.setTokenCookies(res, tokens);
            this.logger.log(`Silent refresh: userId=${payload.sub}`);
          } catch (err) {
            // Silent refresh failed — let the current token continue
            // if it's still valid, otherwise the next request will 401
            this.logger.warn(
              `Silent refresh failed for userId=${payload.sub}`,
              err,
            );
          } finally {
            await this.redisLockService.releaseLock(payload.sub);
          }
        }
        // Lock not acquired means another request is already refreshing — continue
      }
    }

    // Attach user to request for @CurrentUser() decorator
    req['user'] = payload;
    return true;
  }
}
