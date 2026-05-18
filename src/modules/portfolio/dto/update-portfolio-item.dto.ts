import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdatePortfolioItemDto {
  @ApiPropertyOptional({
    maxLength: 150,
    description: 'Portfolio item title',
    example: 'My LinkedIn Clone',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Portfolio item description (max 500 characters)',
    example: 'A full-stack LinkedIn clone built with NestJS and React.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters.' })
  description?: string;

  @ApiPropertyOptional({
    description: 'URL to the project (must include https://)',
    example: 'https://github.com/yourname/',
  })
  @IsOptional()
  @IsUrl(
    { require_protocol: true },
    { message: 'projectUrl must be a valid URL.' },
  )
  projectUrl?: string;

  @ApiPropertyOptional({
    description: 'Project image URL (obtained from POST /uploads/project-image-url). Send null to remove.',
    example: '/uploads/projects/uuid.jpg',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;
}
