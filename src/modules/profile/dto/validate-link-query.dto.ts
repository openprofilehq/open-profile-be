import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SUPPORTED_SOCIAL_ICONS = [
  'insta',
  'twitter',
  'linkedin',
  'github',
  'youtube',
  'tiktok',
  'behance',
  'flickr',
  'pinterest',
] as const;

export type SocialIconId = (typeof SUPPORTED_SOCIAL_ICONS)[number];

export class ValidateLinkQueryDto {
  @ApiProperty({
    example: '@devbyte',
    description: 'The URL or handle to validate',
  })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({
    example: 'github',
    description: 'Icon ID — required when url is a @handle',
    enum: SUPPORTED_SOCIAL_ICONS,
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_SOCIAL_ICONS)
  iconId?: SocialIconId;
}
