import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileContentDto } from './profile-content.dto';

export class ProfileDraftResponseDto {
  @ApiProperty({ example: '8b59d8f1-45bb-4bc9-84e0-6d5dbdc17c4a' })
  profileId: string;

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

  @ApiPropertyOptional({ type: () => ProfileContentDto, nullable: true })
  content: ProfileContentDto | null;

  @ApiProperty({
    enum: ['draft', 'published'],
    description:
      '"draft" = unsaved changes exist. "published" = no draft; response reflects the published profile row.',
  })
  source: 'draft' | 'published';

  @ApiProperty({
    description:
      'Store this value and send it as the X-Draft-Version header on the next PUT /profiles/content call.',
    example: '2026-05-19T16:05:00.000Z',
  })
  updatedAt: Date;
}
