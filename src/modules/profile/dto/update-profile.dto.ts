import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
    description: 'Profile photo URL (obtained from POST /uploads/profile-photo-url)',
    example: '/uploads/profiles/uuid.jpg',
  })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}
