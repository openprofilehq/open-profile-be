import { ApiProperty } from '@nestjs/swagger';

export class InviteLookupResponseDto {
  @ApiProperty({ example: 'friend@example.com' })
  recipientEmail: string;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  expiresAt: Date;
}
