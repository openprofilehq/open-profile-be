import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../../modules/mail/mail.service';
import { renderWaitlistEmail } from '../../modules/mail/templates/waitlist.template';
import { renderInviteEmail } from '../../modules/mail/templates/invite.template';

interface EmailResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailService: MailService) {}

  async sendWaitlistEmail(to: string): Promise<EmailResult> {
    try {
      await this.mailService.sendEmail(
        to,
        "You're on the OpenProfile wait list!",
        renderWaitlistEmail(),
      );

      return { success: true };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send waitlist email';

      this.logger.error(`Failed to send waitlist email to ${to}:`, message);

      return { success: false, error: message };
    }
  }

  async sendInviteEmail(to: string, signupUrl: string): Promise<EmailResult> {
    try {
      await this.mailService.sendEmail(
        to,
        "You've been invited to OpenProfile",
        renderInviteEmail(signupUrl),
      );

      return { success: true };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send invite email';

      this.logger.error(`Failed to send invite email to ${to}:`, message);

      return { success: false, error: message };
    }
  }
}
