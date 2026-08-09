import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../notifications/entities/notification.entity';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { QUEUE_NAMES } from '../config/queue-names.constant';
import { NotificationsGateway } from '../../../realtime/gateways/notifications.gateway';

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
    private readonly gateway: NotificationsGateway,
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

    if (rows.length === 0) {
      return;
    }

    const result = (await this.notificationRepo
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values(rows)
      .orIgnore()
      .returning(['userId'])
      .execute()) as { raw: { userId: string }[] };

    const insertedUserIds = result.raw.map((row) => row.userId);

    this.logger.log(
      `Fanned out announcement ${announcementId}: ${insertedUserIds.length}/${userIds.length} users (new/attempted)`,
    );
    if (insertedUserIds.length === 0) {
      return;
    }

    this.gateway.emitToUsers(insertedUserIds, 'notification:new', {
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      title,
      body,
    });
  }

  @OnWorkerEvent('failed')
  handleFailed(job: Job, error: Error) {
    this.logger.error(
      `Announcement fanout job ${job.id} failed: ${error.message}`,
      error.stack,
    );
  }
}
