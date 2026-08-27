import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { env } from '../../../config/env';
import { RedisService } from '../../../common/redis/redis.service';
import { User, UserStatus } from '../../users/entities/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  onboardingComplete: boolean;
}

const STATUS_CACHE_TTL_SECONDS = 60;
const INACTIVE_STATUSES = new Set<string>([
  UserStatus.BLOCKED,
  UserStatus.SUSPENDED,
  UserStatus.DEACTIVATED,
]);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly redis: RedisService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          return (
            (req?.cookies as Record<string, string> | undefined)?.accessToken ??
            null
          );
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const status = await this.resolveStatus(payload.sub);

    if (INACTIVE_STATUSES.has(status)) {
      throw new UnauthorizedException('Account is not active');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      onboardingComplete: payload.onboardingComplete,
    };
  }

  private async resolveStatus(userId: string): Promise<string> {
    const cacheKey = `user:status:${userId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return cached;
    } catch (error) {
      this.logger.warn(
        `Failed to read user status from Redis: ${(error as Error).message}`,
      );
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['status'],
    });

    const status = user?.status ?? UserStatus.ACTIVE;

    try {
      await this.redis.set(cacheKey, status, STATUS_CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(
        `Failed to cache user status in Redis: ${(error as Error).message}`,
      );
    }

    return status;
  }
}
