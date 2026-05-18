import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { imageFileFilter, imageLimits } from '../../common/upload/multer.config';
import { ImageUploadService } from '../../common/upload/image-upload.service';

@ApiTags('uploads')
@ApiBearerAuth('JWT')
@Controller({ path: 'uploads', version: '1' })
export class UploadController {
  constructor(private readonly imageUploadService: ImageUploadService) {}

  @Post('profile-photo-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload a profile photo and get its URL' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Photo uploaded successfully' })
  @ApiResponse({ status: 400, description: 'No file or invalid file type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      fileFilter: imageFileFilter,
      limits: imageLimits,
    }),
  )
  async uploadProfilePhoto(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const photoUrl = await this.imageUploadService.upload(file, 'profiles');
    return { photoUrl };
  }

  @Post('project-image-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload a project image and get its URL' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 400, description: 'No file or invalid file type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      fileFilter: imageFileFilter,
      limits: imageLimits,
    }),
  )
  async uploadProjectImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const imageUrl = await this.imageUploadService.upload(file, 'projects');
    return { imageUrl };
  }
}
