import { Test, TestingModule } from '@nestjs/testing';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventType } from './entities/event.entity';
import type { Request } from 'express';
import { getOrSetAnonymousId } from '../../common/cookies/anonymous-id.util';
import { ThrottlerGuard } from '@nestjs/throttler';

jest.mock('../../common/redis/redis.service', () => ({
  RedisService: class RedisService {},
}));

jest.mock('../../common/cookies/anonymous-id.util', () => ({
  getOrSetAnonymousId: jest.fn(),
}));

const PROFILE_ID = '660e8400-e29b-41d4-a716-446655440001';
const ACTOR_ID = '770e8400-e29b-41d4-a716-446655440002';
const LINK_URL = 'https://example.com/link';

const mockRequest = (user?: {
  sub: string;
}): Request & { user?: { sub: string } } =>
  ({ user }) as Request & { user?: { sub: string } };

const mockResponse = () => ({}) as any;

describe('EventsController', () => {
  let controller: EventsController;
  let eventsService: Record<string, jest.Mock>;

  beforeEach(async () => {
    eventsService = {
      isValidProfileLink: jest.fn(),
      recordEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: eventsService,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<EventsController>(EventsController);
  });

  it('responds with 204 No Content for link-click tracking requests', () => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, controller.recordLinkClick),
    ).toBe(204);
  });

  it('records a link-click event when the link belongs to the profile', async () => {
    eventsService.isValidProfileLink.mockResolvedValue(true);
    eventsService.recordEvent.mockResolvedValue(undefined);

    await controller.recordLinkClick(
      { profileId: PROFILE_ID, linkUrl: LINK_URL },
      mockRequest({ sub: ACTOR_ID }),
      mockResponse(),
    );

    expect(eventsService.isValidProfileLink).toHaveBeenCalledWith(
      PROFILE_ID,
      LINK_URL,
    );
    expect(eventsService.recordEvent).toHaveBeenCalledWith({
      eventType: EventType.LINK_CLICKED,
      profileId: PROFILE_ID,
      actorId: ACTOR_ID,
      metadata: { linkUrl: LINK_URL },
      dedupKey: `link-click:${PROFILE_ID}:${LINK_URL}:${ACTOR_ID}`,
    });
  });

  it('does not record an event when the link is not valid for the profile', async () => {
    eventsService.isValidProfileLink.mockResolvedValue(false);

    await controller.recordLinkClick(
      { profileId: PROFILE_ID, linkUrl: LINK_URL },
      mockRequest({ sub: ACTOR_ID }),
      mockResponse(),
    );

    expect(eventsService.recordEvent).not.toHaveBeenCalled();
  });

  it('records anonymous link clicks using the anonymousId cookie', async () => {
    const ANONYMOUS_ID = 'anon-uuid-123';
    (getOrSetAnonymousId as jest.Mock).mockReturnValue(ANONYMOUS_ID);
    eventsService.isValidProfileLink.mockResolvedValue(true);

    await controller.recordLinkClick(
      { profileId: PROFILE_ID, linkUrl: LINK_URL },
      mockRequest(),
      mockResponse(),
    );

    expect(eventsService.recordEvent).toHaveBeenCalledWith({
      eventType: EventType.LINK_CLICKED,
      profileId: PROFILE_ID,
      actorId: undefined,
      anonymousId: ANONYMOUS_ID,
      metadata: { linkUrl: LINK_URL },
      dedupKey: `link-click:${PROFILE_ID}:${LINK_URL}:${ANONYMOUS_ID}`,
    });
  });
});
