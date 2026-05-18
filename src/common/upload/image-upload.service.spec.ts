import { Test, TestingModule } from '@nestjs/testing';
import { ImageUploadService } from './image-upload.service';
import { join } from 'path';
import * as fs from 'fs';

const mockToFile = jest.fn().mockResolvedValue(undefined);
const mockJpeg = jest.fn().mockReturnValue({ toFile: mockToFile });
const mockResize = jest.fn().mockReturnValue({ jpeg: mockJpeg });

jest.mock('sharp', () => jest.fn(() => ({
  resize: mockResize,
  jpeg: mockJpeg,
  toFile: mockToFile,
})));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('fake-image-data')),
  unlinkSync: jest.fn(),
  promises: {
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('ImageUploadService', () => {
  let service: ImageUploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImageUploadService],
    }).compile();

    service = module.get<ImageUploadService>(ImageUploadService);
    jest.clearAllMocks();
  });

  describe('upload', () => {
    const mockFile = {
      fieldname: 'photo',
      originalname: 'test-image.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('fake-image-buffer'),
      size: 1024,
      stream: null as any,
      destination: '',
      filename: 'test-uuid.jpg',
      path: '',
    };

    it('creates the upload directory if it does not exist', async () => {
      await service.upload(mockFile, 'profiles');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        join(process.cwd(), 'uploads', 'profiles'),
        { recursive: true },
      );
    });

    it('processes the image with sharp (resize + jpeg)', async () => {
      await service.upload(mockFile, 'profiles');

      expect(mockResize).toHaveBeenCalledWith(1200, 1200, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      expect(mockJpeg).toHaveBeenCalledWith({ quality: 85 });
      expect(mockToFile).toHaveBeenCalled();
    });

    it('returns the correct URL path', async () => {
      const result = await service.upload(mockFile, 'profiles');

      expect(result).toBe('/uploads/profiles/test-uuid.jpg');
    });

    it('reads from disk path when buffer is undefined and file.path exists', async () => {
      const { buffer, ...rest } = mockFile;
      const diskFile = { ...rest, buffer: undefined as unknown as Buffer, path: '/tmp/raw-file' };
      await service.upload(diskFile, 'projects');

      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/raw-file');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/raw-file');
    });
  });

  describe('delete', () => {
    it('does nothing when relativePath is empty', async () => {
      await service.delete('');
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('deletes the file at the resolved absolute path', async () => {
      await service.delete('/uploads/profiles/test.jpg');

      expect(fs.promises.unlink).toHaveBeenCalledWith(
        join(process.cwd(), '/uploads/profiles/test.jpg'),
      );
    });

    it('swallows error when file does not exist', async () => {
      (fs.promises.unlink as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.delete('/uploads/profiles/missing.jpg'),
      ).resolves.toBeUndefined();
    });
  });
});
