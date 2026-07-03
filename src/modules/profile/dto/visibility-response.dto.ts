import { ApiProperty } from '@nestjs/swagger';

export class VisibilityResponseDto {
  @ApiProperty({ example: false })
  isPublic: boolean;
}
