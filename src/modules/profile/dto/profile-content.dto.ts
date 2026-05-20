import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  IsUrl,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WithSource } from '../../../common/types';

export class BioDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 'Software engineer...' })
  @IsString()
  content: string;
}

export class LinksDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 'Links' })
  @IsString()
  sectionTitle: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  items: Record<string, unknown>[];
}

export class ProjectsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 'Projects' })
  @IsString()
  sectionTitle: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  items: Record<string, unknown>[];
}

export class CtaDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 'Contact Me' })
  @IsString()
  label: string;

  @ApiProperty({ example: 'https://example.com' })
  @IsOptional()
  @IsUrl()
  url: string | null;
}

export type ProfileContentResponse = WithSource<
  ProfileContentDto,
  'draft' | 'published'
>;

export class ProfileContentDto {
  @ApiProperty({ enum: ['draft', 'published'] })
  @IsIn(['draft', 'published'])
  source: 'draft' | 'published';

  @ApiProperty({
    example: ['bio', 'links', 'projects', 'cta'],
  })
  @IsArray()
  sectionOrder: string[];

  @ApiProperty()
  @ValidateNested()
  @Type(() => BioDto)
  bio: BioDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => LinksDto)
  links: LinksDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => ProjectsDto)
  projects: ProjectsDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => CtaDto)
  cta: CtaDto;
}
