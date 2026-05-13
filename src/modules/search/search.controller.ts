import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
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
    description: 'Search term, minimum 2 characters',
    example: 'ade',
  })
  search(@Query() dto: SearchQueryDto) {
    return this.searchService.searchProfiles(dto.q);
  }
}
