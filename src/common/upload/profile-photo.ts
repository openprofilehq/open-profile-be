import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname } from 'path';

export const profilePhotoStorage = diskStorage({
  destination: 'uploads/profiles',
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${extname(file.originalname)}`);
  },
});

const allowedExtensions = /\.(jpg|jpeg|png|webp|gif)$/i;
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const profilePhotoFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const validExt = allowedExtensions.test(extname(file.originalname));
  const validMime = allowedMimeTypes.includes(file.mimetype);
  cb(null, validExt && validMime);
};

export const profilePhotoLimits = { fileSize: 2 * 1024 * 1024 };
