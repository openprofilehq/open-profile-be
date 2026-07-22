import { ApiProperty } from '@nestjs/swagger';
import { AuthProvider } from '../entities/user.entity';

// v1 shape only — additional settings groups (password, notifications, etc.)
// will be added incrementally; this DTO is additive, not exhaustive.
export class UserSettingsResponseDto {
  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'john-doe', nullable: true })
  username: string | null;

  @ApiProperty({ nullable: true })
  fullName: string | null;

  @ApiProperty({ default: false })
  isVerified: boolean;

  @ApiProperty({ enum: AuthProvider })
  authProvider: AuthProvider;

  @ApiProperty({ default: false })
  onboardingComplete: boolean;
}
