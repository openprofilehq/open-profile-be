// AFTER
import { ApiProperty } from '@nestjs/swagger';
import { IsUrl, IsString, IsNotEmpty } from 'class-validator';

export class RecordLinkClickDto {
  @ApiProperty({
    example: 'calvin',
    description: 'Username of the profile the link is on',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'https://github.com/calvin',
    description:
      'The link as stored on the profile, not the rendered href. Email and phone links use their encoded https form.',
  })
  @IsUrl()
  linkUrl: string;
}
