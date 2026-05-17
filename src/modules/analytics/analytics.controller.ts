import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { AnalyticsService } from './analytics.service';
import { AnalyticsStatsDto } from './dto/analytics-stats.dto';

// import your actual JWT guard
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get profile analytics stats',
    description:
      'Returns analytics statistics for the authenticated user profile.',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics retrieved successfully',
    type: AnalyticsStatsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Profile not found',
  })
  async getStats(@Req() req: Request) {
    const userId = (req as any).user.id;

    return this.analyticsService.getStats(userId);
  }
}