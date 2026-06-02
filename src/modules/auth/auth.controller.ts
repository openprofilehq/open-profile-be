import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { env } from '../../config/env';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { GoogleAuthRequest } from './interfaces/google.interface';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { UsersService } from '../users/users.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user with email and password' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ??
      req.socket.remoteAddress ??
      'unknown';
    this.logger.debug(`[login] emailProvided=true ip=${ip}`);
    return this.authService.login(dto, ip, req, res);
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Silently refresh access token from httpOnly cookie',
  })
  refreshToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.logger.debug(
      `[refreshToken] hasCookies=${!!req.cookies} cookieKeys=${JSON.stringify(Object.keys(req.cookies ?? {}))}`,
    );
    return this.authService.refreshTokens(req, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Log out and clear session cookies' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req, res);
  }

  @ApiBearerAuth('JWT')
  @Get('me')
  @ApiOperation({ summary: 'Return the current authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findOne(user.sub);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  )
  @ApiOperation({ summary: 'Request a password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('verify-reset-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(ThrottlerGuard)
  @UsePipes(
    new ValidationPipe({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  )
  @ApiOperation({
    summary: 'Verify password reset OTP and receive a reset token',
  })
  verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    return this.authService.verifyResetOtp(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  )
  @ApiOperation({
    summary: 'Reset password using reset token from verify-reset-otp',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP for email verification' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(dto, req, res);
    res.status(HttpStatus.OK);
    return result;
  }

  // ─── Google OAuth ─────────────────────────────────────────────────────────────

  @Get('google')
  @Public()
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @UseGuards(ThrottlerGuard)
  async googleAuth(@Req() req: Request, @Res() res: Response) {
    const state = await this.authService.createOauthState(
      'google',
      { ip: req.ip },
      300,
    );
    const params = new URLSearchParams({
      client_id: env.CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      response_type: 'code',
      scope: 'email profile',
      state,
      access_type: 'offline',
    });
    return res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    );
  }

  @Get('google/callback')
  @Public()
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @UseGuards(ThrottlerGuard, GoogleAuthGuard)
  async googleCallback(@Req() req: GoogleAuthRequest, @Res() res: Response) {
    const state = (req.query?.state as string | undefined) ?? null;
    if (!state) {
      this.logger.warn('[googleCallback] Missing state parameter');
      const errorUrl = `${env.FRONTEND_URL}/auth?error=AUTH_FAILED&message=Missing%20state`;
      return res.redirect(302, errorUrl);
    }

    const entry = await this.authService.consumeOauthState('google', state);
    if (!entry) {
      this.logger.warn('[googleCallback] Invalid or expired state');
      const errorUrl = `${env.FRONTEND_URL}/auth?error=AUTH_FAILED&message=Invalid%20or%20expired%20state`;
      return res.redirect(302, errorUrl);
    }

    this.logger.debug(
      `[googleCallback] State validated userId=${req.user?.id ?? 'unknown'}`,
    );

    const response = await this.authService.loginGoogle(
      req.user,
      req.ip,
      req,
      res,
    );

    const redirectUrl = response.isNewUser
      ? `${env.FRONTEND_URL}/create-profile`
      : `${env.FRONTEND_URL}/dashboard`;

    this.logger.debug(
      `[googleCallback] Redirecting to ${redirectUrl} isNewUser=${response.isNewUser}`,
    );
    return res.redirect(302, redirectUrl);
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.email);
  }
}
