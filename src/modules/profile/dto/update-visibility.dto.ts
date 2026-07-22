import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateVisibilityDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isPublic: boolean;
}
