import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Display name for the profile',
    example: 'Jane Doe',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Full name cannot be empty.' })
  @MaxLength(100, { message: 'Full name cannot exceed 100 characters.' })
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Short biography. Send null to clear.',
    example: 'Software developer passionate about open source',
    maxLength: 200,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Bio cannot exceed 200 characters.' })
  bio?: string | null;

  @ApiPropertyOptional({
    description: 'Cloudinary URL to profile photo',
    example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  })
  @IsOptional()
  @IsUrl(
    { host_whitelist: [/\.cloudinary\.com$/] },
    { message: 'photoUrl must be a valid Cloudinary URL' },
  )
  photoUrl?: string;
}
