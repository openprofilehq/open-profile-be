import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { env } from '../../../config/env';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: env.CLIENT_ID,
      clientSecret: env.CLIENT_SECRET,

      callbackURL: env.GOOGLE_CALLBACK_URL,

      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<any> {
    const email = profile.emails?.[0]?.value as string;
    const givenName = profile.name?.givenName as string;
    const familyName = profile.name?.familyName as string;

    if (!email) {
      throw new UnauthorizedException('Google account email not found');
    }

    const result = await this.authService.validateGoogleUser({
      email,
      fullName: profile.displayName,
      givenName,
      familyName,
      avatar: profile.photos?.[0]?.value,
      googleId: profile.id,
    });

    done(null, result.user);
  }
}
