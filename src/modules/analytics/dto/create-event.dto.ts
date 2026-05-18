import { IsUUID, IsEnum, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventType } from '../../../common/types/analytics.types';

export class CreateEventDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  profileId: string;

  @ApiProperty({ enum: EventType, example: EventType.PROFILE_VIEW })
  @IsEnum(EventType)
  eventType: EventType;

  @ApiPropertyOptional({ example: { linkId: 'abc123', linkType: 'social' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
