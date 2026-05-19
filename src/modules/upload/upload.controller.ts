import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
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
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  imageFileFilter,
  imageLimits,
} from '../../common/upload/multer.config';
import {
  ImageUploadService,
  UploadCategory,
} from '../../common/upload/image-upload.service';

@ApiTags('uploads')
@ApiBearerAuth('JWT')
@Controller({ path: 'uploads', version: '1' })
export class UploadController {
  constructor(private readonly imageUploadService: ImageUploadService) {}

  @Post(':category/image-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload an image and get its URL' })
  @ApiParam({
    name: 'category',
    required: true,
    description: 'Upload category (profiles, projects, portfolio)',
    schema: { type: 'string', enum: ['profiles', 'projects', 'portfolio'] },
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Image uploaded successfully' })
  @ApiResponse({
    status: 400,
    description: 'No file, invalid file type, or invalid category',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: imageFileFilter,
      limits: imageLimits,
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Param('category') category: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!['profiles', 'projects', 'portfolio'].includes(category)) {
      throw new BadRequestException(`Invalid category: ${category}`);
    }
    const { url, path } = await this.imageUploadService.upload(
      file,
      category as UploadCategory,
    );
    return { url, path };
  }
}
