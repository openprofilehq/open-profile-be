import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreatePortfolioItemDto {
  @ApiProperty({
    maxLength: 150,
    description: 'Portfolio item title',
    example: 'My LinkedIn Clone',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({
    maxLength: 500,
    required: false,
    description: 'Portfolio item description (max 500 characters)',
    example: 'A full-stack LinkedIn clone built with NestJS and React.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters.' })
  description?: string;

  @ApiProperty({
    required: false,
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
    description: 'Project image URL (obtained from POST /uploads/project-image-url)',
    example: '/uploads/projects/uuid.jpg',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
