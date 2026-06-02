import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
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
import { TokenService } from './services/token.service';
import type { Request, Response } from 'express';
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

const OTP_TTL_MS = 5 * 60 * 1000;
const BRUTE_MAX_ATTEMPTS = 5;
const BRUTE_LOCKOUT_SECONDS = 30 * 60;
const IP_RATE_LIMIT_MAX = 10;
const IP_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export interface GoogleAuthResponse {
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
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterSuccessResponse> {
    const user = await this.usersService.createEmailUser({
      email: dto.email,
      password: dto.password,
    });
    const otp = this.generateOtp();
    const otpHash = await argon2.hash(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.usersService.storeOtpHash(user.id, otpHash, otpExpiresAt);

    try {
      await this.queueService.addJob(
        QUEUE_NAMES.EMAIL,
        QUEUE_JOB_NAMES.EMAIL.SEND_OTP,
        { to: user.email, otp, fullName: user.fullName ?? '' },
      );
    } catch (err) {
      await this.usersService.clearOtpOnly(user.id);
      this.logger.error(
        `Failed to enqueue verification email for user ${user.id}`,
        err instanceof Error ? err.stack : err,
      );
      throw new InternalServerErrorException(
        'Failed to send verification email. Please try again.',
      );
    }

    return {
      status: 'success',
      message: 'A verification code has been sent to your email address.',
    };
  }

  async login(
    dto: LoginDto,
    ip: string,
    req: Request,
    res: Response,
  ): Promise<
    | {
        status: string;
        user: {
          id: string;
          email: string;
          role: string;
          onboardingComplete: boolean;
        };
      }
    | {
        status: string;
        message: string;
      }
  > {
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
      await this.usersService.clearOtp(user.id);

      const otp = this.generateOtp();
      const otpHash = await argon2.hash(otp);
      const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
      await this.usersService.storeOtpHash(user.id, otpHash, otpExpiresAt);

      try {
        await this.queueService.addJob(
          QUEUE_NAMES.EMAIL,
          QUEUE_JOB_NAMES.EMAIL.SEND_OTP,
          { to: user.email, otp, fullName: user.fullName ?? '' },
        );
      } catch (err) {
        await this.usersService.clearOtpOnly(user.id);
        this.logger.error(
          `Failed to enqueue verification email for user ${user.id}`,
          err instanceof Error ? err.stack : err,
        );
        throw new InternalServerErrorException(
          'Failed to send verification email. Please try again.',
        );
      }

      return {
        status: 'success',
        message: 'A verification code has been sent to your email address.',
      };
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

    // Issue tokens using TokenService — stores in refresh_tokens table per device
    const accessToken = await this.tokenService.generateAccessToken(user);
    const refreshToken = await this.tokenService.generateRefreshToken(user.id);
    this.tokenService.setTokenCookies(res, { accessToken, refreshToken });

    this.logger.debug(
      `[login] userId=${user.id} authProvider=${user.authProvider} tokensGenerated=true`,
    );
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

  async refreshTokens(
    req: Request,
    res: Response,
  ): Promise<{ status: string }> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const rawRefreshToken = cookies?.['refreshToken'];

    this.logger.debug(
      `[refreshTokens] hasRefreshToken=${!!rawRefreshToken} cookieKeys=${JSON.stringify(Object.keys(cookies ?? {}))}`,
    );

    if (!rawRefreshToken) {
      this.logger.warn(
        `[refreshTokens] No refreshToken cookie found cookieKeys=${JSON.stringify(Object.keys(cookies ?? {}))}`,
      );
      this.tokenService.clearTokenCookies(res);
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }
    try {
      const tokens = await this.tokenService.rotateTokens(rawRefreshToken);
      this.tokenService.setTokenCookies(res, tokens);
      this.logger.debug(`[refreshTokens] Tokens rotated successfully`);
      return { status: 'success' };
    } catch (err) {
      this.logger.warn(
        `[refreshTokens] Token rotation failed error=${err instanceof Error ? err.message : String(err)}`,
      );
      this.tokenService.clearTokenCookies(res);
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }
  }

  async logout(req: Request, res: Response): Promise<{ message: string }> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const accessToken = cookies?.['accessToken'];
    const rawRefreshToken = cookies?.['refreshToken'];

    let userId: string | null = null;

    if (accessToken) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(
          accessToken,
          {
            secret: env.JWT_ACCESS_SECRET,
            ignoreExpiration: true,
          },
        );
        userId = payload.sub;
      } catch {
        this.logger.warn('Logout called with unverifiable access token');
      }
    }

    if (rawRefreshToken) {
      await this.tokenService.invalidateRefreshToken(userId, rawRefreshToken);
    }

    this.tokenService.clearTokenCookies(res);
    return { message: 'You have been logged out successfully.' };
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

    if (user && user.authProvider === AuthProvider.EMAIL) {
      const otp = this.generateOtp();
      const otpHash = await argon2.hash(otp);
      const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

      await this.usersService.storeOtpHash(user.id, otpHash, otpExpiresAt);

      try {
        await this.mailService.sendPasswordResetOtp(user.email, otp);
      } catch (err) {
        this.logger.error(
          `Failed to send password reset OTP to ${user.email}`,
          err instanceof Error ? err.stack : err,
        );
      }
    }

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
    await this.usersService.clearOtp(user.id);

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

    await this.tokenService.invalidateAllRefreshTokens(user.id);

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
    req: Request,
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

    // Issue tokens via TokenService — per-device refresh token
    const accessToken = await this.tokenService.generateAccessToken(user);
    const refreshToken = await this.tokenService.generateRefreshToken(user.id);
    this.tokenService.setTokenCookies(res, { accessToken, refreshToken });

    return {
      status: 'success',
      message: 'Email verified successfully.',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        onboardingComplete: user.onboardingComplete,
      },
    };
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
      if (user.authProvider === AuthProvider.EMAIL) {
        await this.usersService.linkGoogleAccount(user.id);
        user = await this.usersService.findOne(user.id);
      }
      return { user, isNewUser };
    }

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
    _req: Request,
    res: Response,
  ): Promise<GoogleAuthResponse> {
    this.usersService.logOAuthLogin(user.id, ipAddress, 'google');

    const accessToken = await this.tokenService.generateAccessToken(user);
    const refreshToken = await this.tokenService.generateRefreshToken(user.id);
    this.tokenService.setTokenCookies(res, { accessToken, refreshToken });

    this.logger.debug(`[loginGoogle] userId=${user.id} tokensGenerated=true`);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, deletedAt, ...safeUser } = user;

    return {
      user: safeUser,
      isNewUser: !user.onboardingComplete,
    };
  }

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

    await this.redisService.del(key);
    this.logger.debug(`[OAuth] State consumed successfully for ${provider}`, {
      stateSample: state.slice(0, 8),
      age: Date.now() - parsed.createdAt,
    });

    return parsed;
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

    if (!user) {
      return { message: 'If the email exists, an OTP has been sent' };
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

    await this.usersService.clearOtp(user.id);

    const otp = this.generateOtp();
    const otpHash = await argon2.hash(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.usersService.storeOtpHash(user.id, otpHash, otpExpiresAt);

    await this.queueService.addJob(
      QUEUE_NAMES.EMAIL,
      QUEUE_JOB_NAMES.EMAIL.SEND_OTP,
      { to: user.email, otp, fullName: user.fullName ?? '' },
    );

    return { message: 'OTP has been sent successfully' };
  }
}
