import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Display name for the profile',
    example: 'Jane Doe',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Full name cannot be empty.' })
  @MaxLength(255, { message: 'Full name cannot exceed 255 characters.' })
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Short biography. Send null to clear.',
    example: 'Software developer passionate about open source',
    maxLength: 300,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Bio cannot exceed 300 characters.' })
  bio?: string | null;

  @ApiPropertyOptional({
    description:
      'Profile photo URL (obtained from POST /uploads/profiles/image-url)',
    example: '/uploads/profiles/uuid.jpg',
  })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}
