import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
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
const MAX_YEAR = new Date().getFullYear() + 10; // allows near-future planned graduation

@ValidatorConstraint({ name: 'EndYearAfterStartYear', async: false })
class EndYearAfterStartYearConstraint implements ValidatorConstraintInterface {
  validate(endYear: number, args: ValidationArguments) {
    const obj = args.object as { startYear?: number };
    if (obj.startYear === undefined || endYear === undefined) return true;
    return endYear >= obj.startYear;
  }
  defaultMessage() {
    return 'endYear must be greater than or equal to startYear';
  }
}

export class CreateEducationDto {
  @ApiProperty({ example: 'University of Lagos' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  school: string;

  @ApiProperty({ example: 'B.Sc.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  degree: string;

  @ApiProperty({ example: 'Microbiology' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fieldOfStudy: string;

  @ApiProperty({ example: 'Lagos, Nigeria', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @ApiProperty({ example: "Dean's List, Robotics Club", required: false })
  @IsOptional()
  @IsString()
  activitiesHonors?: string;

  @ApiProperty({ example: 2016 })
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  startYear: number;

  @ApiProperty({ example: 2020 })
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  @Validate(EndYearAfterStartYearConstraint)
  endYear: number;
}

export class UpdateEducationDto {
  @ApiProperty({ example: 'University of Lagos', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  school?: string;

  @ApiProperty({ example: 'B.Sc.', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  degree?: string;

  @ApiProperty({ example: 'Microbiology', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fieldOfStudy?: string;

  @ApiProperty({ example: 'Lagos, Nigeria', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  activitiesHonors?: string;

  @ApiProperty({ example: 2016, required: false })
  @IsOptional()
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  startYear?: number;

  @ApiProperty({ example: 2020, required: false })
  @IsOptional()
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  @Validate(EndYearAfterStartYearConstraint)
  endYear?: number;
}

export class ReorderEducationDto {
  @ApiProperty({ type: [String], example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsUUID('4', { each: true })
  educationIds: string[];
}
