import { Controller, Get, Req, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsDateRangeQueryDto } from './dto/analytics-range-query.dto';

interface AuthRequest extends Request {
  user: {
    id: string;
  };
}

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}
  @Get('profile-views')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get profile view analytics for the authenticated user',
  })
  async getProfileViews(
    @Req() req: AuthRequest,
    @Query() query: AnalyticsDateRangeQueryDto,
  ) {
    const userId = req.user.id;
    return this.analyticsService.getProfileViewStats(userId, query);
  }
  @Get('link-clicks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get link click-through analytics for the authenticated user',
  })
  async getLinkClicks(
    @Req() req: AuthRequest,
    @Query() query: AnalyticsDateRangeQueryDto,
  ) {
    return this.analyticsService.getLinkClickStats(req.user.id, query);
  }

  @Get('search-conversions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary:
      'Get search-to-profile conversion analytics for the authenticated user',
  })
  async getSearchConversions(
    @Req() req: AuthRequest,
    @Query() query: AnalyticsDateRangeQueryDto,
  ) {
    return this.analyticsService.getSearchConversionStats(req.user.id, query);
  }
}
