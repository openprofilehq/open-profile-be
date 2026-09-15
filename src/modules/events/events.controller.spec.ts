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
const USERNAME = 'adalovelace';
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
      validateProfileLink: jest.fn(),
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

  it('responds with 200 OK for link-click tracking requests', () => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, controller.recordLinkClick),
    ).toBe(200);
  });

  it('records a link-click event when the link belongs to the profile', async () => {
    eventsService.validateProfileLink.mockResolvedValue({
      valid: true,
      profileId: PROFILE_ID,
    });
    eventsService.recordEvent.mockResolvedValue(undefined);

    await expect(
      controller.recordLinkClick(
        { username: USERNAME, linkUrl: LINK_URL },
        mockRequest({ sub: ACTOR_ID }),
        mockResponse(),
      ),
    ).resolves.toEqual({ recorded: true });

    expect(eventsService.validateProfileLink).toHaveBeenCalledWith(
      USERNAME,
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
    eventsService.validateProfileLink.mockResolvedValue({
      valid: false,
      profileId: PROFILE_ID,
    });

    await expect(
      controller.recordLinkClick(
        { username: USERNAME, linkUrl: LINK_URL },
        mockRequest({ sub: ACTOR_ID }),
        mockResponse(),
      ),
    ).resolves.toEqual({ recorded: false });

    expect(eventsService.recordEvent).not.toHaveBeenCalled();
  });

  it('records anonymous link clicks using the anonymousId cookie', async () => {
    const ANONYMOUS_ID = 'anon-uuid-123';
    (getOrSetAnonymousId as jest.Mock).mockReturnValue(ANONYMOUS_ID);
    eventsService.validateProfileLink.mockResolvedValue({
      valid: true,
      profileId: PROFILE_ID,
    });

    await expect(
      controller.recordLinkClick(
        { username: USERNAME, linkUrl: LINK_URL },
        mockRequest(),
        mockResponse(),
      ),
    ).resolves.toEqual({ recorded: true });

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
