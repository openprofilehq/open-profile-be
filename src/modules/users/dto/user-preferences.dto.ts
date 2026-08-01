import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PRESET_THEMES } from '../constants/preset-themes';

export class UserPreferencesDto {
  @ApiPropertyOptional({ enum: ['light', 'dark', 'system'] })
  @IsOptional()
  @IsString()
  @IsIn(['light', 'dark', 'system'], { message: 'Invalid mode.' })
  mode?: 'light' | 'dark' | 'system';

  @ApiPropertyOptional({ enum: PRESET_THEMES })
  @IsOptional()
  @IsString()
  @IsIn(PRESET_THEMES, { message: 'Invalid colour theme.' })
  colorTheme?: string;
}

export class UserPreferencesResponseDto {
  @ApiProperty({ enum: ['light', 'dark', 'system'], example: 'system' })
  mode: 'light' | 'dark' | 'system';

  @ApiProperty({ example: 'default' })
  colorTheme: string;
}
