import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CheckUsernameDto {
  @ApiProperty({
    description: 'The username to check for availability',
    example: 'john-doe',
  })
  @IsString()
  @IsNotEmpty()
  username: string;
}
