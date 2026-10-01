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

    it('accepts an image between 2 MB and 5 MB', async () => {
      mockImageUploadService.upload.mockResolvedValue({
        url: 'http://localhost/uploads/projects/a.jpg',
        path: '/uploads/projects/a.jpg',
      });

      await request(app.getHttpServer())
        .post('/uploads/projects/image-url')
        .attach('file', Buffer.alloc(1.65 * 1024 * 1024), {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(200);
    });

    it('returns 413 with a readable message for an image over 5 MB', async () => {
      await request(app.getHttpServer())
        .post('/uploads/projects/image-url')
        .attach('file', Buffer.alloc(5.5 * 1024 * 1024), {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(413)
        .expect((res) => {
          expect(JSON.stringify(res.body)).toContain('5 MB or smaller');
        });
      expect(mockImageUploadService.upload).not.toHaveBeenCalled();
    });

    it('explains an unsupported type instead of reporting a missing file', async () => {
      await request(app.getHttpServer())
        .post('/uploads/projects/image-url')
        .attach('file', Buffer.from('<svg/>'), {
          filename: 'logo.svg',
          contentType: 'image/svg+xml',
        })
        .expect(400)
        .expect((res) => {
          expect(JSON.stringify(res.body)).toContain('JPG, PNG, WebP or GIF');
        });
    });
  });
});
