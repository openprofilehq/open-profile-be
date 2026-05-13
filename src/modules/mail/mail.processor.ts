import { WorkerHost, OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailService, OTP_EMAIL_SUBJECT } from './mail.service';
import { Logger } from '@nestjs/common';
import {
  QUEUE_NAMES,
  QUEUE_JOB_NAMES,
} from '../queue/config/queue-names.constant';
import { resetPasswordEmailTemplate } from './reset-email.template';
import { PasswordChangedEmailData } from './interfaces/password-changed-email.interface';
import { ResetPasswordEmailData } from './interfaces/reset-password-email.interface';
import { AccountLockedEmailData } from './interfaces/account-locked-email.interface';
import { NewIpLoginEmailData } from './interfaces/new-ip-login-email.interface';
import { renderVerificationOtpEmail } from './templates/verification-otp.template';
import { renderPasswordChangedEmail } from './templates/password-changed.template';
import { renderAccountLockedEmail } from './templates/account-locked.template';
import { renderNewIpLoginEmail } from './templates/new-ip-login.template';

@Processor(QUEUE_NAMES.EMAIL)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case QUEUE_JOB_NAMES.EMAIL.SEND_PASSWORD_RESET:
        await this.handleSendPasswordResetEmail(
          job.data as ResetPasswordEmailData,
        );
        break;

      case QUEUE_JOB_NAMES.EMAIL.SEND_PASSWORD_CHANGED:
        await this.handleSendPasswordChangedEmail(
          job.data as PasswordChangedEmailData,
        );
        break;

      case QUEUE_JOB_NAMES.EMAIL.ACCOUNT_LOCKED:
        await this.handleAccountLockedEmail(job.data as AccountLockedEmailData);
        break;

      case QUEUE_JOB_NAMES.EMAIL.NEW_IP_LOGIN:
        await this.handleNewIpLoginEmail(job.data as NewIpLoginEmailData);
        break;
      case QUEUE_JOB_NAMES.EMAIL.SEND_OTP:
        await this.handleResendOTP(
          job.data as {
            to: string;
            otp: string;
            fullName: string;
          },
        );
        break;

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        break;
    }
  }

  private async handleSendPasswordResetEmail(data: ResetPasswordEmailData) {
    const { to, resetLink } = data;
    const subject = 'Reset your Open Profile password';
    const html = resetPasswordEmailTemplate({ resetUrl: resetLink });
    await this.mailService.sendEmail(to, subject, html);
  }

  private async handleSendPasswordChangedEmail(data: PasswordChangedEmailData) {
    const subject = 'Your Open Profile password has been changed';

    const html = renderPasswordChangedEmail();

    await this.mailService.sendEmail(data.to, subject, html);
  }

  private async handleAccountLockedEmail(data: AccountLockedEmailData) {
    const { to, lockedUntil } = data;

    const subject = 'Unusual sign-in activity on your Open Profile account';

    const html = renderAccountLockedEmail(lockedUntil);

    await this.mailService.sendEmail(to, subject, html);
  }

  private async handleNewIpLoginEmail(data: NewIpLoginEmailData) {
    const { to, ip, timestamp } = data;

    const subject = 'New sign-in to your Open Profile account';

    const html = renderNewIpLoginEmail(ip, timestamp);

    await this.mailService.sendEmail(to, subject, html);
  }

  private async handleResendOTP(data: {
    to: string;
    otp: string;
    fullName: string;
  }) {
    const html = renderVerificationOtpEmail(data.fullName, data.otp);

    await this.mailService.sendEmail(data.to, OTP_EMAIL_SUBJECT, html);
  }

  @OnWorkerEvent('completed')
  handleCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed successfully.`);
  }

  @OnWorkerEvent('failed')
  handleFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} failed with error: ${error.message}`,
      error.stack,
    );
  }
}
