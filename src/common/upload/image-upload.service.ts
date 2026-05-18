import { Injectable } from '@nestjs/common';
import { join } from 'path';
import * as fs from 'fs';
import sharp from 'sharp';

@Injectable()
export class ImageUploadService {
  async upload(
    file: Express.Multer.File,
    subdirectory: string,
  ): Promise<string> {
    const dir = join(process.cwd(), 'uploads', subdirectory);
    fs.mkdirSync(dir, { recursive: true });

    const filename = file.filename ?? file.originalname;
    const outputPath = join(dir, filename);

    const buffer = file.buffer ?? fs.readFileSync(file.path);

    await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    if (file.path) {
      fs.unlinkSync(file.path);
    }

    return `/uploads/${subdirectory}/${filename}`;
  }

  async delete(relativePath: string): Promise<void> {
    if (!relativePath) return;
    const absolutePath = join(process.cwd(), relativePath);
    try {
      await fs.promises.unlink(absolutePath);
    } catch {
      // File may not exist — skip
    }
  }
}
