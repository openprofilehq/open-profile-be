import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { StringValue } from 'ms';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { env } from '../../../config/env';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User, UserRole } from '../../users/entities/user.entity';
import { JwtPayload } from '../strategies/jwt.strategy';
import { resolveAuthCookieOptions } from '../utils/auth-cookie-policy';

const ACCESS_TOKEN_COOKIE = 'accessToken';
const REFRESH_TOKEN_COOKIE = 'refreshToken';

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const SILENT_REFRESH_THRESHOLD_SECONDS = 3 * 60;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  // ─── Access Token ────────────────────────────────────────────────────────────

  async generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role ?? UserRole.USER,
      onboardingComplete: user.onboardingComplete,
    };

    return this.jwtService.signAsync(payload, {
      secret: env.JWT_ACCESS_SECRET,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as StringValue,
    });
  }

  // ─── Refresh Token ───────────────────────────────────────────────────────────

  async generateRefreshToken(userId: string): Promise<string> {
    const { record, rawToken } = this.createRefreshTokenRecord(userId);
    await this.refreshTokenRepo.save(record);
    return rawToken;
  }

  private createRefreshTokenRecord(userId: string) {
    const rawToken = uuidv4();

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);

    const record = this.refreshTokenRepo.create({
      userId,
      tokenHash,
      expiresAt,
    });

    return { record, rawToken };
  }

  // ─── Token Rotation ──────────────────────────────────────────────────────────

  async rotateTokens(rawRefreshToken: string) {
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    const matchedRecord = await this.refreshTokenRepo.findOne({
      where: { tokenHash: hashedToken },
      relations: ['user'],
    });

    if (!matchedRecord) {
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }

    if (new Date() > matchedRecord.expiresAt) {
      await this.refreshTokenRepo.delete({ id: matchedRecord.id });
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }

    const deleteResult = await this.refreshTokenRepo.delete({
      id: matchedRecord.id,
    });

    if (deleteResult.affected === 0) {
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Session has expired. Please try again.',
      });
    }

    const user = matchedRecord.user;

    const { record: newRecord, rawToken: newRawRefreshToken } =
      this.createRefreshTokenRecord(user.id);

    await this.refreshTokenRepo.save(newRecord);

    const accessToken = await this.generateAccessToken(user);

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  // ─── Silent Refresh ──────────────────────────────────────────────────────────

  getAccessTokenTTL(payload: JwtPayload & { exp?: number }): number {
    if (!payload.exp) return 0;
    return payload.exp - Math.floor(Date.now() / 1000);
  }

  needsSilentRefresh(payload: JwtPayload & { exp?: number }): boolean {
    return this.getAccessTokenTTL(payload) < SILENT_REFRESH_THRESHOLD_SECONDS;
  }

  // ─── Cookie Policy ──────────────────────────────────────────────────────────

  getCookieOptions() {
    return resolveAuthCookieOptions(env.NODE_ENV, env.COOKIE_DOMAIN);
  }

  setTokenCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    const base = this.getCookieOptions();

    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
      ...base,
    });

    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      maxAge: REFRESH_TOKEN_MAX_AGE_MS,
      ...base,
    });
  }

  clearTokenCookies(res: Response): void {
    const base = this.getCookieOptions();

    res.clearCookie(ACCESS_TOKEN_COOKIE, base);
    res.clearCookie(REFRESH_TOKEN_COOKIE, base);
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────

  async invalidateRefreshToken(
    userId: string | null,
    rawRefreshToken: string,
  ): Promise<void> {
    if (!rawRefreshToken) {
      this.logger.warn('invalidateRefreshToken called with invalid parameters');
      return;
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    await this.refreshTokenRepo.delete({
      ...(userId ? { userId } : {}),
      tokenHash,
    });
  }

  async invalidateAllRefreshTokens(userId: string): Promise<void> {
    if (!userId) {
      this.logger.warn('invalidateAllRefreshTokens called with invalid userId');
      return;
    }

    const deleteResult = await this.refreshTokenRepo.delete({ userId });

    this.logger.log(
      `All refresh tokens invalidated for userId=${userId}, count=${deleteResult.affected ?? 0}`,
    );
  }

  // ─── Verification ───────────────────────────────────────────────────────────

  async verifyAccessToken(
    token: string,
  ): Promise<JwtPayload & { exp: number }> {
    return this.jwtService.verifyAsync(token, {
      secret: env.JWT_ACCESS_SECRET,
    });
  }

  async verifyRefreshToken(
    token: string,
  ): Promise<JwtPayload & { exp: number }> {
    return this.jwtService.verifyAsync(token, {
      secret: env.JWT_REFRESH_SECRET,
    });
  }

  getRefreshTokenMaxAgeSeconds(): number {
    return REFRESH_TOKEN_MAX_AGE_SECONDS;
  }
}
