import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { renderContactEmail } from '../mail/templates/contact.template';
import { renderContactConfirmationEmail } from '../mail/templates/contact-confirmation.template';
import { env } from '../../config/env';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private readonly mailService: MailService) {}

  async submit(dto: CreateContactDto): Promise<void> {
    const adminRecipient = env.CONTACT_EMAIL ?? env.MAIL_FROM;

    await Promise.all([
      this.mailService.sendEmail(
        adminRecipient,
        `New Contact Form Submission from ${dto.name}`,
        renderContactEmail(dto),
      ),
      this.mailService.sendEmail(
        dto.email,
        'We received your message — Open Profile',
        renderContactConfirmationEmail(dto.name),
      ),
    ]);

    this.logger.log(`Contact form submission from ${dto.email} processed`);
  }
}
