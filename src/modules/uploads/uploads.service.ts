import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env';

export interface UploadPresignedUrlResponse {
  uploadUrl: string;
  expectedUrl: string;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
  }

  generateProfilePhotoUploadUrl(): UploadPresignedUrlResponse {
    try {
      const timestamp = Math.floor(Date.now() / 1000);

      const folder = 'profile_photos';
      const randomSuffix = this.generateRandomString(8);
      const publicId = `${folder}/${timestamp}_${randomSuffix}`;

      const paramsToSign = {
        timestamp,
        public_id: publicId,
        upload_preset: env.CLOUDINARY_UPLOAD_PRESET,
        allowed_formats: 'jpg,jpeg,png,webp',
      };

      const signature = cloudinary.utils.api_sign_request(
        paramsToSign,
        env.CLOUDINARY_API_SECRET,
      );

      const baseUploadUrl = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`;

      const queryParams = new URLSearchParams({
        api_key: env.CLOUDINARY_API_KEY,
        timestamp: timestamp.toString(),
        public_id: publicId,
        upload_preset: env.CLOUDINARY_UPLOAD_PRESET,
        allowed_formats: 'jpg,jpeg,png,webp',
        signature,
      });

      const uploadUrl = `${baseUploadUrl}?${queryParams.toString()}`;

      // Build delivery URL manually — no transformations yet
      const expectedUrl = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}`;

      return { uploadUrl, expectedUrl };
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }
  private generateRandomString(length: number): string {
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
