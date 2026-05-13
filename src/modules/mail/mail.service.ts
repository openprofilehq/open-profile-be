import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { renderVerificationOtpEmail } from './templates/verification-otp.template';
import { renderPasswordResetOtpEmail } from './templates/reset-password-otp.template';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';

export const OTP_EMAIL_SUBJECT = 'Verify your Open Profile account';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly brevoTransporter: nodemailer.Transporter;

  constructor() {
    this.resend = new Resend(env.RESEND_API_KEY);

    // Initialize Brevo SMTP transporter (300/day limit)
    this.brevoTransporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: env.BREVO_SMTP_USER,
        pass: env.BREVO_SMTP_PASSWORD,
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const timestamp = new Date().toISOString();
    let brevoErrorMsg: string | undefined;

    // Try Brevo first (300/day limit)
    try {
      const fromHeader: string = env.BREVO_SENDER_NAME
        ? `${env.BREVO_SENDER_NAME} <${env.MAIL_FROM}>`
        : env.MAIL_FROM;

      // Ensure SMTP envelope uses raw address format MAIL FROM:<address>
      const brevoResponse: unknown = await this.brevoTransporter.sendMail({
        from: fromHeader,
        to,
        subject,
        html,
        envelope: {
          from: env.MAIL_FROM,
          to,
        },
      });
      const info = brevoResponse as { messageId?: string };

      this.logger.log(
        `[${timestamp}] Email sent via BREVO to ${to} | Subject: "${subject}" | Message ID: ${info.messageId}`,
      );
      return;
    } catch (error) {
      brevoErrorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[${timestamp}] Brevo failed for ${to} (${subject}): ${brevoErrorMsg ?? 'Unknown Brevo error'}. Attempting Resend fallback...`,
      );
    }

    // Fallback to Resend (100/day limit)
    try {
      const resendResponse: unknown = await this.resend.emails.send({
        from: env.MAIL_FROM,
        to,
        subject,
        html,
      });
      const resendInfo = resendResponse as { data?: { id?: string } };

      this.logger.log(
        `[${timestamp}] Email sent via RESEND (fallback) to ${to} | Subject: "${subject}" | Message ID: ${resendInfo.data?.id || 'N/A'}`,
      );
      return;
    } catch (error) {
      const resendErrorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${timestamp}] CRITICAL: Both providers failed for ${to} (${subject}) | Brevo error: ${brevoErrorMsg ?? 'Unknown Brevo error'} | Resend error: ${resendErrorMsg}`,
      );
      throw new Error(
        `Failed to send email to ${to}. Check logs for details.`,
        { cause: error },
      );
    }
  }

  async sendPasswordResetOtp(toEmail: string, otp: string): Promise<void> {
    this.logger.log(`Sending password reset OTP to ${toEmail}`);

    const subject = 'Reset your Open Profile password';
    const html = renderPasswordResetOtpEmail(otp);

    await this.sendEmail(toEmail, subject, html);
  }

  async sendVerificationOtp(
    toEmail: string,
    fullName: string,
    otp: string,
  ): Promise<void> {
    this.logger.log(`Sending OTP email to ${toEmail}`);

    const html = renderVerificationOtpEmail(fullName, otp);
    await this.sendEmail(toEmail, OTP_EMAIL_SUBJECT, html);
  }
}
