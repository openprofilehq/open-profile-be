import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { WaitlistService } from './waitlist.service';
import { WaitlistRepository } from './actions/waitlist.repository';
import { QUEUE_JOB_NAMES } from '../queue/config/queue-names.constant';

describe('WaitlistService', () => {
  let service: WaitlistService;
  let waitlistRepository: { create: jest.Mock; getAll: jest.Mock };
  let waitlistEmailQueue: { add: jest.Mock };

  beforeEach(async () => {
    waitlistRepository = {
      create: jest.fn(),
      getAll: jest.fn(),
    };

    waitlistEmailQueue = {
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: WaitlistRepository, useValue: waitlistRepository },
        {
          provide: `BullQueue_${QUEUE_JOB_NAMES.EMAIL.WAITLIST}`,
          useValue: waitlistEmailQueue,
        },
      ],
    }).compile();

    service = module.get<WaitlistService>(WaitlistService);
  });

  it('adds email to waitlist and enqueues waitlist email job', async () => {
    const entry = {
      id: 'waitlist-1',
      email: 'tester@example.com',
      emailSent: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    waitlistRepository.create.mockResolvedValue(entry);

    const result = await service.addToWaitlist('tester@example.com');

    expect(waitlistRepository.create).toHaveBeenCalledWith(
      'tester@example.com',
    );
    expect(waitlistEmailQueue.add).toHaveBeenCalledWith(
      QUEUE_JOB_NAMES.EMAIL.SEND_WAITLIST_EMAIL,
      { email: 'tester@example.com' },
    );
    expect(result).toEqual(entry);
  });

  it('delegates getAllWaitlist to the repository', async () => {
    const expected = {
      data: [{ id: 'waitlist-1', email: 'tester@example.com' }],
      total: 1,
      page: 2,
      limit: 10,
      totalPages: 1,
    } as any;

    waitlistRepository.getAll.mockResolvedValue(expected);

    const result = await service.getAllWaitlist(2, 10);

    expect(waitlistRepository.getAll).toHaveBeenCalledWith(2, 10);
    expect(result).toEqual(expected);
  });
});
