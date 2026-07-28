import { ApiProperty } from '@nestjs/swagger';

export class CreateInviteResponseDto {
  @ApiProperty({ example: '3f9a2b1c-...' })
  id: string;

  @ApiProperty({ example: 'friend@example.com' })
  recipientEmail: string;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  expiresAt: Date;
}
