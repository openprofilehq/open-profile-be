import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const NONEXISTENT_UUID = '22222222-2222-4222-8222-222222222222';

describe('AnalyticsController (integration)', () => {
  let app: INestApplication<App>;
  let mockAnalyticsService: { recordView: jest.Mock };

  beforeAll(async () => {
    mockAnalyticsService = {
      recordView: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe({
            whitelist: true,
            transform: true,
          }),
        },
      ],
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /view with valid profileId → 201', async () => {
    mockAnalyticsService.recordView.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/analytics/view')
      .send({ profileId: VALID_UUID })
      .expect(201)
      .expect((res) => {
        expect(res.body.message).toBe('View recorded');
      });
  });

  it('POST /view with invalid UUID → 400', async () => {
    await request(app.getHttpServer())
      .post('/analytics/view')
      .send({ profileId: 'not-a-uuid' })
      .expect(400);
  });

  it('POST /view with non-existent profileId → 404', async () => {
    mockAnalyticsService.recordView.mockRejectedValue(
      new NotFoundException('Profile not found'),
    );

    await request(app.getHttpServer())
      .post('/analytics/view')
      .send({ profileId: NONEXISTENT_UUID })
      .expect(404);
  });

  it('POST /view same IP twice within 5 min → both 201, only one DB row', async () => {
    mockAnalyticsService.recordView.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/analytics/view')
      .send({ profileId: VALID_UUID })
      .expect(201);

    await request(app.getHttpServer())
      .post('/analytics/view')
      .send({ profileId: VALID_UUID })
      .expect(201);

    expect(mockAnalyticsService.recordView).toHaveBeenCalledTimes(2);
  });

  it('POST /view 31 times in 1 min → 429 on 31st', async () => {
    mockAnalyticsService.recordView.mockResolvedValue(undefined);

    for (let i = 0; i < 30; i++) {
      await request(app.getHttpServer())
        .post('/analytics/view')
        .send({ profileId: VALID_UUID })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/analytics/view')
      .send({ profileId: VALID_UUID })
      .expect(429);
  }, 60_000);
});
