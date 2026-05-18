export const ANALYTICS_QUEUE = 'analytics';

export enum EventType {
    PROFILE_VIEW = 'profile_view',
    LINK_CLICK = 'link_click',
    SEARCH_IMPRESSION = 'search_impression',
}

export enum LinkType { SOCIAL = 'social', WEBSITE = 'website', CUSTOM = 'custom' }
export enum SnapshotBucket {
    HOUR = 'hour',
    DAY = 'day',
    WEEK = 'week',
    MONTH = 'month'
}

export interface ProfileEventJobPayload {
    eventId: string;
    profileId: string;
    eventType: EventType;
    visitorFp: string;
    viewerId: string | null;
    userAgent: string | null;
    referrer: string | null;
    occurredAt: string;
}