import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BioDto, LinksDto, ProjectsDto, CtaDto } from './profile-content.dto';

export class ProfileContentWriteDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BioDto)
  bio?: BioDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LinksDto)
  links?: LinksDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectsDto)
  projects?: ProjectsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CtaDto)
  cta?: CtaDto;

  @IsOptional()
  sectionOrder?: string[];
}
