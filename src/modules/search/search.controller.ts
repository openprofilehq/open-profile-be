import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';
import type { Request, Response } from 'express';

@ApiTags('search')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Search published profiles' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search term, minimum 3 characters',
    example: 'ade',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1).',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Results per page (default: 5, max: 20).',
    example: 5,
  })
  search(
    @Query() dto: SearchQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actorId = (req as Request & { user?: { sub: string } }).user?.sub;
    return this.searchService.searchProfiles(dto, actorId, req, res);
  }
}
