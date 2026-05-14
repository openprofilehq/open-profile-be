import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { JwtAuthGuard } from './../src/modules/auth/guards/jwt-auth.guard';
import { MockJwtAuthGuard } from './mocks/mock-jwt-auth.guard';

describe('Uploads (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('POST /uploads/profile-photo-url → 200 with presigned URL', async () => {
    const response = await request(app.getHttpServer())
      .post('/uploads/profile-photo-url')
      .send({})
      .expect(200);

    expect(response.body).toHaveProperty('uploadUrl');
    expect(response.body).toHaveProperty('expectedUrl');
    expect(typeof response.body.uploadUrl).toBe('string');
    expect(typeof response.body.expectedUrl).toBe('string');
    expect(response.body.uploadUrl).toContain('cloudinary.com');
    expect(response.body.expectedUrl).toContain('cloudinary.com');
  });

  it('POST /uploads/profile-photo-url without auth → 401', async () => {
    // Create a fresh app without the mock guard to test actual auth behavior
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const unauthApp = moduleFixture.createNestApplication();
    await unauthApp.init();

    await request(unauthApp.getHttpServer())
      .post('/uploads/profile-photo-url')
      .send({})
      .expect(401);

    await unauthApp.close();
  });

  afterEach(async () => {
    await app.close();
  });
});
