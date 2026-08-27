import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MetricsHealthDto {
  @ApiProperty({
    example: '2026-08-12T01:00:00.000Z',
    nullable: true,
    description:
      'Timestamp of the last successful daily rollup; null when no rollup has completed yet',
  })
  lastDailyRollupAt: Date | null;

  @ApiProperty({
    example: 7200000,
    nullable: true,
    description:
      'Milliseconds since the last successful daily rollup; null when no rollup has completed yet',
  })
  lagMs: number | null;
}

export class MetricsHealthResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: MetricsHealthDto })
  data: MetricsHealthDto;
}

export class MetricsBackfillDto {
  @ApiProperty({ example: 'backfill-abc123', description: 'BullMQ job id' })
  jobId: string;
}

export class MetricsBackfillResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Metrics backfill enqueued' })
  message: string;

  @ApiPropertyOptional({ type: MetricsBackfillDto })
  data: MetricsBackfillDto;
}
