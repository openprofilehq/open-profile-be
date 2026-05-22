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

  @ApiProperty({ example: '/profilebuilder_home/icons/chat.svg', required: false, nullable: true })
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
