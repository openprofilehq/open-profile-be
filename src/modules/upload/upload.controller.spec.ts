import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { UploadController } from './upload.controller';
import { ImageUploadService } from '../../common/upload/image-upload.service';

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

  describe('POST /uploads/profile-photo-url', () => {
    it('returns 200 with photoUrl when a valid image is uploaded', async () => {
      mockImageUploadService.upload.mockResolvedValue(
        '/uploads/profiles/uuid-profile.jpg',
      );

      await request(app.getHttpServer())
        .post('/uploads/profile-photo-url')
        .attach('photo', Buffer.from('fake-image'), {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({
            photoUrl: '/uploads/profiles/uuid-profile.jpg',
          });
        });
    });

    it('returns 400 when no file is attached', async () => {
      await request(app.getHttpServer())
        .post('/uploads/profile-photo-url')
        .expect(400);
    });
  });

  describe('POST /uploads/project-image-url', () => {
    it('returns 200 with imageUrl when a valid image is uploaded', async () => {
      mockImageUploadService.upload.mockResolvedValue(
        '/uploads/projects/uuid-project.jpg',
      );

      await request(app.getHttpServer())
        .post('/uploads/project-image-url')
        .attach('image', Buffer.from('fake-image'), {
          filename: 'project.png',
          contentType: 'image/png',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({
            imageUrl: '/uploads/projects/uuid-project.jpg',
          });
        });
    });

    it('returns 400 when no file is attached', async () => {
      await request(app.getHttpServer())
        .post('/uploads/project-image-url')
        .expect(400);
    });
  });
});
