import {
  INestApplication,
  ValidationPipe,
  VersioningType,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationError } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { EventsService } from '../events/events.service';
import { EventType } from '../events/entities/event.entity';

jest.mock('@t3-oss/env-core', () => ({
  createEnv: () => ({}) as never,
}));

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

jest.mock('../../config/env', () => ({
  env: {},
}));

const UUID_V1 = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const USERNAME = 'testuser';
const NOW = '2026-05-20T12:00:00.000Z';

describe('ProfileController (integration)', () => {
  let app: INestApplication<App>;
  let mockProfileService: Record<string, jest.Mock>;
  let mockEventsService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockProfileService = {
      createProfile: jest.fn(),
      getPublicProfile: jest.fn(),
      getDashboardProfile: jest.fn(),
      updateProfile: jest.fn(),
      patchComponent: jest.fn(),
      reorderComponents: jest.fn(),
      publishProfile: jest.fn(),
      getProfileContent: jest.fn(),
      upsertDraft: jest.fn(),
      getDraftState: jest.fn(),
      updateAppearance: jest.fn(),
      getAppearance: jest.fn(),
      updateVisibility: jest.fn(),
    };
    mockEventsService = {
      recordEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: ProfileService, useValue: mockProfileService },
        { provide: EventsService, useValue: mockEventsService },
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
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/profiles
  // -----------------------------------------------------------------------
  describe('POST /api/v1/profiles', () => {
    it('returns 201 on successful creation', async () => {
      mockProfileService.createProfile.mockResolvedValue({
        id: UUID_V1,
        username: USERNAME,
        fullName: 'Test User',
        bio: null,
        photoUrl: null,
        templateType: null,
        themeSettings: null,
        ctaLabel: null,
        ctaUrl: null,
        isPublished: true,
        hasUnpublishedChanges: false,
        isVerified: false,
        isPublic: true,
        createdAt: NOW,
        updatedAt: NOW,
      });

      await request(app.getHttpServer())
        .post('/api/v1/profiles')
        .send({ username: USERNAME, fullName: 'Test User' })
        .expect(201)
        .expect((res) => {
          expect(res.body.username).toBe(USERNAME);
          expect(res.body.isPublished).toBe(true);
          expect(res.body.isPublic).toBe(true);
        });
    });

    it('returns 409 when username is taken', async () => {
      mockProfileService.createProfile.mockRejectedValue(
        new ConflictException('Username already taken'),
      );

      await request(app.getHttpServer())
        .post('/api/v1/profiles')
        .send({ username: USERNAME, fullName: 'Test User' })
        .expect(409);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v1/profiles/content
  // -----------------------------------------------------------------------
  describe('PUT /api/v1/profiles/content', () => {
    it('returns 200 when upserting draft', async () => {
      mockProfileService.upsertDraft.mockResolvedValue({
        profileId: UUID_V1,
        bio: 'Updated bio',
        photoUrl: null,
        content: null,
        themeSettings: null,
        source: 'draft',
        updatedAt: NOW,
      });

      await request(app.getHttpServer())
        .put('/api/v1/profiles/content')
        .send({ bio: 'Updated bio' })
        .expect(200)
        .expect((res) => {
          expect(res.body.source).toBe('draft');
          expect(res.body.bio).toBe('Updated bio');
        });
    });

    it('returns 409 on concurrency conflict', async () => {
      mockProfileService.upsertDraft.mockRejectedValue(
        new ConflictException(
          'Draft was modified by another session. Re-fetch and retry.',
        ),
      );

      await request(app.getHttpServer())
        .put('/api/v1/profiles/content')
        .set('x-draft-version', 'old-version')
        .send({ bio: 'Updated bio' })
        .expect(409);
    });

    it('returns 422 on invalid body', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/profiles/content')
        .send({ bio: true })
        .expect(422);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/profiles/content/state
  // -----------------------------------------------------------------------
  describe('GET /api/v1/profiles/content/state', () => {
    it('returns 200 with draft state', async () => {
      mockProfileService.getDraftState.mockResolvedValue({
        status: 'success',
        hasDraft: true,
        draftId: UUID_V1,
        updatedAt: NOW,
      });

      await request(app.getHttpServer())
        .get('/api/v1/profiles/content/state')
        .expect(200)
        .expect((res) => {
          expect(res.body.hasDraft).toBe(true);
        });
    });

    it('returns 404 when profile not found', async () => {
      mockProfileService.getDraftState.mockRejectedValue(
        new NotFoundException('Profile not found'),
      );

      await request(app.getHttpServer())
        .get('/api/v1/profiles/content/state')
        .expect(404);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/profiles/content
  // -----------------------------------------------------------------------
  describe('GET /api/v1/profiles/content', () => {
    it('returns 200 with profile content', async () => {
      mockProfileService.getProfileContent.mockResolvedValue({
        profileId: UUID_V1,
        bio: 'My bio',
        photoUrl: null,
        content: null,
        themeSettings: null,
        source: 'published',
        updatedAt: NOW,
      });

      await request(app.getHttpServer())
        .get('/api/v1/profiles/content')
        .expect(200)
        .expect((res) => {
          expect(res.body.profileId).toBe(UUID_V1);
        });
    });

    it('returns 404 when profile not found', async () => {
      mockProfileService.getProfileContent.mockRejectedValue(
        new NotFoundException('Profile not found'),
      );

      await request(app.getHttpServer())
        .get('/api/v1/profiles/content')
        .expect(404);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/profiles/publish
  // -----------------------------------------------------------------------
  describe('POST /api/v1/profiles/publish', () => {
    it('returns 200 on publish', async () => {
      mockProfileService.publishProfile.mockResolvedValue({
        status: 'success',
        message: 'Profile published successfully',
        data: { profileId: UUID_V1, username: USERNAME, publishedAt: NOW },
      });

      await request(app.getHttpServer())
        .post('/api/v1/profiles/publish')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('success');
        });
    });

    it('returns 404 when profile not found', async () => {
      mockProfileService.publishProfile.mockRejectedValue(
        new NotFoundException('Complete onboarding before publishing.'),
      );

      await request(app.getHttpServer())
        .post('/api/v1/profiles/publish')
        .expect(404);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v1/profiles/:username
  // -----------------------------------------------------------------------
  describe('PATCH /api/v1/profiles/:username', () => {
    it('returns 200 on update', async () => {
      mockProfileService.updateProfile.mockResolvedValue({
        id: UUID_V1,
        username: USERNAME,
        fullName: 'Updated Name',
        bio: null,
        photoUrl: null,
        templateType: null,
        themeSettings: null,
        ctaLabel: null,
        ctaUrl: null,
        isPublished: true,
        hasUnpublishedChanges: true,
        isVerified: false,
        isPublic: true,
        createdAt: NOW,
        updatedAt: NOW,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/profiles/${USERNAME}`)
        .send({ fullName: 'Updated Name' })
        .expect(200)
        .expect((res) => {
          expect(res.body.fullName).toBe('Updated Name');
          expect(res.body.isPublic).toBe(true);
        });
    });

    it('returns 403 when updating someone else profile', async () => {
      mockProfileService.updateProfile.mockRejectedValue(
        new ForbiddenException(
          "You don't have permission to update this profile.",
        ),
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/profiles/${USERNAME}`)
        .send({ fullName: 'Hacker' })
        .expect(403);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/profiles/dashboard
  // -----------------------------------------------------------------------
  describe('GET /api/v1/profiles/dashboard', () => {
    it('returns 200 with profile and components', async () => {
      mockProfileService.getDashboardProfile.mockResolvedValue({
        id: UUID_V1,
        username: USERNAME,
        fullName: 'Test User',
        bio: null,
        photoUrl: null,
        templateType: null,
        themeSettings: null,
        ctaLabel: null,
        ctaUrl: null,
        isPublished: true,
        hasUnpublishedChanges: false,
        isVerified: false,
        isPublic: true,
        createdAt: NOW,
        updatedAt: NOW,
        components: [],
      });

      await request(app.getHttpServer())
        .get('/api/v1/profiles/dashboard')
        .expect(200)
        .expect((res) => {
          expect(res.body.components).toEqual([]);
          expect(res.body.isPublic).toBe(true);
        });
    });

    it('returns 404 when profile not found', async () => {
      mockProfileService.getDashboardProfile.mockRejectedValue(
        new NotFoundException('Profile not found'),
      );

      await request(app.getHttpServer())
        .get('/api/v1/profiles/dashboard')
        .expect(404);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/profiles/:username  (public)
  // -----------------------------------------------------------------------
  describe('GET /api/v1/profiles/:username (public)', () => {
    it('returns 200 with profile data, ETag, and cache headers', async () => {
      const etag = '"mocked-etag"';
      mockProfileService.getPublicProfile.mockResolvedValue({
        profileId: UUID_V1,
        userId: USER_ID,
        data: {
          username: USERNAME,
          fullName: 'Test User',
          photoUrl: null,
          templateType: null,
          themeSettings: null,
          content: null,
        },
        etag,
        fromCache: false,
      });

      await request(app.getHttpServer())
        .get(`/api/v1/profiles/${USERNAME}`)
        .expect(200)
        .expect('ETag', etag)
        .expect('Cache-Control', 'public, max-age=60')
        .expect('X-Cache', 'MISS')
        .expect((res) => {
          expect(res.body.username).toBe(USERNAME);
          expect(res.body).not.toHaveProperty('isPublic');
        });

      expect(mockEventsService.recordEvent).toHaveBeenCalledWith({
        eventType: EventType.PROFILE_VIEWED,
        profileId: UUID_V1,
        actorId: undefined,
      });
    });

    it('returns 304 when ETag matches If-None-Match header', async () => {
      const etag = '"matching-etag"';
      mockProfileService.getPublicProfile.mockResolvedValue({
        profileId: UUID_V1,
        userId: USER_ID,
        data: {
          username: USERNAME,
          fullName: 'Test User',
          photoUrl: null,
          templateType: null,
          themeSettings: null,
          content: null,
        },
        etag,
        fromCache: false,
      });

      await request(app.getHttpServer())
        .get(`/api/v1/profiles/${USERNAME}`)
        .set('If-None-Match', etag)
        .expect(304);

      expect(mockEventsService.recordEvent).not.toHaveBeenCalled();
    });

    it('returns 404 when profile not found', async () => {
      mockProfileService.getPublicProfile.mockRejectedValue(
        new NotFoundException({ error: 'not_found' }),
      );

      await request(app.getHttpServer())
        .get(`/api/v1/profiles/${USERNAME}`)
        .expect(404);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v1/profiles/me/components/:componentId
  // -----------------------------------------------------------------------
  describe('PATCH /api/v1/profiles/me/components/:componentId', () => {
    it('returns 200 when component is updated', async () => {
      mockProfileService.patchComponent.mockResolvedValue({
        id: UUID_V1,
        profileId: UUID_V1,
        sectionType: 'bio',
        title: 'Updated Title',
        content: 'Hello!',
        metadata: null,
        isEnabled: false,
        displayOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/profiles/me/components/${UUID_V1}`)
        .send({ isEnabled: false, title: 'Updated Title' })
        .expect(200)
        .expect((res) => {
          expect(res.body.isEnabled).toBe(false);
          expect(res.body.title).toBe('Updated Title');
        });
    });

    it('returns 400 when componentId is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/me/components/not-a-uuid')
        .send({ isEnabled: false })
        .expect(400);
    });

    it('returns 404 when component not found', async () => {
      mockProfileService.patchComponent.mockRejectedValue(
        new NotFoundException('Component not found'),
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/profiles/me/components/${UUID_V1}`)
        .send({ isEnabled: false })
        .expect(404);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v1/profiles/me/components/order
  // -----------------------------------------------------------------------
  describe('PUT /api/v1/profiles/me/components/order', () => {
    it('returns 200 when components are reordered', async () => {
      mockProfileService.reorderComponents.mockResolvedValue([
        {
          id: UUID_V1,
          profileId: UUID_V1,
          sectionType: 'links',
          title: 'Links',
          content: null,
          metadata: null,
          isEnabled: true,
          displayOrder: 0,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);

      await request(app.getHttpServer())
        .put('/api/v1/profiles/me/components/order')
        .send({ componentIds: [UUID_V1] })
        .expect(200)
        .expect((res) => {
          expect(res.body.components).toHaveLength(1);
        });
    });

    it('returns 422 when componentIds is empty', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/profiles/me/components/order')
        .send({ componentIds: [] })
        .expect(422);
    });

    it('returns 422 when componentIds has duplicate', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/profiles/me/components/order')
        .send({ componentIds: [UUID_V1, UUID_V1] })
        .expect(422);
    });

    it('returns 422 when componentIds contains non-UUID', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/profiles/me/components/order')
        .send({ componentIds: ['not-a-uuid'] })
        .expect(422);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v1/profiles/appearance
  // -----------------------------------------------------------------------
  describe('PATCH /api/v1/profiles/appearance', () => {
    const fullPayload = {
      global: {
        template: 'default',
        accentColour: '#6366f1',
        backgroundColour: '#ffffff',
        textColour: '#111827',
        font: 'inter',
        cornerStyle: 'rounded',
        spacing: 16,
        theme: 'dark',
      },
    };

    it('returns 200 with saved appearance on valid full payload', async () => {
      mockProfileService.updateAppearance.mockResolvedValue({
        status: 'success',
        appearance: fullPayload,
      });

      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send(fullPayload)
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('success');
          expect(res.body.appearance).toEqual(fullPayload);
        });
    });

    it('returns 200 with partial payload (single field)', async () => {
      const partial = { global: { theme: 'light' } };
      mockProfileService.updateAppearance.mockResolvedValue({
        status: 'success',
        appearance: partial,
      });

      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send(partial)
        .expect(200)
        .expect((res) => {
          expect(res.body.appearance).toEqual(partial);
        });
    });

    it('returns 422 for invalid template', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { template: 'unknown' } })
        .expect(422)
        .expect((res) => {
          expect(res.body.message[0].error).toContain(
            'Invalid template selection',
          );
        });
    });

    it('returns 422 for hex colour missing # prefix', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { accentColour: '6366f1' } })
        .expect(422)
        .expect((res) => {
          expect(res.body.message[0].error).toContain(
            'Please provide a valid hex colour code',
          );
        });
    });

    it('returns 422 for short hex colour', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { accentColour: '#fff' } })
        .expect(422)
        .expect((res) => {
          expect(res.body.message[0].error).toContain(
            'Please provide a valid hex colour code',
          );
        });
    });

    it('returns 422 for backgroundColour missing # prefix', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { backgroundColour: 'ffffff' } })
        .expect(422)
        .expect((res) => {
          expect(res.body.message[0].error).toContain(
            'Please provide a valid hex colour code',
          );
        });
    });

    it('returns 422 for short backgroundColour hex', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { backgroundColour: '#fff' } })
        .expect(422)
        .expect((res) => {
          expect(res.body.message[0].error).toContain(
            'Please provide a valid hex colour code',
          );
        });
    });

    it('returns 422 for textColour missing # prefix', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { textColour: '111827' } })
        .expect(422)
        .expect((res) => {
          expect(res.body.message[0].error).toContain(
            'Please provide a valid hex colour code',
          );
        });
    });

    it('returns 422 for short textColour hex', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { textColour: '#fff' } })
        .expect(422)
        .expect((res) => {
          expect(res.body.message[0].error).toContain(
            'Please provide a valid hex colour code',
          );
        });
    });

    it('returns 422 for invalid font', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { font: 'comic-sans' } })
        .expect(422)
        .expect((res) => {
          expect(res.body.message[0].error).toContain('Invalid font selection');
        });
    });

    it('returns 422 for invalid cornerStyle', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { cornerStyle: 'extreme' } })
        .expect(422)
        .expect((res) => {
          expect(res.body.message[0].error).toContain('Invalid corner style');
        });
    });

    it('returns 422 for spacing below 0', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { spacing: -1 } })
        .expect(422);
    });

    it('returns 422 for spacing above 40', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { spacing: 41 } })
        .expect(422);
    });

    it('returns 422 for invalid theme', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ global: { theme: 'neon' } })
        .expect(422)
        .expect((res) => {
          expect(res.body.message[0].error).toContain('Invalid theme');
        });
    });

    it('returns 404 when profile not found', async () => {
      mockProfileService.updateAppearance.mockRejectedValue(
        new NotFoundException(
          'Profile not found. Please complete onboarding first.',
        ),
      );

      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send(fullPayload)
        .expect(404);
    });

    it('returns 422 for unknown fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/appearance')
        .send({ unknownField: 'something' })
        .expect(422);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v1/profiles/me/visibility
  // -----------------------------------------------------------------------
  describe('PATCH /api/v1/profiles/me/visibility', () => {
    it('returns 200 with the updated visibility state', async () => {
      mockProfileService.updateVisibility.mockResolvedValue({
        isPublic: false,
      });

      await request(app.getHttpServer())
        .patch('/api/v1/profiles/me/visibility')
        .send({ isPublic: false })
        .expect(200)
        .expect((res) => {
          expect(res.body.isPublic).toBe(false);
        });
    });

    it('returns 404 when the caller has no profile', async () => {
      mockProfileService.updateVisibility.mockRejectedValue(
        new NotFoundException('Profile not found'),
      );

      await request(app.getHttpServer())
        .patch('/api/v1/profiles/me/visibility')
        .send({ isPublic: false })
        .expect(404);
    });

    it('returns 422 when isPublic is not a boolean', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/me/visibility')
        .send({ isPublic: 'yes' })
        .expect(422);
    });

    it('returns 422 for unknown fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/me/visibility')
        .send({ isPublic: false, extra: 'field' })
        .expect(422);
    });
  });
});
