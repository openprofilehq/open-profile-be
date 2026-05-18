import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SectionType {
  BIO = 'bio',
  LINKS = 'links',
  PROJECTS = 'projects',
  CTA = 'cta',
}

export class BioContentDto {
  @IsBoolean()
  visible: boolean;

  @IsString()
  @MaxLength(200, { message: 'Bio cannot exceed 200 characters.' })
  content: string;
}

export class LinkItemDto {
  @IsString()
  @MaxLength(100)
  label: string;

  @IsString()
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    {
      message: (args) =>
        `Link URL must start with http:// or https:// (item: ${args.object['label'] ?? 'unknown'})`,
    },
  )
  url: string;
}

export class LinksContentDto {
  @IsBoolean()
  visible: boolean;

  @IsString()
  @MaxLength(80)
  sectionTitle: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LinkItemDto)
  items: LinkItemDto[];
}

export class ProjectItemDto {
  @IsUUID()
  id: string;

  @IsString()
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    {
      message: 'imageUrl must be a valid Cloudinary URL.',
    },
  )
  imageUrl?: string;

  @IsOptional()
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    {
      message: 'projectUrl must be a valid URL.',
    },
  )
  projectUrl?: string;
}

export class ProjectsContentDto {
  @IsBoolean()
  visible: boolean;

  @IsString()
  @MaxLength(80)
  sectionTitle: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProjectItemDto)
  items: ProjectItemDto[];
}

export class CtaContentDto {
  @IsBoolean()
  visible: boolean;

  @ValidateIf((o: CtaContentDto) => o.visible === true)
  @IsString()
  @MaxLength(80)
  label?: string;

  @ValidateIf((o: CtaContentDto) => o.visible === true)
  @IsString()
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    {
      message: 'CTA requires both a label and a URL when visible.',
    },
  )
  url?: string;
}

export class SaveProfileContentDto {
  @ApiProperty({
    enum: SectionType,
    isArray: true,
    example: ['bio', 'links', 'projects', 'cta'],
  })
  @IsArray()
  @IsEnum(SectionType, {
    each: true,
    message: 'sectionOrder contains an unrecognised section type.',
  })
  sectionOrder: SectionType[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => BioContentDto)
  bio?: BioContentDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => LinksContentDto)
  links?: LinksContentDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectsContentDto)
  projects?: ProjectsContentDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => CtaContentDto)
  cta?: CtaContentDto;
}
