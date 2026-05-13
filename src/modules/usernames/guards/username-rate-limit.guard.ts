import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';
import { RateLimiterService } from '../../rate-limiter/rate-limiter.service';

const fallbackStore = new Map<string, { count: number; resetAt: number }>();
const FALLBACK_LIMIT = 10;
const WINDOW_MS = 60_000;

@Injectable()
export class UsernameRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiter: RateLimiterService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? 'unknown';
    const key = `username_check:${ip}`;

    try {
      const allowed = await this.rateLimiter.isAllowed(key, 60, 60);
      if (!allowed) {
        throw new ServiceUnavailableException('RATE_LIMIT_EXCEEDED');
      }
      return true;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;

      // apply fallback in-memory limit
      const now = Date.now();
      const entry = fallbackStore.get(ip);

      if (!entry || now > entry.resetAt) {
        fallbackStore.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return true;
      }

      entry.count++;
      if (entry.count > FALLBACK_LIMIT) {
        throw new ServiceUnavailableException('RATE_LIMIT_EXCEEDED');
      }

      return true;
    }
  }
}
