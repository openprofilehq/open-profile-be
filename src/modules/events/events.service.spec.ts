import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { EventsService } from './events.service';
import { Event, EventType } from './entities/event.entity';
import { FailedEvent } from './entities/failed-event.entity';
import { Profile } from '../profile/entities/profile.entity';
import { RedisService } from '../../common/redis/redis.service';
import { DEFAULT_RETRY_CONFIG } from './utils/event-retry.util';

jest.mock('../../common/redis/redis.service', () => ({
  RedisService: class RedisService {},
}));

const PROFILE_ID = '660e8400-e29b-41d4-a716-446655440001';
const ACTOR_ID = '770e8400-e29b-41d4-a716-446655440002';

describe('EventsService', () => {
  let service: EventsService;
  let eventRepository: Record<string, jest.Mock>;
  let failedEventRepository: Record<string, jest.Mock>;
  let profileRepository: Record<string, jest.Mock>;
  let redisService: Record<string, jest.Mock>;

  beforeEach(async () => {
    eventRepository = {
      create: jest.fn((event) => event),
      save: jest.fn(),
    };

    failedEventRepository = {
      create: jest.fn((event) => event),
      save: jest.fn(),
    };

    profileRepository = {
      findOne: jest.fn(),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(Event),
          useValue: eventRepository,
        },
        {
          provide: getRepositoryToken(FailedEvent),
          useValue: failedEventRepository,
        },
        {
          provide: getRepositoryToken(Profile),
          useValue: profileRepository,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('recordEvent', () => {
    it('creates and saves an event with the provided values', async () => {
      const metadata = { query: 'designer' };
      eventRepository.save.mockResolvedValue({ id: 'event-id' });

      await service.recordEvent({
        eventType: EventType.SEARCH_PERFORMED,
        profileId: PROFILE_ID,
        actorId: ACTOR_ID,
        metadata,
      });

      expect(eventRepository.create).toHaveBeenCalledWith({
        eventType: EventType.SEARCH_PERFORMED,
        profileId: PROFILE_ID,
        actorId: ACTOR_ID,
        anonymousId: null,
        metadata,
      });
      expect(eventRepository.save).toHaveBeenCalledWith({
        eventType: EventType.SEARCH_PERFORMED,
        profileId: PROFILE_ID,
        actorId: ACTOR_ID,
        anonymousId: null,
        metadata,
      });
      expect(failedEventRepository.save).not.toHaveBeenCalled();
    });

    it('normalizes omitted optional values to null', async () => {
      eventRepository.save.mockResolvedValue({ id: 'event-id' });

      await service.recordEvent({
        eventType: EventType.PROFILE_VIEWED,
      });

      expect(eventRepository.create).toHaveBeenCalledWith({
        eventType: EventType.PROFILE_VIEWED,
        profileId: null,
        actorId: null,
        anonymousId: null,
        metadata: null,
      });
      expect(eventRepository.save).toHaveBeenCalledWith({
        eventType: EventType.PROFILE_VIEWED,
        profileId: null,
        actorId: null,
        anonymousId: null,
        metadata: null,
      });
    });

    describe('when the write fails', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('dead-letters immediately on a non-retryable error, without retrying', async () => {
        const dbError = new Error(
          'duplicate key value violates unique constraint',
        );
        eventRepository.save.mockRejectedValue(dbError);

        await service.recordEvent({
          eventType: EventType.LINK_CLICKED,
          profileId: PROFILE_ID,
          actorId: ACTOR_ID,
        });

        expect(eventRepository.save).toHaveBeenCalledTimes(1);
        expect(failedEventRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: {
              eventType: EventType.LINK_CLICKED,
              profileId: PROFILE_ID,
              actorId: ACTOR_ID,
              anonymousId: null,
              metadata: null,
            },
            errorMessage: dbError.message,
            attemptCount: 1,
          }),
        );
        expect(failedEventRepository.save).toHaveBeenCalledTimes(1);
      });

      it('dead-letters after exhausting retries on a persistent transient error', async () => {
        const dbError = new Error('Query read timeout');
        eventRepository.save.mockRejectedValue(dbError);

        const resultPromise = service.recordEvent({
          eventType: EventType.PROFILE_VIEWED,
          profileId: PROFILE_ID,
        });

        await jest.advanceTimersByTimeAsync(
          DEFAULT_RETRY_CONFIG.delaysMs[0] + DEFAULT_RETRY_CONFIG.jitterMs,
        );
        await jest.advanceTimersByTimeAsync(
          DEFAULT_RETRY_CONFIG.delaysMs[1] + DEFAULT_RETRY_CONFIG.jitterMs,
        );
        await jest.advanceTimersByTimeAsync(
          DEFAULT_RETRY_CONFIG.delaysMs[2] + DEFAULT_RETRY_CONFIG.jitterMs,
        );
        await resultPromise;

        expect(eventRepository.save).toHaveBeenCalledTimes(
          DEFAULT_RETRY_CONFIG.maxRetries + 1,
        );
        expect(failedEventRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            errorMessage: dbError.message,
            attemptCount: DEFAULT_RETRY_CONFIG.maxRetries + 1,
          }),
        );
        expect(failedEventRepository.save).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('isValidProfileLink', () => {
    it('returns false when the profile does not exist', async () => {
      profileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://example.com/link'),
      ).resolves.toBe(false);

      expect(profileRepository.findOne).toHaveBeenCalledWith({
        where: { id: PROFILE_ID, isPublished: true, deletedAt: IsNull() },
        select: ['content'],
      });
    });

    it('returns true for a stored link URL', async () => {
      profileRepository.findOne.mockResolvedValue({
        content: {
          links: {
            items: [
              { url: 'https://example.com/link' },
              { url: 'https://example.com/elsewhere' },
            ],
          },
        },
      });

      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://example.com/link'),
      ).resolves.toBe(true);
    });

    it('returns true from cache on cache hit', async () => {
      redisService.get.mockResolvedValue(
        JSON.stringify(['https://example.com/link']),
      );

      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://example.com/link'),
      ).resolves.toBe(true);

      expect(profileRepository.findOne).not.toHaveBeenCalled();
    });

    it('returns false from cache when URL not in cached set', async () => {
      redisService.get.mockResolvedValue(
        JSON.stringify(['https://example.com/other']),
      );

      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://example.com/link'),
      ).resolves.toBe(false);

      expect(profileRepository.findOne).not.toHaveBeenCalled();
    });

    it('falls back to DB when Redis throws', async () => {
      redisService.get.mockRejectedValue(new Error('redis down'));
      profileRepository.findOne.mockResolvedValue({
        content: {
          links: { items: [{ url: 'https://example.com/link' }] },
        },
      });

      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://example.com/link'),
      ).resolves.toBe(true);
    });

    it('normalizes case and trailing slashes before comparing URLs', async () => {
      profileRepository.findOne.mockResolvedValue({
        content: {
          links: {
            items: [{ url: 'HTTPS://Example.com/Link/' }],
          },
          projects: {
            items: [
              {
                repoUrl: 'HTTPS://GitHub.com/Example/Project/',
                liveUrl: 'HTTPS://Project.Example.com/',
              },
            ],
          },
          cta: {
            type: 'link',
            value: 'HTTPS://CTA.Example.com/',
          },
        },
      });

      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://example.com/link'),
      ).resolves.toBe(true);
      await expect(
        service.isValidProfileLink(
          PROFILE_ID,
          'https://github.com/example/project',
        ),
      ).resolves.toBe(true);
      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://project.example.com'),
      ).resolves.toBe(true);
      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://cta.example.com'),
      ).resolves.toBe(true);
    });

    it('normalizes non-URL values by lowercasing and trimming a trailing slash', async () => {
      profileRepository.findOne.mockResolvedValue({
        content: {
          links: {
            items: [{ url: 'mailto:Hello@Example.com/' }],
          },
        },
      });

      await expect(
        service.isValidProfileLink(PROFILE_ID, 'mailto:hello@example.com'),
      ).resolves.toBe(true);
    });

    it('falls back to string normalization for non-parseable values', async () => {
      profileRepository.findOne.mockResolvedValue({
        content: {
          links: { items: [{ url: '/Relative/Path/' }] },
        },
      });

      await expect(
        service.isValidProfileLink(PROFILE_ID, '/relative/path'),
      ).resolves.toBe(true);
    });

    it('returns true for project repository and live URLs', async () => {
      profileRepository.findOne.mockResolvedValue({
        content: {
          projects: {
            items: [
              {
                repoUrl: 'https://github.com/example/project',
                liveUrl: 'https://project.example.com',
              },
            ],
          },
        },
      });

      await expect(
        service.isValidProfileLink(
          PROFILE_ID,
          'https://github.com/example/project',
        ),
      ).resolves.toBe(true);
      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://project.example.com'),
      ).resolves.toBe(true);
    });

    it('returns true for link CTA values only', async () => {
      profileRepository.findOne.mockResolvedValueOnce({
        content: {
          cta: { type: 'link', value: 'https://cta.example.com' },
        },
      });

      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://cta.example.com'),
      ).resolves.toBe(true);

      profileRepository.findOne.mockResolvedValueOnce({
        content: {
          cta: { type: 'email', value: 'https://cta.example.com' },
        },
      });

      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://cta.example.com'),
      ).resolves.toBe(false);
    });

    it('returns false when the URL is not in profile content', async () => {
      profileRepository.findOne.mockResolvedValue({
        content: {
          links: { items: [{ url: 'https://example.com/link' }] },
          projects: { items: [] },
          cta: { type: 'link', value: 'https://cta.example.com' },
        },
      });

      await expect(
        service.isValidProfileLink(PROFILE_ID, 'https://unknown.example.com'),
      ).resolves.toBe(false);
    });
  });

  describe('mergeAnonymousEvents', () => {
    it('updates only events with a null actorId, matching the given anonymousId', async () => {
      eventRepository.update = jest.fn().mockResolvedValue({ affected: 2 });

      await service.mergeAnonymousEvents('anon-uuid-123', ACTOR_ID);

      expect(eventRepository.update).toHaveBeenCalledWith(
        { anonymousId: 'anon-uuid-123', actorId: IsNull() },
        { actorId: ACTOR_ID },
      );
    });
  });

  describe('recordEvent dedup', () => {
    it('writes normally when no dedupKey is provided', async () => {
      eventRepository.save.mockResolvedValue({ id: 'event-id' });

      await service.recordEvent({
        eventType: EventType.LINK_CLICKED,
        profileId: PROFILE_ID,
      });

      expect(redisService.set).not.toHaveBeenCalled();
      expect(eventRepository.save).toHaveBeenCalledTimes(1);
    });

    it('writes when the dedup key is new (Redis returns true)', async () => {
      redisService.set.mockResolvedValue(true);
      eventRepository.save.mockResolvedValue({ id: 'event-id' });

      await service.recordEvent({
        eventType: EventType.PROFILE_VIEWED,
        profileId: PROFILE_ID,
        dedupKey: 'event-dedup:PROFILE_VIEWED:some-profile:some-viewer',
      });

      expect(redisService.set).toHaveBeenCalledWith(
        'event-dedup:PROFILE_VIEWED:some-profile:some-viewer',
        '1',
        300,
        true,
      );
      expect(eventRepository.save).toHaveBeenCalledTimes(1);
    });

    it('skips the write entirely when the dedup key already exists (Redis returns false)', async () => {
      redisService.set.mockResolvedValue(false);

      await service.recordEvent({
        eventType: EventType.PROFILE_VIEWED,
        profileId: PROFILE_ID,
        dedupKey: 'event-dedup:PROFILE_VIEWED:some-profile:some-viewer',
      });

      expect(eventRepository.create).not.toHaveBeenCalled();
      expect(eventRepository.save).not.toHaveBeenCalled();
    });

    it('respects a custom dedupTtlSeconds when provided', async () => {
      redisService.set.mockResolvedValue(true);
      eventRepository.save.mockResolvedValue({ id: 'event-id' });

      await service.recordEvent({
        eventType: EventType.PROFILE_VIEWED,
        profileId: PROFILE_ID,
        dedupKey: 'custom-key',
        dedupTtlSeconds: 60,
      });

      expect(redisService.set).toHaveBeenCalledWith(
        'custom-key',
        '1',
        60,
        true,
      );
    });

    it('fails open and still writes when Redis throws during the dedup check', async () => {
      redisService.set.mockRejectedValue(new Error('redis down'));
      eventRepository.save.mockResolvedValue({ id: 'event-id' });

      await service.recordEvent({
        eventType: EventType.PROFILE_VIEWED,
        profileId: PROFILE_ID,
        dedupKey: 'event-dedup:PROFILE_VIEWED:some-profile:some-viewer',
      });

      expect(eventRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});
