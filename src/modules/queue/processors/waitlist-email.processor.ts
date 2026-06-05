import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WaitlistRepository } from '../../waitlist/actions/waitlist.repository';
import { EmailService } from '../../../common/email/email.service';
import { QUEUE_JOB_NAMES } from '../config/queue-names.constant';

@Processor(QUEUE_JOB_NAMES.EMAIL.WAITLIST)
export class WaitlistEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(WaitlistEmailProcessor.name);

  constructor(
    private readonly waitlistRepository: WaitlistRepository,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local[0]}***@${domain}`;
  }

  async process(job: Job): Promise<{ success: boolean; email: string }> {
    try {
      const { email } = job.data as { email: string };
      this.logger.log(`Processing waitlist email for ${this.maskEmail(email)}`);

      const entry = await this.waitlistRepository.findByEmail(email);
      if (!entry) {
        throw new Error(`Waitlist entry not found for job ${job.id}`);
      }

      const result = await this.emailService.sendWaitlistEmail(entry.email);
      if (!result.success) {
        throw new Error(`Failed to send email: ${result.error}`);
      }

      this.logger.log(
        `[EMAIL] Waitlist email sent to: ${this.maskEmail(entry.email)}`,
      );
      await this.waitlistRepository.markEmailSent(entry.id);
      this.logger.log(`Waitlist email marked as sent for job ${job.id}`);

      return { success: true, email: entry.email };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Failed to process waitlist email for job ${job.id}`,
        error.stack,
      );
      throw error;
    }
  }
}
