import { Controller, Get, Req, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';

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
    @Query() { range }: AnalyticsRangeQueryDto,
  ) {
    const userId = req.user.id;
    return this.analyticsService.getProfileViewStats(userId, range);
  }

  @Get('link-clicks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get link click-through analytics for the authenticated user',
  })
  async getLinkClicks(
    @Req() req: AuthRequest,
    @Query() { range }: AnalyticsRangeQueryDto,
  ) {
    const userId = req.user.id;
    return this.analyticsService.getLinkClickStats(userId, range);
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
    @Query() { range }: AnalyticsRangeQueryDto,
  ) {
    const userId = req.user.id;
    return this.analyticsService.getSearchConversionStats(userId, range);
  }
}
