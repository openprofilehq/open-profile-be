import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';
import { QueueService } from '../queue/queue.service';
import {
  QUEUE_NAMES,
  QUEUE_JOB_NAMES,
} from '../queue/config/queue-names.constant';
import { Logger } from '@nestjs/common';

export interface DispatchNotificationParams {
  userId: string;
  userEmail?: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, any>;
  dedupeKey?: string;
  sendEmail?: boolean;
}

interface NotificationInsertResult {
  raw: Notification[];
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    private readonly queueService: QueueService,
  ) {}

  async dispatch(
    params: DispatchNotificationParams,
  ): Promise<Notification | null> {
    const result = (await this.repo
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values({
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        metadata: params.metadata ?? null,
        dedupeKey: params.dedupeKey ?? null,
      })
      .orIgnore()
      .returning('*')
      .execute()) as NotificationInsertResult;

    if (result.raw.length === 0) {
      return null; // duplicate, skipped via unique constraint
    }

    const notification = result.raw[0];

    if (params.sendEmail && params.userEmail) {
      try {
        await this.queueService.addJob(
          QUEUE_NAMES.EMAIL,
          QUEUE_JOB_NAMES.EMAIL.SEND_NOTIFICATION_EMAIL,
          { to: params.userEmail, title: params.title, body: params.body },
          { attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to enqueue notification email for ${params.userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return notification;
  }

  async findAllForUser(userId: string, page = 1, limit = 20) {
    const [items, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }

  async markAsRead(userId: string, id: string): Promise<void> {
    const result = await this.repo.update(
      { id, userId },
      { readAt: new Date() },
    );

    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  async markAsUnread(userId: string, id: string): Promise<void> {
    const result = await this.repo.update({ id, userId }, { readAt: null });

    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.repo.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, readAt: IsNull() } });
  }
}
