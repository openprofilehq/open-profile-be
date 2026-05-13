import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdatePortfolioItemDto {
  @ApiProperty({
    maxLength: 150,
    required: false,
    description: 'Portfolio item title',
    example: 'My LinkedIn Clone',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

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
}
