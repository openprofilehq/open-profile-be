import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('profile-photo-url')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate a presigned Cloudinary upload URL for profile photo',
  })
  @ApiResponse({
    status: 200,
    description:
      'Presigned upload URL and expected CDN URL returned successfully',
    schema: {
      type: 'object',
      properties: {
        uploadUrl: { type: 'string', format: 'url' },
        expectedUrl: { type: 'string', format: 'url' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 502,
    description: 'Bad Gateway - Cloudinary configuration or network error',
  })
  generateProfilePhotoUploadUrl() {
    return this.uploadsService.generateProfilePhotoUploadUrl();
  }
}
