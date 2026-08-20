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

// ── Dashboard read DTOs ──────────────────────────────────────────────

export class MetricComparisonDto {
  @ApiProperty({ example: 142 })
  current: number;

  @ApiProperty({ example: 128 })
  previous: number;

  @ApiProperty({
    example: 10.9,
    nullable: true,
    description:
      'Relative % for raw counts ((current-previous)/previous*100); points diff for bounded rates; null when previous is 0',
  })
  change: number | null;
}

export class MetricTimeseriesPointDto {
  @ApiProperty({ example: '2026-08-17' })
  date: string;

  @ApiProperty({ example: 24 })
  value: number;
}

export class AdminMetricsSummaryDto {
  @ApiProperty({ type: MetricComparisonDto })
  totalUsers: MetricComparisonDto;

  @ApiProperty({ type: MetricComparisonDto })
  publishedProfiles: MetricComparisonDto;

  @ApiProperty({ type: MetricComparisonDto })
  profileCompletionRate: MetricComparisonDto;

  @ApiProperty({ type: MetricComparisonDto })
  weeklyActiveProfiles: MetricComparisonDto;

  @ApiProperty({ type: MetricComparisonDto })
  invitesSent: MetricComparisonDto;

  @ApiProperty({ type: MetricComparisonDto })
  invitesClaimed: MetricComparisonDto;
}

export class AdminMetricsSummaryResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: AdminMetricsSummaryDto })
  data: AdminMetricsSummaryDto;
}

export class AdminMetricsSearchActivityDto {
  @ApiProperty({ type: MetricComparisonDto })
  totalSearches: MetricComparisonDto;

  @ApiProperty({ type: MetricTimeseriesPointDto, isArray: true })
  timeseries: MetricTimeseriesPointDto[];
}

export class AdminMetricsSearchActivityResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: AdminMetricsSearchActivityDto })
  data: AdminMetricsSearchActivityDto;
}

export class AdminMetricsRecentActivityDto {
  @ApiProperty({ example: 5 })
  newUsersToday: number;

  @ApiProperty({ example: 2 })
  profilesPublishedToday: number;

  @ApiProperty({ example: 8 })
  invitesSentToday: number;

  @ApiProperty({ example: 3 })
  invitesClaimedToday: number;
}

export class AdminMetricsRecentActivityResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: AdminMetricsRecentActivityDto })
  data: AdminMetricsRecentActivityDto;
}

export class AdminMetricsPlatformHealthDto {
  @ApiProperty({ type: MetricComparisonDto })
  profileCompletionRate: MetricComparisonDto;

  @ApiProperty({ type: MetricTimeseriesPointDto, isArray: true })
  publishingActivity: MetricTimeseriesPointDto[];
}

export class AdminMetricsPlatformHealthResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: AdminMetricsPlatformHealthDto })
  data: AdminMetricsPlatformHealthDto;
}
