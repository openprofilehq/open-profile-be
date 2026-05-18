import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum InsightsPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class InsightsQueryDto {
  @ApiPropertyOptional({ enum: InsightsPeriod, default: InsightsPeriod.DAY })
  @IsOptional()
  @IsEnum(InsightsPeriod)
  period?: InsightsPeriod = InsightsPeriod.DAY;
}
