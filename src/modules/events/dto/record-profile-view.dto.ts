import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordProfileViewDto {
  @ApiProperty({
    example: 'calvin',
    description: 'Username of the profile being viewed',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  username: string;

  @ApiPropertyOptional({
    example: 'twitter',
    description: 'Explicit traffic source, e.g. from a ?src= query parameter',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  src?: string;

  @ApiPropertyOptional({
    example: '8d720d34-7627-4c17-b017-6d91c8ccb7be',
    description:
      'searchId of the search that led to this view, for search conversion tracking',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  referrerSearchId?: string;

  @ApiPropertyOptional({
    example: 'https://www.google.com/',
    description:
      'document.referrer; used to infer the source when src is absent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;
}
