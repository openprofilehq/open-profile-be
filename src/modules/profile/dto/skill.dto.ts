import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  EXPERT = 'expert',
}

export class CreateSkillDto {
  @ApiProperty({ example: 'TypeScript' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    enum: SkillLevel,
    required: false,
    example: SkillLevel.INTERMEDIATE,
  })
  @IsOptional()
  @IsEnum(SkillLevel)
  level?: SkillLevel;
}

export class UpdateSkillDto {
  @ApiProperty({ example: 'TypeScript', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ enum: SkillLevel, required: false })
  @IsOptional()
  @IsEnum(SkillLevel)
  level?: SkillLevel;
}

export class ReorderSkillsDto {
  @ApiProperty({ type: [String], example: ['uuid-1', 'uuid-2', 'uuid-3'] })
  @IsArray()
  @IsUUID('4', { each: true })
  skillIds: string[];
}
