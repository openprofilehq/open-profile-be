import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { MetricsRange } from '../../../common/utils/metrics-range.util';

export class MetricsRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Metrics range window',
    enum: MetricsRange,
    default: MetricsRange.THIS_WEEK,
  })
  @IsOptional()
  @IsEnum(MetricsRange)
  range?: MetricsRange = MetricsRange.THIS_WEEK;
}
