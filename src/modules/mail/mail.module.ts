import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

@Module({
  imports: [QueueModule],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
