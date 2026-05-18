import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { CreateViewDto } from './dto/create-view.dto';
import { AnalyticsStatsDto } from './dto/analytics-stats.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { InsightsQueryDto } from './dto/insights-query.dto';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ── NEW ENDPOINTS ────────────────────────────────────────────────────

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Record an analytics event (fire-and-forget)' })
  @ApiResponse({ status: 202, description: 'Event accepted for processing' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (30 req/min)' })
  async recordEvent(@Body() dto: CreateEventDto, @Req() req: AuthRequest) {
    await this.analyticsService.enqueueEvent(dto, req);
    return { accepted: true };
  }

  @Public()
  @Get('r/:linkId')
  @ApiOperation({ summary: 'Redirect proxy — logs link click then redirects' })
  @ApiResponse({ status: 302, description: 'Redirecting to target URL' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  async redirectLink(
    @Param('linkId') linkId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const target = await this.analyticsService.resolveAndLogLinkClick(
      linkId,
      req,
    );
    res.redirect(302, target.url);
  }

  @Get('insights')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get pre-rolled metric snapshots for authenticated user',
  })
  @ApiResponse({ status: 200, description: 'Insights retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getInsights(
    @Req() req: AuthRequest,
    @Query() query: InsightsQueryDto,
  ): Promise<{ period: string; profileId: string; snapshots: unknown[] }> {
    return this.analyticsService.getInsights(req.user.id, query.period);
  }

  // ── DEPRECATED ───────────────────────────────────────────────────────

  /** @deprecated Use POST /analytics/events instead */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: '[Deprecated] Record a profile view',
    deprecated: true,
  })
  @ApiResponse({ status: 201, description: 'View recorded successfully' })
  @ApiResponse({
    status: 422,
    description: 'Invalid profile ID or request body',
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (30 req/min)' })
  @Post('view')
  @HttpCode(HttpStatus.CREATED)
  async recordView(@Body() dto: CreateViewDto, @Req() req: Request) {
    await this.analyticsService.recordView(dto.profileId, req);
    return { message: 'View recorded' };
  }

  /** @deprecated Use GET /analytics/insights instead */
  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: '[Deprecated] Get profile analytics stats',
    deprecated: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics retrieved successfully',
    type: AnalyticsStatsDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Profile not found' })
  async getStats(@Req() req: AuthRequest) {
    return this.analyticsService.getStats(req.user.id);
  }
}
