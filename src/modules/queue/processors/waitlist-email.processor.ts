import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WaitListModelAction } from '../../waitlist/actions/waitList.action';
import { EmailService } from '../../../common/email/email.service';
import { QUEUE_JOB_NAMES } from '../config/queue-names.constant';

@Processor(QUEUE_JOB_NAMES.EMAIL.WAITLIST)
export class WaitlistEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(WaitlistEmailProcessor.name);

  constructor(
    private readonly waitlistModelAction: WaitListModelAction,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(job: Job): Promise<{ success: boolean; email: string }> {
    try {
      const { email } = job.data as { email: string };
      this.logger.log(`Processing waitlist email for ${email}`);
      const waitlistEntry = await this.waitlistModelAction.findByEmail(email);
      if (!waitlistEntry) {
        throw new Error(`Waitlist entry with email ${email} not found`);
      }
      const result = await this.emailService.sendWaitlistEmail(
        waitlistEntry.email,
      );
      if (!result.success) {
        throw new Error(`Failed to send email: ${result.error}`);
      }

      this.logger.log(`[EMAIL] Waitlist email sent to: ${waitlistEntry.email}`);
      await this.waitlistModelAction.markEmailSent(waitlistEntry.id);

      this.logger.log(`Waitlist email marked as sent for entry ${email}`);
      return { success: true, email: waitlistEntry.email };
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
