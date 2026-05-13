import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import type { StringValue } from 'ms';
import { env } from '../../config/env';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { AuthProvider, User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { QueueService } from '../queue/queue.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../../common/redis/redis.service';
import type { Response } from 'express';
import {
  QUEUE_JOB_NAMES,
  QUEUE_NAMES,
} from '../queue/config/queue-names.constant';
import { PasswordChangedEmailData } from '../mail/interfaces/password-changed-email.interface';
import { AccountLockedEmailData } from '../mail/interfaces/account-locked-email.interface';
import { NewIpLoginEmailData } from '../mail/interfaces/new-ip-login-email.interface';
import { GoogleUser } from './interfaces/google.interface';

const FORGOT_PASSWORD_GENERIC_MSG =
  'If an account exists for this email, a verification code has been sent.';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: Omit<User, 'password' | 'refreshTokenHash' | 'deletedAt'>;
}

export interface RegisterSuccessResponse {
  status: 'success';
  message: string;
}

export interface RegisterDegradedResponse {
  status: 'pending';
  message: string;
  httpStatus: typeof HttpStatus.ACCEPTED;
}

const OTP_TTL_MS = 5 * 60 * 1000;

const BRUTE_MAX_ATTEMPTS = 5;
const BRUTE_LOCKOUT_SECONDS = 30 * 60;
const IP_RATE_LIMIT_MAX = 10;
const IP_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export interface GoogleAuthResponse extends AuthTokens {
  user: Omit<User, 'password' | 'refreshTokenHash' | 'deletedAt'>;
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly queueService: QueueService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<RegisterSuccessResponse | RegisterDegradedResponse> {
    const user = await this.usersService.createEmailUser({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
    });

    const otp = this.generateOtp();
    const otpHash = await argon2.hash(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.usersService.storeOtpHash(user.id, otpHash, otpExpiresAt);

    try {
      await this.mailService.sendVerificationOtp(
        user.email,
        user.fullName,
        otp,
      );
    } catch (err) {
      // Edge case #1: log failure, return 202, user record is intact
      this.logger.error(
        `Resend failure for user ${user.id} (${user.email})`,
        err instanceof Error ? err.stack : err,
      );

      return {
        status: 'pending',
        message:
          'Account created but we could not send your verification email. Please use the resend option.',
        httpStatus: HttpStatus.ACCEPTED,
      };
    }

    // AC #11, AC #12: 201, no tokens
    return {
      status: 'success',
      message: 'A verification code has been sent to your email address.',
    };
  }

  async login(
    dto: LoginDto,
    ip: string,
    res: Response,
  ): Promise<{
    status: string;
    user: {
      id: string;
      email: string;
      role: string;
      onboardingComplete: boolean;
    };
  }> {
    const ipKey = `ip_rate:${ip}`;
    const ipCount = await this.redisService.increment(
      ipKey,
      IP_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (ipCount > IP_RATE_LIMIT_MAX) {
      throw new HttpException(
        {
          error: 'IP_RATE_LIMIT_EXCEEDED',
          message:
            'Too many requests. Please wait 15 minutes before trying again.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'The email or password you entered is incorrect.',
      });
    }

    if (user.authProvider !== AuthProvider.EMAIL) {
      throw new BadRequestException({
        error: 'WRONG_PROVIDER',
        message: `This account was created with ${
          user.authProvider === AuthProvider.GOOGLE
            ? 'Google'
            : user.authProvider
        }. Please use the Continue with ${
          user.authProvider === AuthProvider.GOOGLE
            ? 'Google'
            : user.authProvider
        } button.`,
      });
    }

    if (!user.isVerified) {
      throw new ForbiddenException({
        error: 'EMAIL_NOT_VERIFIED',
        email: user.email,
        message: 'Please verify your email address before logging in.',
      });
    }

    const lockKey = `lock:${user.email}`;
    const attemptsKey = `attempts:${user.email}`;
    const isLocked = await this.redisService.get(lockKey);
    if (isLocked) {
      throw new HttpException(
        {
          error: 'ACCOUNT_LOCKED',
          message:
            'Your account has been temporarily locked after too many failed attempts. Please try again in 30 minutes or reset your password.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const valid = await argon2.verify(user.password, dto.password);
    if (!valid) {
      const attempts = await this.redisService.increment(
        attemptsKey,
        BRUTE_LOCKOUT_SECONDS,
      );
      if (attempts >= BRUTE_MAX_ATTEMPTS) {
        await this.redisService.set(lockKey, '1', BRUTE_LOCKOUT_SECONDS);
        await this.redisService.del(attemptsKey);
        const lockedUntil = new Date(
          Date.now() + BRUTE_LOCKOUT_SECONDS * 1000,
        ).toUTCString();
        void this.queueService.addJob<AccountLockedEmailData>(
          QUEUE_NAMES.EMAIL,
          QUEUE_JOB_NAMES.EMAIL.ACCOUNT_LOCKED,
          { to: user.email, lockedUntil },
        );
      }
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'The email or password you entered is incorrect.',
      });
    }

    await this.redisService.del(attemptsKey);

    const isNewIp = user.lastLoginIp !== ip;
    if (isNewIp && user.lastLoginIp !== null) {
      void this.queueService.addJob<NewIpLoginEmailData>(
        QUEUE_NAMES.EMAIL,
        QUEUE_JOB_NAMES.EMAIL.NEW_IP_LOGIN,
        { to: user.email, ip, timestamp: new Date().toUTCString() },
      );
    }

    this.logger.log(
      `Login: userId=${user.id} ip=${ip} time=${new Date().toISOString()}`,
    );
    await this.usersService.updateLastLoginIp(user.id, ip);

    const tokens = await this.signTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    const isProd = env.NODE_ENV === 'production';
    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      status: 'success',
      user: {
        id: user.id,
        email: user.email,
        role: user.role ?? UserRole.USER,
        onboardingComplete: user.onboardingComplete,
      },
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findOne(payload.sub);
    if (!user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const matches = await argon2.verify(user.refreshTokenHash, refreshToken);
    if (!matches) throw new UnauthorizedException('Invalid refresh token');

    const tokens = await this.signTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  async getProfile(userId: string): Promise<User> {
    return this.usersService.findOne(userId);
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<Record<string, string>> {
    const lowercasedEmail = dto.email.toLowerCase();
    const rateLimitKey = `forgot-password:${lowercasedEmail}`;
    const allowed = await this.rateLimiterService.isAllowed(
      rateLimitKey,
      3,
      3600,
    );

    if (!allowed) {
      throw new HttpException(
        'You have requested too many codes. Please wait 60 minutes before trying again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.usersService.findByEmail(lowercasedEmail);

    // Only generate OTP for email-based accounts. Google OAuth users have no local
    // password to reset, and we must not reveal their auth provider to the caller.
    if (user && user.authProvider === AuthProvider.EMAIL) {
      const otp = this.generateOtp();
      const otpHash = await argon2.hash(otp);
      const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

      // Overwrites any existing OTP, invalidating previous codes immediately.
      await this.usersService.storeOtpHash(user.id, otpHash, otpExpiresAt);

      try {
        await this.mailService.sendPasswordResetOtp(user.email, otp);
      } catch (err) {
        // Log the delivery failure but do not surface it — the generic response
        // must be returned regardless to avoid leaking whether the email exists.
        this.logger.error(
          `Failed to send password reset OTP to ${user.email}`,
          err instanceof Error ? err.stack : err,
        );
      }
    }

    // Always return the same response whether the email exists or not,
    // to prevent user enumeration.
    return { status: 'success', message: FORGOT_PASSWORD_GENERIC_MSG };
  }

  async verifyResetOtp(
    dto: VerifyResetOtpDto,
  ): Promise<{ status: string; resetToken: string }> {
    const email = dto.email.toLowerCase();
    const attemptsKey = `reset-otp-attempts:${email}`;

    const user = await this.usersService.findByEmail(email);

    if (!user || !user.otpHash || !user.otpExpiresAt) {
      throw new BadRequestException({
        errorCode: 'OTP_INVALID',
        message: 'That code is incorrect or has expired. Please try again.',
      });
    }

    if (new Date() > user.otpExpiresAt) {
      throw new GoneException({
        errorCode: 'OTP_EXPIRED',
        message:
          'Your verification code has expired. Please request a new one.',
      });
    }

    const isValid = await argon2.verify(user.otpHash, dto.otp);
    if (!isValid) {
      // Invalidate the OTP after too many wrong attempts to prevent brute force.
      const attempts = await this.redisService.increment(
        attemptsKey,
        OTP_TTL_MS / 1000,
      );
      if (attempts >= BRUTE_MAX_ATTEMPTS) {
        await this.usersService.clearOtpOnly(user.id);
        await this.redisService.del(attemptsKey);
      }
      throw new BadRequestException({
        errorCode: 'OTP_INVALID',
        message: 'That code is incorrect or has expired. Please try again.',
      });
    }

    await this.redisService.del(attemptsKey);
    // Clear the OTP and mark the account as verified — receiving the OTP proves email ownership.
    await this.usersService.clearOtp(user.id);

    // Signed with a dedicated secret so reset tokens cannot be used as access tokens.
    const resetToken = await this.jwtService.signAsync(
      { sub: user.id, purpose: 'password_reset' },
      { secret: env.JWT_RESET_SECRET, expiresIn: '10m' },
    );

    return { status: 'success', resetToken };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<Record<string, string>> {
    let payload: { sub: string; purpose: string };

    try {
      payload = await this.jwtService.verifyAsync(dto.resetToken, {
        secret: env.JWT_RESET_SECRET,
      });
    } catch {
      throw new HttpException(
        {
          errorCode: 'TOKEN_INVALID',
          message:
            'This reset token is invalid or has expired. Please start over.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Guard against tokens signed with a different secret or purpose.
    if (payload.purpose !== 'password_reset') {
      throw new HttpException(
        {
          errorCode: 'TOKEN_INVALID',
          message:
            'This reset token is invalid or has expired. Please start over.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.usersService.findOne(payload.sub);
    await this.usersService.updatePassword(user.id, dto.newPassword);
    // Invalidate all existing sessions after password change.
    await this.usersService.setRefreshTokenHash(user.id, null);

    await this.queueService.addJob<PasswordChangedEmailData>(
      QUEUE_NAMES.EMAIL,
      QUEUE_JOB_NAMES.EMAIL.SEND_PASSWORD_CHANGED,
      { to: user.email },
    );

    return {
      status: 'success',
      message:
        'Your password has been updated. Please log in with your new password.',
    };
  }

  async verifyOtp(
    dto: VerifyOtpDto,
    res: Response,
  ): Promise<{
    status: string;
    message: string;
    user: {
      id: string;
      email: string;
      role: string | null;
      onboardingComplete: boolean;
    };
  }> {
    const lowercasedEmail = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(lowercasedEmail);

    if (!user) {
      throw new BadRequestException('No account found for this email address.');
    }

    if (user.isVerified) {
      throw new ConflictException(
        'This account has already been verified. Please log in.',
      );
    }

    if (!user.otpHash || !user.otpExpiresAt) {
      throw new BadRequestException(
        'No OTP found for this email. Please request a new verification code.',
      );
    }

    if (new Date() > user.otpExpiresAt) {
      throw new GoneException({
        errorCode: 'OTP_EXPIRED',
        message:
          'Your verification code has expired. Please request a new one.',
      });
    }

    const isValid = await argon2.verify(user.otpHash, dto.otp);
    if (!isValid) {
      throw new BadRequestException({
        errorCode: 'OTP_INVALID',
        message:
          'That code is incorrect. Please check your email and try again.',
      });
    }

    await this.usersService.clearOtp(user.id);

    const tokens = await this.issueTokens(user);

    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, refreshTokenHash, deletedAt, ...safeUser } = user;

    return {
      status: 'success',
      message: 'Email verified successfully.',
      user: {
        id: safeUser.id,
        email: safeUser.email,
        role: safeUser.role,
        onboardingComplete: safeUser.onboardingComplete,
      },
    };
  }

  // Helper method to simulate OTP generation and sending for non-existent emails

  private async issueTokens(user: User): Promise<AuthResponse> {
    const tokens = await this.signTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, refreshTokenHash, deletedAt, ...safeUser } = user;

    return { ...tokens, user: safeUser };
  }

  private async signTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role ?? UserRole.USER,
      onboardingComplete: user.onboardingComplete,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: env.JWT_ACCESS_SECRET,
        expiresIn: env.JWT_ACCESS_EXPIRES_IN as StringValue,
      }),
      this.jwtService.signAsync(payload, {
        secret: env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_REFRESH_EXPIRES_IN as StringValue,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async persistRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hash = await argon2.hash(refreshToken);
    await this.usersService.setRefreshTokenHash(userId, hash);
  }

  private generateOtp(): string {
    return crypto.randomInt(100_000, 1_000_000).toString();
  }

  async validateGoogleUser(
    googleUser: GoogleUser,
  ): Promise<{ user: User; isNewUser: boolean }> {
    let user = await this.usersService.findByEmail(googleUser.email);
    let isNewUser = false;

    if (user) {
      /**
       * Link google account if not already linked (email account exists)
       */
      if (user.authProvider === AuthProvider.EMAIL) {
        await this.usersService.linkGoogleAccount(user.id);
        user = await this.usersService.findOne(user.id);
      }

      return { user, isNewUser };
    }

    /**
     * If user does not exist, create a new Google user with is_verified = true and onboardingComplete = false
     */
    const created = await this.usersService.createGoogleUser({
      email: googleUser.email,
      fullName: googleUser.fullName,
      isVerified: true,
      onboardingComplete: false,
    });

    isNewUser = true;
    return { user: created, isNewUser };
  }

  async loginGoogle(
    user: User,
    ipAddress: string,
  ): Promise<GoogleAuthResponse> {
    /**
     * Log the OAuth login with timestamp, IP, and user ID
     */
    this.usersService.logOAuthLogin(user.id, ipAddress, 'google');

    /**
     * Generate tokens with full payload: sub, email, role, onboardingComplete
     */
    const tokens = await this.signGoogleTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, refreshTokenHash, deletedAt, ...safeUser } = user;

    return {
      ...tokens,
      user: safeUser,
      isNewUser: !user.onboardingComplete,
    };
  }

  private async signGoogleTokens(user: User): Promise<AuthTokens> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      onboardingComplete: user.onboardingComplete,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: env.JWT_ACCESS_SECRET,
        expiresIn: env.JWT_ACCESS_EXPIRES_IN as StringValue,
      }),
      this.jwtService.signAsync(payload, {
        secret: env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_REFRESH_EXPIRES_IN as StringValue,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  async resendOtp(email: string): Promise<{ message: string }> {
    const lowercasedEmail = email.toLowerCase();

    const rateLimitKey = `resend-otp:${lowercasedEmail}`;
    const allowed = await this.rateLimiterService.isAllowed(
      rateLimitKey,
      3,
      3600,
    );
    const user = await this.usersService.findByEmail(lowercasedEmail);

    if (!allowed) {
      throw new HttpException(
        'You have requested too many code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Prevent email enumeration
    if (!user) {
      return {
        message: 'If the email exists, an OTP has been sent',
      };
    }
    if (user.isVerified) {
      this.logger.warn('Resend OTP requested for already-verified user', {
        userId: user.id,
      });

      return {
        message:
          'If this email is registered, you will receive instructions shortly.',
      };
    }

    // invalidate the otp

    await this.usersService.clearOtp(user.id);

    const otp = this.generateOtp();
    const otpHash = await argon2.hash(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.usersService.storeOtpHash(user.id, otpHash, otpExpiresAt);

    await this.queueService.addJob(
      QUEUE_NAMES.EMAIL,
      QUEUE_JOB_NAMES.EMAIL.SEND_OTP,
      {
        to: user.email,
        otp,
        fullName: user.fullName,
      },
    );

    return {
      message: 'OTP has been sent successfully',
    };
  }

  // Additional Services for Oauth state implementation
  async createOauthState(
    provider: string,
    meta: Record<string, unknown> = {},
    ttlSeconds = 300,
  ): Promise<string> {
    const state = crypto.randomBytes(24).toString('hex');
    const key = `oauth:${provider}:state:${state}`;
    const payload = JSON.stringify({ meta, createdAt: Date.now() });
    await this.redisService.set(key, payload, ttlSeconds);
    this.logger.debug(`[OAuth] State created for ${provider}`, {
      stateSample: state.slice(0, 8),
      ttl: ttlSeconds,
    });
    return state;
  }

  async consumeOauthState(
    provider: string,
    state: string,
  ): Promise<{ meta: Record<string, unknown>; createdAt: number } | null> {
    const key = `oauth:${provider}:state:${state}`;
    const raw = await this.redisService.get(key);

    if (!raw) {
      this.logger.warn(`[OAuth] Invalid or expired state attempted`, {
        provider,
        stateSample: state.slice(0, 8),
        reason: 'state_not_found',
      });
      return null;
    }

    let parsed: { meta: Record<string, unknown>; createdAt: number };
    try {
      parsed = JSON.parse(raw) as {
        meta: Record<string, unknown>;
        createdAt: number;
      };
    } catch {
      this.logger.error(`[OAuth] Failed to parse state payload`, {
        provider,
        stateSample: state.slice(0, 8),
      });
      await this.redisService.del(key);
      return null;
    }

    // Consume state (delete from Redis) to prevent replay
    await this.redisService.del(key);
    this.logger.debug(`[OAuth] State consumed successfully for ${provider}`, {
      stateSample: state.slice(0, 8),
      age: Date.now() - parsed.createdAt,
    });

    return parsed;
  }
}
