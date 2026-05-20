import { ApiProperty } from '@nestjs/swagger';

export class DraftResponseDto {
  @ApiProperty({ example: 'success' })
  status: string;

  @ApiProperty({ example: 'Draft saved successfully' })
  message: string;

  @ApiProperty({
    example: {
      profileId: 'uuid',
      bio: 'Hello',
      photoUrl: null,
      content: {},
      updatedAt: '2026-05-20T10:00:00.000Z',
    },
  })
  data: {
    profileId: string;
    bio: string | null;
    photoUrl: string | null;
    content: any;
    updatedAt: Date;
  };
}
