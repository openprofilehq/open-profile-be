import { ApiProperty } from '@nestjs/swagger';

export class UpdateEmailResponseDto {
  @ApiProperty({ example: 'newemail@example.com' })
  email: string;
}
