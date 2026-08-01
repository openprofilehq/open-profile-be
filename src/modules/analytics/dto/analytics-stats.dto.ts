import { ApiProperty } from '@nestjs/swagger';

class DailyBreakdownDto {
  @ApiProperty({
    example: '2026-05-17',
  })
  date: string;

  @ApiProperty({
    example: 42,
  })
  views: number;
}

export class AnalyticsStatsDto {
  @ApiProperty({
    example: 1420,
  })
  total: number;

  @ApiProperty({
    example: 214,
    description: 'Views within the requested range',
  })
  range_total: number;

  @ApiProperty({
    example: 890,
  })
  unique_viewers: number;

  @ApiProperty({
    type: [DailyBreakdownDto],
  })
  daily_breakdown: DailyBreakdownDto[];
}
