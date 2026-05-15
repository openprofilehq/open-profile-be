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

  async generateRefreshToken(
    userId: string,
    deviceId: string,
  ): Promise<string> {
    const rawToken = uuidv4();
    const tokenHash = await argon2.hash(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);

    // Delete any existing token for this device before inserting a new one
    await this.refreshTokenRepo.delete({ userId, deviceId });

    const record = this.refreshTokenRepo.create({
      userId,
      deviceId,
      tokenHash,
      expiresAt,
    });
    await this.refreshTokenRepo.save(record);

    return rawToken;
  }

  // ─── Token Rotation ──────────────────────────────────────────────────────────

  async rotateTokens(
    rawRefreshToken: string,
    deviceId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Find the record for this device
    const record = await this.refreshTokenRepo.findOne({
      where: { deviceId },
      relations: ['user'],
    });

    if (!record) {
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }

    // Check expiry
    if (new Date() > record.expiresAt) {
      await this.refreshTokenRepo.delete({ deviceId });
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }

    // Validate hash
    const isValid = await argon2.verify(record.tokenHash, rawRefreshToken);
    if (!isValid) {
      // Possible token reuse attack — invalidate all tokens for this device
      await this.refreshTokenRepo.delete({ deviceId });
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }

    const user = record.user;

    // Issue new tokens
    const [accessToken, newRawRefreshToken] = await Promise.all([
      this.generateAccessToken(user),
      this.generateRefreshToken(user.id, deviceId),
    ]);

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
    userId: string,
    deviceId: string,
  ): Promise<void> {
    await this.refreshTokenRepo.delete({ userId, deviceId });
    this.logger.log(
      `Refresh token invalidated: userId=${userId} deviceId=${deviceId}`,
    );
  }

  async invalidateAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokenRepo.delete({ userId });
    this.logger.log(`All refresh tokens invalidated: userId=${userId}`);
  }

  // ─── Device ID ───────────────────────────────────────────────────────────────

  extractDeviceId(req: {
    cookies?: Record<string, string>;
    headers?: Record<string, string | string[] | undefined>;
  }): string {
    // Use a device cookie if present, otherwise fall back to user-agent hash
    const cookies = req.cookies ?? {};
    if (cookies['deviceId']) return cookies['deviceId'];

    const ua = (req.headers?.['user-agent'] as string) ?? 'unknown';
    // Simple deterministic device fingerprint — not cryptographically sensitive
    return Buffer.from(ua).toString('base64').slice(0, 36);
  }

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
