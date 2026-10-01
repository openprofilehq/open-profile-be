import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname } from 'path';

const allowedExtensions = /\.(jpg|jpeg|png|webp|gif)$/i;
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const imageFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const validExt = allowedExtensions.test(extname(file.originalname));
  const validMime = allowedMimeTypes.includes(file.mimetype);
  if (!validExt || !validMime) {
    cb(new BadRequestException(IMAGE_TYPE_MESSAGE), false);
    return;
  }
  cb(null, true);
};

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_SIZE_MESSAGE = 'Image must be 5 MB or smaller.';
export const IMAGE_TYPE_MESSAGE =
  'Only JPG, PNG, WebP or GIF images are allowed.';

export const imageLimits = { fileSize: IMAGE_MAX_BYTES + 1024 * 1024 };

export const createImageStorage = (subdirectory: string) =>
  diskStorage({
    destination: `uploads/${subdirectory}`,
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  });
