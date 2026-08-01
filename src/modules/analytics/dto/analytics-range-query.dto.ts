import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Validate } from 'class-validator';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

const DEFAULT_RANGE_DAYS = 30;

@ValidatorConstraint({ name: 'endDateAfterStartDate', async: false })
export class EndDateAfterStartDateConstraint implements ValidatorConstraintInterface {
  validate(endDate: string, args: ValidationArguments) {
    const obj = args.object as AnalyticsDateRangeQueryDto;
    if (!obj.startDate || !endDate) return true; // let @IsDateString handle format errors
    return new Date(endDate) >= new Date(obj.startDate);
  }
  defaultMessage() {
    return 'endDate must be on or after startDate';
  }
}

export class AnalyticsDateRangeQueryDto {
  @ApiPropertyOptional({
    description:
      'Start of the date range (ISO 8601, e.g. 2026-06-23). Defaults to 30 days before endDate.',
    example: '2026-06-23',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'End of the date range (ISO 8601, e.g. 2026-07-23). Defaults to today.',
    example: '2026-07-23',
  })
  @IsOptional()
  @IsDateString()
  @Validate(EndDateAfterStartDateConstraint)
  endDate?: string;
}

export function resolveDateRange(dto: AnalyticsDateRangeQueryDto): {
  start: Date;
  end: Date;
} {
  const end = dto.endDate ? new Date(dto.endDate) : new Date();
  end.setUTCHours(23, 59, 59, 999);

  const start = dto.startDate
    ? new Date(dto.startDate)
    : new Date(end.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  start.setUTCHours(0, 0, 0, 0);

  return { start, end };
}
