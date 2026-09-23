import { Module } from '@nestjs/common';
import { MailModule } from '../../modules/mail/mail.module';
import { EmailService } from './email.service';

@Module({
  imports: [MailModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
