import { DataSource, DeepPartial } from 'typeorm';
import { Notification } from '../../modules/notifications/entities/notification.entity';
import { NotificationType } from '../../modules/notifications/enums/notification-type.enum';
import { User } from '../../modules/users/entities/user.entity';
import { Seeder } from './seeder.interface';

export const notificationSeeder: Seeder = {
  name: 'NotificationSeeder',
  async run(dataSource: DataSource) {
    const repo = dataSource.getRepository(Notification);
    const userRepo = dataSource.getRepository(User);

    const existingCount = await repo.count();
    if (existingCount > 0) {
      console.log(
        `[NotificationSeeder] ${existingCount} notifications already exist - skipping`,
      );
      return;
    }

    const users = await userRepo.find({
      select: ['id'],
      order: { createdAt: 'ASC' },
    });
    if (users.length === 0) {
      console.log('[NotificationSeeder] no users found - skipping');
      return;
    }

    const entries: DeepPartial<Notification>[] = [];
    const now = Date.now();

    for (let i = 0; i < users.length; i++) {
      const user = users[i];

      if (Math.random() > 0.4) {
        const milestone = [10, 50, 100, 500][Math.floor(Math.random() * 4)];
        entries.push({
          userId: user.id,
          type: NotificationType.PROFILE_VIEW_MILESTONE,
          title: `${milestone} profile views!`,
          body: `Your profile has reached ${milestone} views. Keep it up!`,
          metadata: { milestone },
          readAt: Math.random() > 0.5 ? new Date(now - 86400000) : null,
          dedupeKey: `profile-view-milestone:${user.id}:${milestone}`,
        });
      }

      if (Math.random() > 0.6) {
        entries.push({
          userId: user.id,
          type: NotificationType.INVITE_CLAIMED,
          title: 'Your invite was claimed!',
          body: 'Someone you invited has joined the platform.',
          metadata: null,
          readAt: Math.random() > 0.3 ? new Date(now - 172800000) : null,
          dedupeKey: `invite-claimed:${user.id}:${i}`,
        });
      }

      if (i < 10) {
        entries.push({
          userId: user.id,
          type: NotificationType.SYSTEM_ANNOUNCEMENT,
          title: 'Welcome to Open Profile!',
          body: 'Complete your profile to get discovered by others.',
          metadata: null,
          readAt: null,
          dedupeKey: `system-welcome:${user.id}`,
        });
      }
    }

    if (entries.length === 0) {
      console.log('[NotificationSeeder] no notifications generated - done');
      return;
    }

    const instances = repo.create(entries);
    const CHUNK = 500;
    for (let i = 0; i < instances.length; i += CHUNK) {
      await repo
        .createQueryBuilder()
        .insert()
        .into(Notification)
        .values(instances.slice(i, i + CHUNK))
        .orIgnore()
        .execute();
    }

    console.log(`[NotificationSeeder] seeded ${entries.length} notifications`);
  },
};
