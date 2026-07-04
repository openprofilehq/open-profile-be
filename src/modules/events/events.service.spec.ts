import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { EventsService } from './events.service';
import { Event, EventType } from './entities/event.entity';
import { FailedEvent } from './entities/failed-event.entity';
import { Profile } from '../profile/entities/profile.entity';

const PROFILE_ID = '660e8400-e29b-41d4-a716-446655440001';
const ACTOR_ID = '770e8400-e29b-41d4-a716-446655440002';

describe('EventsService', () => {
  let service: EventsService;
  let eventRepository: Record<string, jest.Mock>;
  let failedEventRepository: Record<string, jest.Mock>;
  let profileRepository: Record<string, jest.Mock>;

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
        metadata,
      });
      expect(eventRepository.save).toHaveBeenCalledWith({
        eventType: EventType.SEARCH_PERFORMED,
        profileId: PROFILE_ID,
        actorId: ACTOR_ID,
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
        metadata: null,
      });
      expect(eventRepository.save).toHaveBeenCalledWith({
        eventType: EventType.PROFILE_VIEWED,
        profileId: null,
        actorId: null,
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

        // Non-retryable -> only ever called once, no backoff delay needed
        expect(eventRepository.save).toHaveBeenCalledTimes(1);
        expect(failedEventRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: {
              eventType: EventType.LINK_CLICKED,
              profileId: PROFILE_ID,
              actorId: ACTOR_ID,
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

        // 3 retries -> advance past all 3 backoff windows (generously,
        // past the max possible jitter each time)
        await jest.advanceTimersByTimeAsync(150); // covers ~100ms + jitter
        await jest.advanceTimersByTimeAsync(250); // covers ~200ms + jitter
        await jest.advanceTimersByTimeAsync(450); // covers ~400ms + jitter
        await resultPromise;

        expect(eventRepository.save).toHaveBeenCalledTimes(4); // 1 + 3 retries
        expect(failedEventRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            errorMessage: dbError.message,
            attemptCount: 4,
          }),
        );
        expect(failedEventRepository.save).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('isValidProfileLink', () => {
    // ... unchanged, exactly as you already have it
  });
});
