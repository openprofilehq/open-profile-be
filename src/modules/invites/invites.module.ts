import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invite } from './entities/invite.entity';
import { InvitesService } from './invites.service';
import { UsersModule } from '../users/users.module';
import { QueueModule } from '../queue/queue.module';
import { InvitesController } from './invites.controller';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invite]),
    UsersModule,
    QueueModule,
    RateLimiterModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
