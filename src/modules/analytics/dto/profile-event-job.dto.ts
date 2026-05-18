import { IsEnum, IsString, IsOptional, IsDateString, IsUUID } from 'class-validator';
import { EventType } from '../../../common/types/analytics.types';

export const ANALYTICS_QUEUE = 'analytics';

export class ProfileEventJobPayload {
    @IsUUID()
    eventId: string;

    @IsUUID()
    profileId: string;

    @IsEnum(EventType)
    eventType: EventType;

    @IsString()
    visitorFp: string;

    @IsOptional()
    @IsUUID()
    viewerId: string | null;

    @IsOptional()
    @IsString()
    userAgent: string | null;

    @IsOptional()
    @IsString()
    referrer: string | null;

    @IsDateString()
    occurredAt: string;
}