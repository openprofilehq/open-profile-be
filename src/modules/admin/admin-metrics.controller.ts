import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  QUEUE_JOB_NAMES,
  QUEUE_NAMES,
} from '../queue/config/queue-names.constant';
import { QueueService } from '../queue/queue.service';
import { UserRole } from '../users/entities/user.entity';
import {
  MetricsBackfillResponseDto,
  MetricsHealthResponseDto,
} from './dto/admin-metrics-response.dto';
import { MetricsRollupService } from './services/metrics-rollup.service';

@ApiTags('admin/metrics')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/metrics', version: '1' })
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
export class AdminMetricsController {
  constructor(
    private readonly rollupService: MetricsRollupService,
    private readonly queueService: QueueService,
  ) {}

  @Get('health')
  @ApiOperation({
    summary: 'Metrics rollup health',
    description:
      'Returns the daily rollup watermark and its lag in milliseconds. ' +
      'The lag is null until the first rollup has run; a large lag typically ' +
      'means a catch-up backfill is pending or in flight.',
  })
  @ApiResponse({
    status: 200,
    type: MetricsHealthResponseDto,
    description: 'Rollup watermark and lag returned',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getHealth() {
    return {
      success: true,
      data: await this.rollupService.getWatermarkStatus(),
    };
  }

  @Post('backfill')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Enqueue a metrics catch-up backfill',
    description:
      'Enqueues a one-off daily-metrics backfill job that drains the ' +
      'rollup backlog in continuous 1-day chunks until the watermark ' +
      'catches up. Runs under the same concurrency lock as the scheduled ' +
      'rollup, so it is a no-op if a rollup is already in flight. Use after ' +
      'outages, schema changes, or data restoration.',
  })
  @ApiResponse({
    status: 202,
    type: MetricsBackfillResponseDto,
    description: 'Backfill job enqueued',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async triggerBackfill() {
    const job = await this.queueService.addJob(
      QUEUE_NAMES.METRICS,
      QUEUE_JOB_NAMES.METRICS.BACKFILL,
      {},
    );

    return {
      success: true,
      message: 'Metrics backfill enqueued',
      data: { jobId: job.id },
    };
  }
}
