import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invite } from './entities/invite.entity';
import { InvitesService } from './invites.service';
import { UsersModule } from '../users/users.module';
import { EventsModule } from '../events/events.module';
import { QueueModule } from '../queue/queue.module';
import { NotificationModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { InvitesController } from './invites.controller';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invite]),
    UsersModule,
    EventsModule,
    QueueModule,
    NotificationModule,
    forwardRef(() => AuthModule),
    RateLimiterModule,
  ],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
