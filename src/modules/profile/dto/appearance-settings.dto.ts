import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class AppearanceSettingsDto {
  @ApiPropertyOptional({ enum: ['professional', 'creator', 'portfolio'] })
  @IsOptional()
  @IsString()
  @IsIn(['professional', 'creator', 'portfolio'], {
    message: 'Invalid template selection.',
  })
  template?: 'professional' | 'creator' | 'portfolio';

  @ApiPropertyOptional({ example: '#6366f1' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'Please provide a valid hex colour code.',
  })
  accentColour?: string;

  @ApiPropertyOptional({
    enum: ['inter', 'lato', 'poppins', 'playfair', 'roboto'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['inter', 'lato', 'poppins', 'playfair', 'roboto'], {
    message: 'Invalid font selection.',
  })
  font?: 'inter' | 'lato' | 'poppins' | 'playfair' | 'roboto';

  @ApiPropertyOptional({ enum: ['sharp', 'rounded', 'pill'] })
  @IsOptional()
  @IsString()
  @IsIn(['sharp', 'rounded', 'pill'], {
    message: 'Invalid corner style.',
  })
  cornerStyle?: 'sharp' | 'rounded' | 'pill';

  @ApiPropertyOptional({ minimum: 0, maximum: 40 })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Spacing must be between 0 and 40.' })
  @Max(40, { message: 'Spacing must be between 0 and 40.' })
  spacing?: number;

  @ApiPropertyOptional({ enum: ['light', 'dark'] })
  @IsOptional()
  @IsString()
  @IsIn(['light', 'dark'], {
    message: 'Invalid theme.',
  })
  theme?: 'light' | 'dark';
}
