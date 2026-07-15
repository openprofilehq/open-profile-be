import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../users/entities/user.entity';
import { QueueService } from '../queue/queue.service';
import {
  QUEUE_NAMES,
  QUEUE_JOB_NAMES,
} from '../queue/config/queue-names.constant';

const FANOUT_BATCH_SIZE = 500;

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly queueService: QueueService,
  ) {}

  async broadcast(
    title: string,
    body: string,
  ): Promise<{ announcementId: string }> {
    const announcementId = uuidv4();
    let offset = 0;

    try {
      while (true) {
        const users = await this.userRepo
          .createQueryBuilder('user')
          .select('user.id')
          .orderBy('user.id')
          .offset(offset)
          .limit(FANOUT_BATCH_SIZE)
          .getMany();

        if (users.length === 0) break;

        await this.queueService.addJob(
          QUEUE_NAMES.ANNOUNCEMENT,
          QUEUE_JOB_NAMES.ANNOUNCEMENT.FANOUT_BATCH,
          {
            announcementId,
            title,
            body,
            userIds: users.map((u) => u.id),
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
        );

        offset += FANOUT_BATCH_SIZE;
      }
    } catch {
      throw new InternalServerErrorException(
        'Failed to broadcast announcement',
      );
    }

    return { announcementId };
  }
}
