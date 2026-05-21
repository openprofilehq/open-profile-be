import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProfileContentDto } from './profile-content.dto';

export class UpsertDraftDto {
  @ApiPropertyOptional({
    description: 'Short biography for the profile. Send null to clear.',
    example: 'Backend engineer building OpenProfile',
    maxLength: 300,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string | null;

  @ApiPropertyOptional({
    description: 'Profile photo URL (from POST /uploads/profiles/image-url).',
    example: 'https://cdn.example.com/avatar.jpg',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o: { photoUrl: unknown }) => o.photoUrl !== null)
  @IsUrl()
  photoUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'Full canvas content document. All fields are optional — only send sections you are updating.',
    type: () => ProfileContentDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileContentDto)
  content?: ProfileContentDto;
}
