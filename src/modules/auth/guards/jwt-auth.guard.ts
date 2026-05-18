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
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const cookies = req.cookies as Record<string, string> | undefined;

    // Support both cookie-based (web app) and Authorization header (API clients / Swagger)
    const accessToken =
      cookies?.['accessToken'] ??
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : undefined);

    const rawRefreshToken = cookies?.['refreshToken'];

    // No access token — attempt refresh before rejecting
    if (!accessToken) {
      return this.attemptRefresh(rawRefreshToken, req, res, 'no_access_token');
    }

    let payload: JwtPayload & { exp: number };

    try {
      payload = await this.tokenService.verifyAccessToken(accessToken);
    } catch {
      // Access token invalid or expired — attempt refresh before rejecting
      return this.attemptRefresh(
        rawRefreshToken,
        req,
        res,
        'invalid_access_token',
      );
    }

    // Access token valid but expiring soon — proactive silent refresh
    if (this.tokenService.needsSilentRefresh(payload)) {
      await this.attemptRefresh(rawRefreshToken, req, res, 'silent_refresh', {
        userId: payload.sub,
        isSilent: true,
      });
    }

    req['user'] = payload;
    return true;
  }

  private async attemptRefresh(
    rawRefreshToken: string | undefined,
    req: Request,
    res: Response,
    reason: 'no_access_token' | 'invalid_access_token' | 'silent_refresh',
    options?: { userId?: string; isSilent?: boolean },
  ): Promise<boolean> {
    const isSilent = options?.isSilent ?? false;

    if (!rawRefreshToken) {
      if (isSilent) return true;
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }

    // For silent refresh, acquire Redis lock to prevent concurrent rotations
    if (isSilent && options?.userId) {
      const lockAcquired = await this.redisLockService.acquireLock(
        options.userId,
      );
      if (!lockAcquired) {
        this.logger.log(
          `Silent refresh skipped (lock busy): userId=${options.userId}`,
        );
        return true;
      }
    }

    try {
      const tokens = await this.tokenService.rotateTokens(rawRefreshToken);
      this.tokenService.setTokenCookies(res, tokens);

      const newPayload = await this.tokenService.verifyAccessToken(
        tokens.accessToken,
      );
      req['user'] = newPayload;

      this.logger.log(`Token refresh succeeded [${reason}]`);
      return true;
    } catch (err) {
      if (isSilent) {
        this.logger.warn(`Silent refresh failed [${reason}]`, err);
        return true;
      }
      this.logger.warn(`Refresh failed [${reason}]`, err);
      this.tokenService.clearTokenCookies(res);
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    } finally {
      if (isSilent && options?.userId) {
        await this.redisLockService.releaseLock(options.userId);
      }
    }
  }
}
