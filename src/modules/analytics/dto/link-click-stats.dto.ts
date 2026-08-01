import { ApiProperty } from '@nestjs/swagger';

class LinkClickBreakdownDto {
  @ApiProperty({ example: 'https://github.com/calvin' })
  linkUrl: string;

  @ApiProperty({ example: 23 })
  clicks: number;
}

export class LinkClickStatsDto {
  @ApiProperty({
    example: 47,
    description: 'Total clicks across all links in the requested range',
  })
  range_total: number;

  @ApiProperty({ type: [LinkClickBreakdownDto] })
  links: LinkClickBreakdownDto[];
}
