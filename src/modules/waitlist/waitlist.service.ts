import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Waitlist } from './entities/waitlist.entity';
import { WaitlistRepository } from './actions/waitlist.repository';
import { QUEUE_JOB_NAMES } from '../queue/config/queue-names.constant';

@Injectable()
export class WaitlistService {
  constructor(
    private readonly waitlistRepository: WaitlistRepository,
    @InjectQueue(QUEUE_JOB_NAMES.EMAIL.WAITLIST)
    private readonly waitlistEmailQueue: Queue,
  ) {}

  async addToWaitlist(email: string): Promise<Waitlist> {
    const existing = await this.waitlistRepository.findByEmail(email);
    if (existing) return existing;

    const entry = await this.waitlistRepository.create(email);
    try {
      await this.waitlistEmailQueue.add(
        QUEUE_JOB_NAMES.EMAIL.SEND_WAITLIST_EMAIL,
        { email: entry.email },
      );
    } catch (error) {
      await this.waitlistRepository.deleteById(entry.id);
      throw error;
    }
    return entry;
  }

  async getAllWaitlist(page: number, limit: number) {
    return this.waitlistRepository.getAll(page, limit);
  }
}
