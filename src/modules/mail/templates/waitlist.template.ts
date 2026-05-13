import { renderEmailLayout } from './layout.template';

export function renderWaitlistEmail(): string {
  return renderEmailLayout({
    title: 'You joined the waitlist',

    content: `
      <p>Hi there,</p>

      <p>
        Thank you for joining the Open Profile waitlist.
      </p>

      <p>
        We're excited to have you onboard and we'll notify you
        once we launch.
      </p>

      <p>Stay tuned 🚀</p>

      <p>— The Open Profile Team</p>
    `,
  });
}
