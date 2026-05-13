import { renderEmailLayout } from './layout.template';

export function renderContactConfirmationEmail(name: string): string {
  return renderEmailLayout({
    title: 'We received your message',
    content: `
      <p>Hi ${name},</p>

      <p>
        Thanks for reaching out to Open Profile! We've received your message
        and will get back to you as soon as possible.
      </p>

      <p>
        In the meantime, feel free to explore our platform or follow us on
        social media for the latest updates.
      </p>

      <p>— The Open Profile Team</p>
    `,
  });
}
