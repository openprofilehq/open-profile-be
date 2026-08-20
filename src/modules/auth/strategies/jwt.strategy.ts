import { Injectable, UnauthorizedException } from '@nestjs/common';
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
const INACTIVE_STATUSES: readonly string[] = [
  UserStatus.BLOCKED,
  UserStatus.SUSPENDED,
  UserStatus.DEACTIVATED,
];

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
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

    if (INACTIVE_STATUSES.includes(status)) {
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
    } catch {
      // Redis unavailable — fall through to DB
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['status'],
    });

    const status = user?.status ?? UserStatus.ACTIVE;

    try {
      await this.redis.set(cacheKey, status, STATUS_CACHE_TTL_SECONDS);
    } catch {
      // Redis unavailable — ignore, next request will re-query DB
    }

    return status;
  }
}
