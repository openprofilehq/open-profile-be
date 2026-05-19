import { Module } from '@nestjs/common';
import { ImageUploadService } from '../../common/upload/image-upload.service';
import { UploadController } from './upload.controller';

@Module({
  controllers: [UploadController],
  providers: [ImageUploadService],
})
export class UploadModule {}
