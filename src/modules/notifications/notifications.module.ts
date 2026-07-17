import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './notifications.service';
import { NotificationController } from './notifications.controller';
import { AnnouncementService } from './announcements.service';
import { AnnouncementController } from './announcements.controller';
import { AnnouncementFanoutProcessor } from '../queue/processors/announcement-fanout.processor';
import { User } from '../users/entities/user.entity';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User]), QueueModule],
  providers: [
    NotificationService,
    AnnouncementService,
    AnnouncementFanoutProcessor,
  ],
  controllers: [NotificationController, AnnouncementController],
  exports: [NotificationService],
})
export class NotificationModule {}
