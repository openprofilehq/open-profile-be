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
import { Transform } from 'class-transformer';

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
    description: 'Full name of the user',
    example: 'Jane Doe',
    minLength: 1,
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'Full name is required.' })
  @IsString({ message: 'Full name must be a string.' })
  @MinLength(1, { message: 'Full name is required.' })
  @MaxLength(255, {
    message: 'Full name must not be more than 255 characters.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  fullName: string;

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
