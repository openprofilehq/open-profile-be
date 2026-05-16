import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
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
    const { record, rawToken } = await this.createRefreshTokenRecord(userId);
    await this.refreshTokenRepo.save(record);
    return rawToken;
  }

  private async createRefreshTokenRecord(
    userId: string,
  ): Promise<{ record: RefreshToken; rawToken: string }> {
    const rawToken = uuidv4();
    const tokenHash = await argon2.hash(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
    const record = this.refreshTokenRepo.create({
      userId,
      tokenHash,
      expiresAt,
    });
    return { record, rawToken };
  }

  // ─── Token Rotation ──────────────────────────────────────────────────────────

  async rotateTokens(
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const records = await this.refreshTokenRepo.find({
      relations: ['user'],
    });

    let matchedRecord: RefreshToken | null = null;
    for (const record of records) {
      const isValid = await argon2.verify(record.tokenHash, rawRefreshToken);
      if (isValid) {
        matchedRecord = record;
        break;
      }
    }

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
      await this.createRefreshTokenRecord(user.id);
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

    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
    });

    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_MAX_AGE_MS,
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

    const where = userId ? { userId } : {};
    const records = await this.refreshTokenRepo.find({ where });

    for (const record of records) {
      try {
        const isValid = await argon2.verify(record.tokenHash, rawRefreshToken);
        if (isValid) {
          await this.refreshTokenRepo.delete({ id: record.id });
          this.logger.log(`Refresh token invalidated: userId=${record.userId}`);
          return;
        }
      } catch {
        this.logger.debug(
          `Argon2 verification failed for a token of user ${userId}`,
        );
      }
    }

    this.logger.debug(`No matching refresh token found for userId=${userId}`);
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
