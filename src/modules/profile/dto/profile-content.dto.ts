import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class BioDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 'Software engineer...' })
  @IsString()
  content: string;
}

class LinksDto {
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

class ProjectsDto {
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

class CtaDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 'Contact Me' })
  @IsString()
  label: string;

  @ApiProperty({ example: 'https://example.com' })
  @IsUrl()
  url: string;
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
