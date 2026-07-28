import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class CreateInviteDto {
  @ApiProperty({ example: 'friend@example.com' })
  @IsEmail()
  recipientEmail: string;
}
