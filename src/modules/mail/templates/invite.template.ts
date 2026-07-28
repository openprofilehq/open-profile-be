import { renderEmailLayout } from './layout.template';

export function renderInviteEmail(signupUrl: string): string {
  return renderEmailLayout({
    title: "You've been invited to Open Profile",
    content: `
      <p>Hi there,</p>
      <p>
        You've been invited to join Open Profile — a place to build
        and share your professional profile.
      </p>
      <p>
        Click below to create your account. This invite link is
        single-use and will expire soon, so don't wait too long.
      </p>
      <p style="text-align: center;">
        <a href="${signupUrl}" class="button">Accept Invite</a>
      </p>
      <p>— The Open Profile Team</p>
    `,
  });
}
