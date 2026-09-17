import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { env } from '../../../config/env';
import { UserStatusService } from '../services/user-status.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  onboardingComplete: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly userStatusService: UserStatusService) {
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
    if (!(await this.userStatusService.isActive(payload.sub))) {
      throw new UnauthorizedException('Account is not active');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      onboardingComplete: payload.onboardingComplete,
    };
  }
}
