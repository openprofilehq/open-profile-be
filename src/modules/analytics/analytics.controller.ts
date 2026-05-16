import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import type { Request } from 'express';
import { CreateViewDto } from './dto/create-view.dto';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

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
}
