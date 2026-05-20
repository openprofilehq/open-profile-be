import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ProfileContentWriteDto {
  // mirror fields from ProfileContentDto EXCEPT "source"

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  bio?: any;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  links?: any;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  projects?: any;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  cta?: any;

  @IsOptional()
  sectionOrder?: string[];
}
