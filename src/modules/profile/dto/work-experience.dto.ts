import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

const MIN_YEAR = 1950;
const MAX_YEAR = new Date().getFullYear() + 1;

interface DateShape {
  isCurrent?: boolean;
  startMonth?: number;
  startYear?: number;
  endMonth?: number | null;
  endYear?: number | null;
}

@ValidatorConstraint({ name: 'WorkExperienceDateConsistency', async: false })
class WorkExperienceDateConsistencyConstraint implements ValidatorConstraintInterface {
  private lastError = '';

  validate(_: unknown, args: ValidationArguments) {
    const obj = args.object as DateShape;

    if (obj.isCurrent) {
      if (obj.endMonth != null || obj.endYear != null) {
        this.lastError =
          'endMonth/endYear must be omitted when isCurrent is true.';
        return false;
      }
      return true;
    }

    // Not current: both endMonth and endYear are required
    if (obj.endMonth == null || obj.endYear == null) {
      this.lastError =
        'endMonth and endYear are required when isCurrent is false.';
      return false;
    }

    if (
      obj.startYear != null &&
      obj.startMonth != null &&
      (obj.endYear < obj.startYear ||
        (obj.endYear === obj.startYear && obj.endMonth < obj.startMonth))
    ) {
      this.lastError = 'End date must be on or after start date.';
      return false;
    }

    return true;
  }

  defaultMessage() {
    return this.lastError || 'Invalid date range.';
  }
}

export class CreateWorkExperienceDto {
  @ApiProperty({ example: 'Anthropic' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  companyName: string;

  @ApiProperty({ example: 'Backend Engineer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  jobTitle: string;

  @ApiProperty({ example: 'Abuja, Nigeria', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  startMonth: number;

  @ApiProperty({ example: 2023 })
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  startYear: number;

  @ApiProperty({
    example: 8,
    minimum: 1,
    maximum: 12,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  endMonth?: number | null;

  @ApiProperty({ example: 2024, required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  endYear?: number | null;

  @ApiProperty({ example: false })
  @IsBoolean()
  @Validate(WorkExperienceDateConsistencyConstraint)
  isCurrent: boolean;
}

export class UpdateWorkExperienceDto {
  @ApiProperty({ example: 'Anthropic', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  companyName?: string;

  @ApiProperty({ example: 'Backend Engineer', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  jobTitle?: string;

  @ApiProperty({ example: 'Abuja, Nigeria', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 12, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  startMonth?: number;

  @ApiProperty({ example: 2023, required: false })
  @IsOptional()
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  startYear?: number;

  @ApiProperty({
    example: 8,
    minimum: 1,
    maximum: 12,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  endMonth?: number | null;

  @ApiProperty({ example: 2024, required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  endYear?: number | null;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class ReorderWorkExperienceDto {
  @ApiProperty({ type: [String], example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsUUID('4', { each: true })
  workExperienceIds: string[];
}
