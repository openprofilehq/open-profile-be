import { renderEmailLayout } from './layout.template';

export function renderAccountLockedEmail(lockedUntil: string): string {
  return renderEmailLayout({
    title: 'Account temporarily locked',

    content: `
      <p>Hi,</p>

      <p>
        Your account has been temporarily locked due to multiple failed login attempts.
      </p>

      <p>
        It will automatically unlock at:
      </p>

      <p style="font-weight: 700;">
        ${lockedUntil}
      </p>

      <p>
        If this wasn’t you, we strongly recommend resetting your password.
      </p>

      <p>
        — The Open Profile Team
      </p>
    `,
  });
}
