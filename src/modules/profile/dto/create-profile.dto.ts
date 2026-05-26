import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({
    description: 'Unique username for the profile',
    example: 'johndoe',
    minLength: 3,
    maxLength: 30,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'username can only contain lowercase letters, numbers and hyphens',
  })
  username: string;

  @ApiProperty({
    description: 'Short biography',
    example: 'Software developer passionate about open source',
    maxLength: 300,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio: string;

  @ApiProperty({
    description: 'URL to profile photo',
    example: 'https://example.com/photo.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  photoUrl: string;

  @ApiProperty({
    description: 'Whether the profile is published',
    example: true,
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
