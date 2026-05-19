import { Injectable, Logger } from '@nestjs/common';
import { join, extname } from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { env } from '../../config/env';

export const UPLOAD_CATEGORIES = ['profiles', 'projects', 'portfolio'] as const;
export type UploadCategory = (typeof UPLOAD_CATEGORIES)[number];

@Injectable()
export class ImageUploadService {
  private readonly logger = new Logger(ImageUploadService.name);

  async upload(
    file: Express.Multer.File,
    subdirectory: UploadCategory,
  ): Promise<{ url: string; path: string }> {
    const dir = join(process.cwd(), 'uploads', subdirectory);
    fs.mkdirSync(dir, { recursive: true });

    const ext = extname(file.originalname);
    const baseName = file.originalname.replace(ext, '');
    const suffix = crypto.randomBytes(3).toString('hex');
    const filename = `${baseName}_${suffix}${ext}`;
    const outputPath = join(dir, filename);

    const buffer = file.buffer ?? fs.readFileSync(file.path);

    await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    if (file.path) {
      fs.unlinkSync(file.path);
    }

    const relativePath = `/uploads/${subdirectory}/${filename}`;
    return { url: this.resolveUrl(relativePath), path: relativePath };
  }

  resolveUrl(relativePath: string): string {
    const base = env.APP_URL.replace(/\/+$/, '');
    const path = relativePath.startsWith('/')
      ? relativePath
      : `/${relativePath}`;
    return `${base}${path}`;
  }

  async delete(relativePath: string): Promise<void> {
    if (!relativePath) return;
    const absolutePath = join(process.cwd(), relativePath);
    try {
      await fs.promises.unlink(absolutePath);
    } catch (error) {
      if (
        error instanceof Error &&
        ((error as NodeJS.ErrnoException).code === 'ENOENT' ||
          error.message === 'ENOENT')
      ) {
        this.logger.warn(`File not found for deletion: ${absolutePath}`);
        return;
      }
      this.logger.error(
        `Failed to delete file: ${absolutePath}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
