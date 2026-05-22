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

const ACCESS_TOKEN_COOKIE = 'accessToken';
const REFRESH_TOKEN_COOKIE = 'refreshToken';
const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SILENT_REFRESH_THRESHOLD_SECONDS = 3 * 60; // 3 minutes

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

  private createRefreshTokenRecord(userId: string): {
    record: RefreshToken;
    rawToken: string;
  } {
    const rawToken = uuidv4();
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
    const record = this.refreshTokenRepo.create({
      userId,
      tokenId: rawToken,
      tokenHash,
      expiresAt,
    });
    return { record, rawToken };
  }

  // ─── Token Rotation ──────────────────────────────────────────────────────────

  async rotateTokens(rawRefreshToken: string) {
    // lookup by tokenId instead of re-hashing
    const matchedRecord = await this.refreshTokenRepo.findOne({
      where: { tokenId: rawRefreshToken },
      relations: ['user'],
    });

    if (!matchedRecord) {
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }

    // verify the hash matches — confirms token hasn't been tampered with
    const isValid = await argon2.verify(
      matchedRecord.tokenHash,
      rawRefreshToken,
    );
    if (!isValid) {
      await this.refreshTokenRepo.delete({ id: matchedRecord.id });
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

    return { accessToken, refreshToken: newRawRefreshToken };
  }

  // ─── Silent Refresh Check ────────────────────────────────────────────────────

  getAccessTokenTTL(payload: JwtPayload & { exp?: number }): number {
    if (!payload.exp) return 0;
    return payload.exp - Math.floor(Date.now() / 1000);
  }

  needsSilentRefresh(payload: JwtPayload & { exp?: number }): boolean {
    return this.getAccessTokenTTL(payload) < SILENT_REFRESH_THRESHOLD_SECONDS;
  }

  // ─── Cookies ─────────────────────────────────────────────────────────────────

  setTokenCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    const isProd = env.NODE_ENV === 'production';
    const isStaging = env.NODE_ENV === 'staging';
    const isDev = env.NODE_ENV === 'development';

    const secure = isProd || isStaging;
    const sameSite = isDev ? 'lax' : 'strict';

    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
      domain: isProd ? env.COOKIE_DOMAIN : undefined,
    });

    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: REFRESH_TOKEN_MAX_AGE_MS,
      path: '/',
      domain: isProd ? env.COOKIE_DOMAIN : undefined,
    });
  }
  clearTokenCookies(res: Response): void {
    res.cookie(ACCESS_TOKEN_COOKIE, '', { maxAge: 0, httpOnly: true });
    res.cookie(REFRESH_TOKEN_COOKIE, '', { maxAge: 0, httpOnly: true });
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

    // removed argon2.hash — lookup by tokenId directly
    await this.refreshTokenRepo.delete({
      ...(userId ? { userId } : {}),
      tokenId: rawRefreshToken, // ← was: tokenHash: hashedToken
    });
  }

  async invalidateAllRefreshTokens(userId: string): Promise<void> {
    if (!userId) {
      this.logger.warn('invalidateAllRefreshTokens called with invalid userId');
      return;
    }

    const deleteResult = await this.refreshTokenRepo.delete({
      userId,
    });

    this.logger.log(
      `All refresh tokens invalidated for userId=${userId}, count=${deleteResult.affected ?? 0}`,
    );
  }
  // ─── Verify ──────────────────────────────────────────────────────────────────

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
