import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './config/queue-names.constant';
import { QueueService } from './queue.service';
import { bullConfig } from './config/bull.config';

@Module({
  imports: [
    BullModule.forRoot(bullConfig),
    BullModule.registerQueue({
      name: QUEUE_NAMES.EMAIL,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.ANNOUNCEMENT,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.METRICS,
    }),
  ],
  providers: [QueueService],
  exports: [BullModule, QueueService],
})
export class QueueModule {}
