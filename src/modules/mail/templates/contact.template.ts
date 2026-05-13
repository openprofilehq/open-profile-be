import { renderEmailLayout } from './layout.template';

interface ContactEmailData {
  name: string;
  email: string;
  industry?: string;
  message: string;
}

export function renderContactEmail({
  name,
  email,
  industry,
  message,
}: ContactEmailData): string {
  return renderEmailLayout({
    title: 'New Contact Form Submission',
    content: `
      <p><strong>New message from the Open Profile contact form.</strong></p>

      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      ${industry ? `<p><strong>Industry:</strong> ${industry}</p>` : ''}

      <p><strong>Message:</strong></p>
      <p style="white-space: pre-wrap; background: #F3F4F6; padding: 16px; border-radius: 8px; font-size: 14px;">${message}</p>

      <p>— Open Profile Contact Form</p>
    `,
  });
}
