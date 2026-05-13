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
    this.logger.log(`[PROCESSOR] Processing job id="${job.id}" name="${job.name}"`);

    switch (job.name) {
      case QUEUE_JOB_NAMES.EMAIL.SEND_PASSWORD_RESET:
        await this.handleSendPasswordResetEmail(job.data as ResetPasswordEmailData);
        break;

      case QUEUE_JOB_NAMES.EMAIL.SEND_PASSWORD_CHANGED:
        await this.handleSendPasswordChangedEmail(job.data as PasswordChangedEmailData);
        break;

      case QUEUE_JOB_NAMES.EMAIL.ACCOUNT_LOCKED:
        await this.handleAccountLockedEmail(job.data as AccountLockedEmailData);
        break;

      case QUEUE_JOB_NAMES.EMAIL.NEW_IP_LOGIN:
        await this.handleNewIpLoginEmail(job.data as NewIpLoginEmailData);
        break;

      case QUEUE_JOB_NAMES.EMAIL.SEND_OTP:
        await this.handleResendOTP(job.data as { to: string; otp: string; fullName: string });
        break;

      default:
        this.logger.warn(`[PROCESSOR] Unknown job name="${job.name}" — skipping`);
        break;
    }
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  private async handleSendPasswordResetEmail(data: ResetPasswordEmailData) {
    this.logger.log(`[PROCESSOR] handleSendPasswordResetEmail → to="${data.to}"`);

    await this.mailService.sendEmail(
      data.to,
      'Reset your Open Profile password',
      resetPasswordEmailTemplate({ resetUrl: data.resetLink }),
    );
  }

  private async handleSendPasswordChangedEmail(data: PasswordChangedEmailData) {
    this.logger.log(`[PROCESSOR] handleSendPasswordChangedEmail → to="${data.to}"`);

    await this.mailService.sendEmail(
      data.to,
      'Your Open Profile password has been changed',
      renderPasswordChangedEmail(),
    );
  }

  private async handleAccountLockedEmail(data: AccountLockedEmailData) {
    this.logger.log(`[PROCESSOR] handleAccountLockedEmail → to="${data.to}"`);

    await this.mailService.sendEmail(
      data.to,
      'Unusual sign-in activity on your Open Profile account',
      renderAccountLockedEmail(data.lockedUntil),
    );
  }

  private async handleNewIpLoginEmail(data: NewIpLoginEmailData) {
    this.logger.log(`[PROCESSOR] handleNewIpLoginEmail → to="${data.to}"`);

    await this.mailService.sendEmail(
      data.to,
      'New sign-in to your Open Profile account',
      renderNewIpLoginEmail(data.ip, data.timestamp),
    );
  }

  private async handleResendOTP(data: { to: string; otp: string; fullName: string }) {
    this.logger.log(`[PROCESSOR] handleResendOTP → to="${data.to}"`);

    await this.mailService.sendEmail(
      data.to,
      OTP_EMAIL_SUBJECT,
      renderVerificationOtpEmail(data.fullName, data.otp),
    );
  }

  // ─── Worker events ────────────────────────────────────────────────────────

  @OnWorkerEvent('completed')
  handleCompleted(job: Job) {
    this.logger.log(`[PROCESSOR] Job id="${job.id}" name="${job.name}" completed`);
  }

  @OnWorkerEvent('failed')
  handleFailed(job: Job, error: Error) {
    this.logger.error(
      `[PROCESSOR] Job id="${job.id}" name="${job.name}" FAILED — ${error.message}`,
      error.stack,
    );
  }
}