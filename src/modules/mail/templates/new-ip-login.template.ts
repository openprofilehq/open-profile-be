import { renderEmailLayout } from './layout.template';

export function renderNewIpLoginEmail(ip: string, timestamp: string): string {
  return renderEmailLayout({
    title: 'New login detected',

    content: `
      <p>Hi,</p>

      <p>
        We detected a new login to your Open Profile account.
      </p>

      <p>
        <strong>IP Address:</strong> ${ip}
      </p>

      <p>
        <strong>Time:</strong> ${timestamp}
      </p>

      <p style="color:#b91c1c;">
        If this was NOT you, secure your account immediately by resetting your password.
      </p>

      <p>
        — The Open Profile Team
      </p>
    `,
  });
}
