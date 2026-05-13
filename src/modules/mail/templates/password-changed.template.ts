import { renderEmailLayout } from './layout.template';

export function renderPasswordChangedEmail(): string {
  return renderEmailLayout({
    title: 'Your password was changed',

    content: `
      <p>Hi,</p>

      <p>
        Your Open Profile password was successfully changed.
      </p>

      <p>
        If you made this change, no further action is required.
      </p>

      <p style="color:#b91c1c;">
        If you did NOT make this change, please reset your password immediately.
      </p>

      <p>
        — The Open Profile Team
      </p>
    `,
  });
}
