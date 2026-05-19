import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { UploadController } from './upload.controller';
import { ImageUploadService } from '../../common/upload/image-upload.service';

jest.mock('../../config/env', () => {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
  return { env: { APP_URL: process.env.APP_URL } };
});

describe('UploadController (integration)', () => {
  let app: INestApplication<App>;
  let mockImageUploadService: {
    upload: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    mockImageUploadService = {
      upload: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        { provide: ImageUploadService, useValue: mockImageUploadService },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /uploads/:category/image-url', () => {
    it('returns 200 with url and path when a valid image is uploaded', async () => {
      const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(
        /\/+$/,
        '',
      );
      mockImageUploadService.upload.mockResolvedValue({
        url: `${baseUrl}/uploads/profiles/my-image.jpg`,
        path: '/uploads/profiles/my-image.jpg',
      });

      await request(app.getHttpServer())
        .post('/uploads/profiles/image-url')
        .attach('file', Buffer.from('fake-image'), {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({
            url: `${baseUrl}/uploads/profiles/my-image.jpg`,
            path: '/uploads/profiles/my-image.jpg',
          });
        });
    });

    it('returns 400 when no file is attached', async () => {
      await request(app.getHttpServer())
        .post('/uploads/profiles/image-url')
        .expect(400);
    });

    it('returns 400 for an invalid category', async () => {
      await request(app.getHttpServer())
        .post('/uploads/invalid/image-url')
        .attach('file', Buffer.from('fake-image'), {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);
    });
  });
});
