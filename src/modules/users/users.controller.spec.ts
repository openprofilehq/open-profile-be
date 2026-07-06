jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

import {
  ConflictException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  UnprocessableEntityException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { APP_PIPE, Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationError } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { EMAIL_ALREADY_EXISTS, UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthProvider } from './entities/user.entity';

const USER_ID = '22222222-2222-4222-8222-222222222222';

describe('UsersController (integration)', () => {
  let app: INestApplication<App>;
  let mockUsersService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockUsersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      markOnboardingComplete: jest.fn(),
      getSettings: jest.fn(),
      getBillingInfo: jest.fn(),
      updateEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
            transformOptions: { enableImplicitConversion: false },
            exceptionFactory: (errors) => {
              const flatten = (
                errs: ValidationError[],
                parentField = '',
              ): { field: string; error: string }[] => {
                const result: { field: string; error: string }[] = [];
                for (const e of errs) {
                  const field = parentField
                    ? `${parentField}.${e.property}`
                    : e.property;
                  const constraints = Object.values(e.constraints ?? {});
                  if (constraints.length > 0) {
                    result.push({ field, error: constraints.join(', ') });
                  }
                  if (e.children?.length) {
                    result.push(...flatten(e.children, field));
                  }
                }
                return result;
              };
              return new UnprocessableEntityException(flatten(errors));
            },
          }),
        },
      ],
    }).compile();

    app = module.createNestApplication();
    // Stand-in for what JwtAuthGuard attaches on a real authenticated
    // request (req['user'] = payload) — the guard itself isn't unit
    // tested anywhere in this repo, so this isolates identity plumbing
    // (@CurrentUser -> service call) from token verification.
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { sub: USER_ID };
      next();
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/users/me/settings
  // -----------------------------------------------------------------------
  describe('GET /api/v1/users/me/settings', () => {
    it('returns 200 with only the safe settings fields, scoped to the caller', async () => {
      mockUsersService.getSettings.mockResolvedValue({
        email: 'test@example.com',
        username: 'testuser',
        fullName: 'Test User',
        isVerified: true,
        authProvider: AuthProvider.EMAIL,
        onboardingComplete: true,
      });

      await request(app.getHttpServer())
        .get('/api/v1/users/me/settings')
        .expect(200)
        .expect((res) => {
          expect(mockUsersService.getSettings).toHaveBeenCalledWith(USER_ID);
          expect(Object.keys(res.body).sort()).toEqual(
            [
              'email',
              'username',
              'fullName',
              'isVerified',
              'authProvider',
              'onboardingComplete',
            ].sort(),
          );
          expect(res.body).not.toHaveProperty('password');
          expect(res.body).not.toHaveProperty('otpHash');
          expect(res.body).not.toHaveProperty('otpExpiresAt');
          expect(res.body).not.toHaveProperty('lastLoginIp');
        });
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/users/me/billing
  // -----------------------------------------------------------------------
  describe('GET /api/v1/users/me/billing', () => {
    it('returns 200 with the static Free-plan shape, scoped to the caller', async () => {
      mockUsersService.getBillingInfo.mockResolvedValue({
        plan: 'Free',
        nextBillingDate: null,
      });

      await request(app.getHttpServer())
        .get('/api/v1/users/me/billing')
        .expect(200)
        .expect((res) => {
          expect(mockUsersService.getBillingInfo).toHaveBeenCalledWith(USER_ID);
          expect(Object.keys(res.body).sort()).toEqual(
            ['plan', 'nextBillingDate'].sort(),
          );
          expect(res.body).toEqual({ plan: 'Free', nextBillingDate: null });
        });
    });

    it('returns 404 when the user no longer exists', async () => {
      mockUsersService.getBillingInfo.mockRejectedValue(
        new NotFoundException(`User ${USER_ID} not found`),
      );

      await request(app.getHttpServer())
        .get('/api/v1/users/me/billing')
        .expect(404);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v1/users/me/email
  // -----------------------------------------------------------------------
  describe('PATCH /api/v1/users/me/email', () => {
    it('returns 200 with the updated email on success, scoped to the caller', async () => {
      mockUsersService.updateEmail.mockResolvedValue({
        email: 'new@example.com',
      });

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/email')
        .send({ email: 'new@example.com' })
        .expect(200)
        .expect((res) => {
          expect(mockUsersService.updateEmail).toHaveBeenCalledWith(USER_ID, {
            email: 'new@example.com',
          });
          expect(res.body.email).toBe('new@example.com');
        });
    });

    it('returns 200 no-op when the submitted email matches the current one', async () => {
      mockUsersService.updateEmail.mockResolvedValue({
        email: 'test@example.com',
      });

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/email')
        .send({ email: 'test@example.com' })
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toBe('test@example.com');
        });
    });

    it('returns 409 when the email is already in use', async () => {
      mockUsersService.updateEmail.mockRejectedValue(
        new ConflictException({
          error: EMAIL_ALREADY_EXISTS,
          message: 'An account with this email already exists.',
        }),
      );

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/email')
        .send({ email: 'taken@example.com' })
        .expect(409);
    });

    it('returns 403 for a GOOGLE-provider account', async () => {
      mockUsersService.updateEmail.mockRejectedValue(
        new ForbiddenException({
          error: 'EMAIL_MANAGED_BY_PROVIDER',
          message: 'Email is managed by your sign-in provider.',
        }),
      );

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/email')
        .send({ email: 'new@example.com' })
        .expect(403);
    });

    it('returns 422 for an invalid email format', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me/email')
        .send({ email: 'not-an-email' })
        .expect(422);

      expect(mockUsersService.updateEmail).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Guard audit — no controller spec in this repo exercises a real 401
  // through JwtAuthGuard (every one that touches it overrides canActivate
  // to always succeed), and there is no guard-level unit test either.
  // Following that idiom, identity here comes from a stand-in middleware
  // rather than a real token. What we can and do assert: neither new
  // route carries the @Public() marker the global guard checks to skip
  // enforcement, so in the real app JwtAuthGuard will run for both.
  // -----------------------------------------------------------------------
  describe('guard enforcement (decorator audit)', () => {
    it('does not mark me/settings, me/billing, or me/email as public', () => {
      const reflector = new Reflector();
      const isSettingsPublic = reflector.get(
        IS_PUBLIC_KEY,
        UsersController.prototype.getSettings,
      );
      const isBillingPublic = reflector.get(
        IS_PUBLIC_KEY,
        UsersController.prototype.getBillingInfo,
      );
      const isEmailPublic = reflector.get(
        IS_PUBLIC_KEY,
        UsersController.prototype.updateEmail,
      );

      expect(isSettingsPublic).toBeUndefined();
      expect(isBillingPublic).toBeUndefined();
      expect(isEmailPublic).toBeUndefined();
    });
  });
});
