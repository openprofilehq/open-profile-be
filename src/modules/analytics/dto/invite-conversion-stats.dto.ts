import { ApiProperty } from '@nestjs/swagger';

export class InviteConversionStatsDto {
  @ApiProperty({
    example: 12,
    description: 'Invites sent by this user in range',
  })
  invites_sent: number;

  @ApiProperty({
    example: 5,
    description: 'Invites sent by this user that were claimed in range',
  })
  invites_claimed: number;

  @ApiProperty({
    example: 0.42,
    description: 'invites_claimed / invites_sent, 0 when invites_sent is 0',
  })
  conversion_rate: number;
}
