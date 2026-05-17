import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsString } from 'class-validator';

export class CreateViewDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The profile ID being viewed',
  })
  @IsUUID()
  profileId: string;

  @ApiPropertyOptional({
    example: 'Mozilla/5.0',
    description: 'Optional user agent string',
  })
  @IsOptional()
  @IsString()
  userAgent?: string;
}
