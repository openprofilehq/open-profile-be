import {
  IsOptional,
  IsString,
  IsUrl,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProfileContentDto } from './profile-content.dto';
import { ProfileContentWriteDto } from './profile-content-write.dto';

export class UpsertDraftDto {
  @ApiPropertyOptional({
    example: 'Software Engineer',
    description: 'User bio',
  })
  @IsOptional()
  @IsString()
  bio?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.com/photo.jpg',
  })
  @IsOptional()
  @IsUrl()
  photoUrl?: string | null;

  @ApiPropertyOptional({
    type: ProfileContentDto,
    description: 'Full profile structured content',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileContentWriteDto)
  @ValidateNested()
  @IsOptional()
  content?: ProfileContentWriteDto;

  @ApiPropertyOptional({
    description: 'Optimistic concurrency token from last GET /profiles/content',
    example: '2026-05-20T10:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}
