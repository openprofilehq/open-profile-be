import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationService } from './notifications.service';
import { QueueService } from '../queue/queue.service';
import {
  QUEUE_NAMES,
  QUEUE_JOB_NAMES,
} from '../queue/config/queue-names.constant';

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('NotificationService', () => {
  let service: NotificationService;
  let repo: Record<string, jest.Mock>;
  let queueService: Record<string, jest.Mock>;
  let queryBuilder: Record<string, jest.Mock>;

  beforeEach(async () => {
    queryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };

    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findAndCount: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    };

    queueService = {
      addJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(Notification),
          useValue: repo,
        },
        {
          provide: QueueService,
          useValue: queueService,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe('dispatch', () => {
    it('creates and returns a notification', async () => {
      const notification = {
        id: 'notification-id',
        userId: USER_ID,
        type: NotificationType.PROFILE_VIEW_MILESTONE,
        title: 'Milestone reached!',
        body: 'Your profile has been viewed 100 times.',
        metadata: { viewCount: 100 },
        dedupeKey: 'MILESTONE_profile-id_100',
      };
      queryBuilder.execute.mockResolvedValue({ raw: [notification] });

      await expect(
        service.dispatch({
          userId: USER_ID,
          type: NotificationType.PROFILE_VIEW_MILESTONE,
          title: notification.title,
          body: notification.body,
          metadata: notification.metadata,
          dedupeKey: notification.dedupeKey,
        }),
      ).resolves.toEqual(notification);

      expect(queryBuilder.values).toHaveBeenCalledWith({
        userId: USER_ID,
        type: NotificationType.PROFILE_VIEW_MILESTONE,
        title: notification.title,
        body: notification.body,
        metadata: notification.metadata,
        dedupeKey: notification.dedupeKey,
      });
      expect(queryBuilder.orIgnore).toHaveBeenCalled();
      expect(queryBuilder.returning).toHaveBeenCalledWith('*');
      expect(queueService.addJob).not.toHaveBeenCalled();
    });

    it('returns null when the notification is deduped', async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [] });

      await expect(
        service.dispatch({
          userId: USER_ID,
          type: NotificationType.SYSTEM_ANNOUNCEMENT,
          title: 'Heads up',
          body: 'A duplicate notification',
          dedupeKey: 'duplicate-key',
        }),
      ).resolves.toBeNull();

      expect(queueService.addJob).not.toHaveBeenCalled();
    });

    it('queues an email when requested with an email address', async () => {
      queryBuilder.execute.mockResolvedValue({
        raw: [{ id: 'notification-id', userId: USER_ID }],
      });

      await service.dispatch({
        userId: USER_ID,
        userEmail: 'user@example.com',
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: 'New announcement',
        body: 'Something happened.',
        sendEmail: true,
      });

      expect(queueService.addJob).toHaveBeenCalledWith(
        QUEUE_NAMES.EMAIL,
        QUEUE_JOB_NAMES.EMAIL.SEND_NOTIFICATION_EMAIL,
        {
          to: 'user@example.com',
          title: 'New announcement',
          body: 'Something happened.',
        },
        { attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
      );
    });

    it('does not queue an email when sendEmail is true but userEmail is omitted', async () => {
      queryBuilder.execute.mockResolvedValue({
        raw: [{ id: 'notification-id', userId: USER_ID }],
      });

      await service.dispatch({
        userId: USER_ID,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: 'New announcement',
        body: 'Something happened.',
        sendEmail: true,
      });

      expect(queueService.addJob).not.toHaveBeenCalled();
    });
  });

  describe('findAllForUser', () => {
    it('returns paginated notifications for a user', async () => {
      const items = [
        {
          id: 'notification-id',
          userId: USER_ID,
          type: NotificationType.SYSTEM_ANNOUNCEMENT,
        },
      ];
      repo.findAndCount.mockResolvedValue([items, 12]);

      await expect(service.findAllForUser(USER_ID, 2, 10)).resolves.toEqual({
        items,
        total: 12,
        page: 2,
        limit: 10,
      });

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        order: { createdAt: 'DESC' },
        skip: 10,
        take: 10,
      });
    });
  });

  describe('markAsRead', () => {
    it('marks a notification as read', async () => {
      repo.update.mockResolvedValue({ affected: 1 });

      await expect(
        service.markAsRead(USER_ID, 'notification-id'),
      ).resolves.toBeUndefined();

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'notification-id', userId: USER_ID },
        { readAt: expect.any(Date) },
      );
    });

    it('throws NotFoundException when no notification is updated', async () => {
      repo.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.markAsRead(USER_ID, 'missing-notification-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAsUnread', () => {
    it('marks a notification as unread', async () => {
      repo.update.mockResolvedValue({ affected: 1 });

      await expect(
        service.markAsUnread(USER_ID, 'notification-id'),
      ).resolves.toBeUndefined();

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'notification-id', userId: USER_ID },
        { readAt: null },
      );
    });

    it('throws NotFoundException when no notification is updated', async () => {
      repo.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.markAsUnread(USER_ID, 'missing-notification-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllAsRead', () => {
    it('marks all unread notifications as read for a user', async () => {
      repo.update.mockResolvedValue({ affected: 3 });

      await expect(service.markAllAsRead(USER_ID)).resolves.toBeUndefined();

      expect(repo.update).toHaveBeenCalledWith(
        { userId: USER_ID, readAt: IsNull() },
        { readAt: expect.any(Date) },
      );
    });
  });

  describe('unreadCount', () => {
    it('returns the unread notification count for a user', async () => {
      repo.count.mockResolvedValue(7);

      await expect(service.unreadCount(USER_ID)).resolves.toBe(7);

      expect(repo.count).toHaveBeenCalledWith({
        where: { userId: USER_ID, readAt: IsNull() },
      });
    });
  });
});
