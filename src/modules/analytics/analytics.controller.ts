import {
  Controller,
  Post,
  Get,
  Body,
  Req,
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
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { CreateViewDto } from './dto/create-view.dto';
import { AnalyticsStatsDto } from './dto/analytics-stats.dto';
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

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Record a profile view' })
  @ApiResponse({ status: 201, description: 'View recorded successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid profile ID or request body',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (30 req/min)' })
  @Post('view')
  @HttpCode(HttpStatus.CREATED)
  async recordView(@Body() dto: CreateViewDto, @Req() req: Request) {
    await this.analyticsService.recordView(dto.profileId, req);
    return { message: 'View recorded' };
  }

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
  async getStats(@Req() req: AuthRequest) {
    const userId = req.user.id;
    return this.analyticsService.getStats(userId);
  }
}
