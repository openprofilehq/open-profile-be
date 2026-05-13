import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { Resend } from 'resend';

interface EmailResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;

  constructor() {
    this.resend = new Resend(env.RESEND_API_KEY);
    this.logger.log('EmailService initialized with Resend');
  }

  async sendWaitlistEmail(to: string): Promise<EmailResult> {
    try {
      const html = this.getWaitlistEmailHtml();

      const data = await this.resend.emails.send({
        from: env.MAIL_FROM,
        to,
        subject: "You're on the OpenProfile wait list!",
        html,
      });

      return { success: true, data };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send waitlist email';
      this.logger.error(`Failed to send email to ${to}:`, message);
      return { success: false, error: message };
    }
  }

  private getWaitlistEmailHtml(): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2563eb;">Welcome to the OpenProfile Waitlist!</h1>
            <p>You've been added to our waitlist. We'll notify you as soon as we launch!</p>
            <p>Thank you for your interest,<br>The OpenProfile Team</p>
          </div>
        </body>
      </html>
    `;
  }
}
