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

  @ApiProperty({ example: 'success', enum: ['success', 'error', null] })
  rollupLastRunStatus: string | null;

  @ApiProperty({ example: false })
  backfillInProgress: boolean;

  @ApiProperty({ example: '2026-08-12T01:05:00.000Z', nullable: true })
  backfillStartedAt: string | null;

  @ApiProperty({ example: '2026-08-12T01:15:00.000Z', nullable: true })
  backfillLastCappedAt: string | null;

  @ApiProperty({ example: '2026-08-12T02:00:00.000Z', nullable: true })
  snapshotLastRunAt: Date | null;

  @ApiProperty({ example: 'success', enum: ['success', 'error', null] })
  snapshotLastRunStatus: string | null;

  @ApiProperty({ example: '2026-08-12', nullable: true })
  snapshotLatestPeriodDate: string | null;

  @ApiProperty({ example: true })
  cacheReachable: boolean;

  @ApiProperty({
    example: 'healthy',
    enum: ['healthy', 'degraded', 'unhealthy'],
    description:
      'Derived status: healthy when lag is within threshold and last runs succeeded; degraded when lag is elevated but backfill is in progress or cache is down; unhealthy when last run failed or lag is large with no backfill running',
  })
  status: 'healthy' | 'degraded' | 'unhealthy';
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
