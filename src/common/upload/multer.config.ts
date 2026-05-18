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
  cb(null, validExt && validMime);
};

export const imageLimits = { fileSize: 2 * 1024 * 1024 };

export const createImageStorage = (subdirectory: string) =>
  diskStorage({
    destination: `uploads/${subdirectory}`,
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  });
