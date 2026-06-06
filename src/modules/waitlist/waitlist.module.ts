import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WaitlistEmailProcessor } from '../queue/processors/waitlist-email.processor';
import { WaitlistController } from './waitlist.controller';
import { WaitlistRepository } from './actions/waitlist.repository';
import { WaitlistService } from './waitlist.service';
import { Waitlist } from './entities/waitlist.entity';
import { EmailModule } from '../../common/email/email.module';
import { QUEUE_JOB_NAMES } from '../queue/config/queue-names.constant';

@Module({
  imports: [
    TypeOrmModule.forFeature([Waitlist]),
    BullModule.registerQueue({
      name: QUEUE_JOB_NAMES.EMAIL.WAITLIST,
    }),
    EmailModule,
  ],
  controllers: [WaitlistController],
  providers: [WaitlistRepository, WaitlistEmailProcessor, WaitlistService],
  exports: [WaitlistService, WaitlistRepository],
})
export class WaitlistModule {}
