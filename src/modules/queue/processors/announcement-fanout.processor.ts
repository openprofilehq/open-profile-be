import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../notifications/entities/notification.entity';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { QUEUE_NAMES } from '../config/queue-names.constant';

interface FanoutBatchData {
  announcementId: string;
  title: string;
  body: string;
  userIds: string[];
}

@Processor(QUEUE_NAMES.ANNOUNCEMENT)
export class AnnouncementFanoutProcessor extends WorkerHost {
  private readonly logger = new Logger(AnnouncementFanoutProcessor.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {
    super();
  }

  async process(job: Job<FanoutBatchData>): Promise<void> {
    const { announcementId, title, body, userIds } = job.data;

    const rows = userIds.map((userId) => ({
      userId,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      title,
      body,
      dedupeKey: `ANNOUNCEMENT_${announcementId}`,
    }));

    await this.notificationRepo
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values(rows)
      .orIgnore()
      .execute();

    this.logger.log(
      `Fanned out announcement ${announcementId} to ${userIds.length} users`,
    );
  }

  @OnWorkerEvent('failed')
  handleFailed(job: Job, error: Error) {
    this.logger.error(
      `Announcement fanout job ${job.id} failed: ${error.message}`,
      error.stack,
    );
  }
}
