import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { WaitList } from './entities/waitList.entity';
import { WaitListModelAction } from './actions/waitList.action';
import { QUEUE_JOB_NAMES } from '../queue/config/queue-names.constant';

@Injectable()
export class WaitListService {
  constructor(
    private readonly waitListModelAction: WaitListModelAction,
    @InjectQueue(QUEUE_JOB_NAMES.EMAIL.WAITLIST)
    private readonly waitListEmailQueue: Queue,
  ) {}

  async addToWaitlist(email: string): Promise<WaitList> {
    const waitListEntry = await this.waitListModelAction.create(email);

    await this.waitListEmailQueue.add('send-waitlist-email', {
      email: waitListEntry.email,
    });
    return waitListEntry;
  }

  async getAllWaitList(page: number = 1, limit: number = 100) {
    return this.waitListModelAction.getAll(page, limit);
  }
}
