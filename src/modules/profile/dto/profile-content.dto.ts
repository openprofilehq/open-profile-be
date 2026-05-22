import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsString,
  IsUrl,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  layout?: string;

  @IsOptional()
  @IsString()
  iconId?: string | null;

  @IsOptional()
  @IsString()
  iconSrc?: string | null;

  @IsOptional()
  @IsString()
  iconLabel?: string | null;
}

export class ProfileContentDto {
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
