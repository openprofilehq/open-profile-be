import { ApiProperty } from '@nestjs/swagger';

export class SearchConversionStatsDto {
  @ApiProperty({
    example: 12,
    description: 'Searches in range that surfaced this profile',
  })
  searches_surfaced: number;

  @ApiProperty({
    example: 5,
    description: 'Profile views that originated from a search click-through',
  })
  search_driven_views: number;

  @ApiProperty({
    example: 0.42,
    description:
      'search_driven_views / searches_surfaced, 0 when searches_surfaced is 0',
  })
  conversion_rate: number;
}
