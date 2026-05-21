import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileContentDto } from './profile-content.dto';

export class ProfileResponseDto {
  @ApiProperty({ example: '8b59d8f1-45bb-4bc9-84e0-6d5dbdc17c4a' })
  id: string;

  @ApiProperty({ example: 'calvin' })
  username: string;

  @ApiProperty({ example: 'Calvin Iordye' })
  fullName: string;

  @ApiPropertyOptional({
    example: 'Backend engineer building OpenProfile',
    nullable: true,
  })
  bio: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatar.jpg',
    nullable: true,
  })
  photoUrl: string | null;

  @ApiPropertyOptional({ example: 'developer', nullable: true })
  templateType: string | null;

  @ApiPropertyOptional({ nullable: true })
  themeSettings: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: 'Hire Me', nullable: true })
  ctaLabel: string | null;

  @ApiPropertyOptional({
    example: 'https://calvin.dev/contact',
    nullable: true,
  })
  ctaUrl: string | null;

  @ApiProperty({ example: true })
  isPublished: boolean;

  @ApiProperty({ example: false })
  hasUnpublishedChanges: boolean;

  @ApiProperty({ example: false })
  isVerified: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ComponentItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  sectionType: string;

  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiPropertyOptional({ nullable: true })
  content: string | null;

  @ApiProperty()
  displayOrder: number;

  @ApiProperty()
  isEnabled: boolean;

  @ApiPropertyOptional({ nullable: true })
  metadata: Record<string, unknown> | null;
}

export class DashboardProfileResponseDto extends ProfileResponseDto {
  @ApiProperty({ type: [ComponentItemDto] })
  components: ComponentItemDto[];
}

export class PublicProfileResponseDto {
  @ApiProperty({ example: 'calvin' })
  username: string;

  @ApiPropertyOptional({ example: 'Calvin Iordye', nullable: true })
  fullName: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatar.jpg',
    nullable: true,
  })
  photoUrl: string | null;

  @ApiPropertyOptional({ example: 'developer', nullable: true })
  templateType: string | null;

  @ApiPropertyOptional({ nullable: true })
  themeSettings: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: () => ProfileContentDto, nullable: true })
  content: ProfileContentDto | null;
}
