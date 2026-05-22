import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class ThemeSettings {
  @ApiPropertyOptional({
    description: 'Theme template variant',
    example: 'default',
  })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional({
    description: 'Accent colour (hex)',
    example: '#6366f1',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'accentColour must be a valid hex colour (e.g. #6366f1)',
  })
  accentColour?: string;

  @ApiPropertyOptional({ description: 'Font family', example: 'Inter' })
  @IsOptional()
  @IsString()
  font?: string;

  @ApiPropertyOptional({
    description: 'Border radius in pixels',
    example: 8,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  borderRadius?: number;
}
