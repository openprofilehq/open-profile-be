import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { renderVerificationOtpEmail } from './templates/verification-otp.template';
import { renderPasswordResetOtpEmail } from './templates/reset-password-otp.template';
import { Resend } from 'resend';
import { BrevoClient } from '@getbrevo/brevo';

export const OTP_EMAIL_SUBJECT = 'Verify your Open Profile account';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly brevoClient: BrevoClient;

  constructor() {
    this.resend = new Resend(env.RESEND_API_KEY);

    this.brevoClient = new BrevoClient({
      apiKey: env.BREVO_API_KEY,
    });
  }

  // ─── Central dispatcher: Brevo → Resend fallback ──────────────────────────

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    // 1. Try Brevo
    try {
      await this.sendWithBrevo(to, subject, html);
      this.logger.log(`[BREVO] Delivered → to="${to}" subject="${subject}"`);
      return;
    } catch (brevoError: unknown) {
      this.logger.error(
        `[BREVO] FAILED → to="${to}" subject="${subject}" | error="${
          brevoError instanceof Error ? brevoError.message : String(brevoError)
        }"`,
        brevoError instanceof Error ? brevoError.stack : undefined,
      );
    }

    // 2. Fallback to Resend
    try {
      const { data, error } = await this.resend.emails.send({
        from: env.MAIL_FROM,
        to,
        subject,
        html,
      });

      if (error) {
        this.logger.error(
          `[RESEND] FAILED → to="${to}" subject="${subject}" | error="${error.message}"`,
        );
        // fall through to the "both failed" block below
      } else {
        this.logger.log(
          `[RESEND] Delivered → emailId="${data?.id}" to="${to}" subject="${subject}"`,
        );
        return;
      }
    } catch (resendError: unknown) {
      this.logger.error(
        `[RESEND] EXCEPTION → to="${to}" subject="${subject}" | error="${
          resendError instanceof Error ? resendError.message : String(resendError)
        }"`,
        resendError instanceof Error ? resendError.stack : undefined,
      );
    }

    // 3. Both failed
    this.logger.error(
      `[MAIL] BOTH PROVIDERS FAILED → to="${to}" subject="${subject}" — email was NOT delivered`,
    );
    throw new Error(
      `Email delivery failed for "${to}" (subject: "${subject}"). Both Brevo and Resend returned errors.`,
    );
  }

  // ─── Brevo implementation ─────────────────────────────────────────────────

  private async sendWithBrevo(to: string, subject: string, html: string): Promise<void> {
    this.logger.log(`[BREVO] Attempting → to="${to}" subject="${subject}"`);

    await this.brevoClient.transactionalEmails.sendTransacEmail({
      sender: {
        name: env.BREVO_SENDER_NAME,
        email: env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });
  }

  // ─── Public mail methods ──────────────────────────────────────────────────

  async sendPasswordResetOtp(toEmail: string, otp: string): Promise<void> {
    this.logger.log(`[MAIL] Sending password reset OTP → to="${toEmail}"`);

    await this.sendEmail(
      toEmail,
      'Reset your Open Profile password',
      renderPasswordResetOtpEmail(otp),
    );

    this.logger.log(`[MAIL] Password reset OTP delivered → to="${toEmail}"`);
  }

  async sendVerificationOtp(
    toEmail: string,
    fullName: string,
    otp: string,
  ): Promise<void> {
    this.logger.log(`[MAIL] Sending verification OTP → to="${toEmail}"`);

    await this.sendEmail(
      toEmail,
      OTP_EMAIL_SUBJECT,
      renderVerificationOtpEmail(fullName, otp),
    );

    this.logger.log(`[MAIL] Verification OTP delivered → to="${toEmail}"`);
  }
}