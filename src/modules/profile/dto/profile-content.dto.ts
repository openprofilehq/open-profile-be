import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsBoolean,
  IsString,
  IsUrl,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SectionType {
  BIO = 'bio',
  LINKS = 'links',
  PROJECTS = 'projects',
  CTA = 'cta',
}

export class BioDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 'Software engineer...' })
  @IsString()
  content: string;
}

// Links
export class LinkItemDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'My GitHub' })
  @IsString()
  label: string;

  @ApiProperty({ example: 'https://github.com/username' })
  @IsString() // ← was @IsUrl(), removed
  url: string;

  @ApiProperty({ example: 'github', required: false })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;
}
export class LinksDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 'Links' })
  @IsString()
  sectionTitle: string;

  @ApiProperty({ type: [LinkItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkItemDto)
  items: LinkItemDto[];
}

export class ProjectItemDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'My Portfolio App' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'A full-stack project using NestJS' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'https://github.com/user/repo' })
  @IsUrl()
  repoUrl: string;

  @ApiProperty({ example: 'https://live-site.com', required: false })
  @IsOptional()
  @IsUrl()
  liveUrl?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;
}

export class ProjectsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 'Projects' })
  @IsString()
  sectionTitle: string;

  @ApiProperty({ type: [ProjectItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectItemDto)
  items: ProjectItemDto[];
}

export enum CtaType {
  LINK = 'link',
  EMAIL = 'email',
}

export class CtaDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;
  @ApiProperty({ enum: CtaType, example: CtaType.EMAIL })
  @IsEnum(CtaType)
  type: CtaType;

  @ApiProperty({ example: 'Contact Me' })
  @IsString()
  label: string;

  @ApiProperty({
    example: 'https://example.com or hello@example.com',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  value?: string | null;

  @ApiProperty({ example: "Let's build something", required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 'Open to new opportunities', required: false })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiProperty({ example: '1', required: false })
  @IsOptional()
  @IsString()
  layout?: string;

  @ApiProperty({ example: 'chat', required: false, nullable: true })
  @IsOptional()
  @IsString()
  iconId?: string | null;

  @ApiProperty({
    example: '/profilebuilder_home/icons/chat.svg',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  iconSrc?: string | null;

  @ApiProperty({ example: 'Chat', required: false, nullable: true })
  @IsOptional()
  @IsString()
  iconLabel?: string | null;
}

export class ProfileContentDto {
  @ApiProperty({
    example: ['bio', 'links', 'projects', 'cta'],
    enum: SectionType,
    isArray: true,
  })
  @IsArray()
  @IsEnum(SectionType, { each: true })
  sectionOrder: SectionType[];

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
