import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../users/entities/user.entity';

export class AdminUserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'John Doe', nullable: true })
  fullName: string | null;

  @ApiProperty({ example: 'john-doe', nullable: true })
  username: string | null;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty({ enum: UserRole, nullable: true })
  role: UserRole | null;

  @ApiProperty({ example: true })
  isPublished: boolean;

  @ApiProperty({
    example: true,
    description: 'True unless the user status is suspended or deactivated.',
  })
  isActive: boolean;

  @ApiProperty({ example: 'https://example.com/photo.png', nullable: true })
  photoUrl: string | null;

  @ApiProperty({ example: '2026-08-10T09:00:00.000Z' })
  createdAt: Date;
}

export class AdminUserDetailDto extends AdminUserSummaryDto {
  @ApiProperty({
    example: 72.22,
    description: 'Profile completion percentage (0-100).',
  })
  profileCompletion: number;

  @ApiProperty({ example: 124, description: 'Total profile views (all-time).' })
  views: number;

  @ApiProperty({
    example: 18,
    description: 'Total link clicks on the profile (all-time).',
  })
  clicks: number;

  @ApiProperty({
    example: 0.25,
    description:
      'Search conversion rate (0-1): fraction of searches that surfaced the ' +
      'profile and resulted in at least one view.',
  })
  searchConversion: number;
}

export class UserSearchDataDto {
  @ApiProperty({ type: [AdminUserSummaryDto] })
  results: AdminUserSummaryDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class AdminUserSearchResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: UserSearchDataDto })
  data: UserSearchDataDto;
}

export class AdminUserDetailResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: AdminUserDetailDto })
  data: AdminUserDetailDto;
}

export class StatusChangeResultDto {
  @ApiProperty({ enum: UserStatus })
  from: UserStatus;

  @ApiProperty({ enum: UserStatus })
  to: UserStatus;

  @ApiProperty({
    example: true,
    description:
      'False when the user already had the target status and no change ' +
      'was applied.',
  })
  changed: boolean;
}

export class AdminUserStatusResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: StatusChangeResultDto })
  data: StatusChangeResultDto;
}
