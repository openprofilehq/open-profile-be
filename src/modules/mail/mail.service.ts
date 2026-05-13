import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { renderVerificationOtpEmail } from './templates/verification-otp.template';
import { renderPasswordResetOtpEmail } from './templates/reset-password-otp.template';
import { Resend } from 'resend';

export const OTP_EMAIL_SUBJECT = 'Verify your Open Profile account';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;

  constructor() {
    this.resend = new Resend(env.RESEND_API_KEY);
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    await this.resend.emails.send({
      from: env.MAIL_FROM,
      to,
      subject,
      html,
    });

    this.logger.log(`Email sent to ${to} with subject "${subject}"`);
  }

  // Throws on Resend failure — caller is responsible for catching and logging.
  async sendPasswordResetOtp(toEmail: string, otp: string): Promise<void> {
    this.logger.log(`Sending password reset OTP to ${toEmail}`);

    await this.resend.emails.send({
      from: env.MAIL_FROM,
      to: toEmail,
      subject: 'Reset your Open Profile password',
      html: renderPasswordResetOtpEmail(otp),
    });

    this.logger.log(`Password reset OTP delivered to ${toEmail}`);
  }

  async sendVerificationOtp(
    toEmail: string,
    fullName: string,
    otp: string,
  ): Promise<void> {
    this.logger.log(`Sending OTP email to ${toEmail}`);

    try {
      await this.resend.emails.send({
        from: env.MAIL_FROM,
        to: toEmail,
        subject: OTP_EMAIL_SUBJECT,
        html: renderVerificationOtpEmail(fullName, otp),
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send OTP email to ${toEmail}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    this.logger.log(`OTP email delivered to ${toEmail}`);
  }
}
