import { renderEmailLayout } from './layout.template';

export function renderVerificationOtpEmail(
  fullName: string,
  otp: string,
): string {
  const firstName = fullName.split(' ')[0] ?? fullName;

  return renderEmailLayout({
    title: 'Verify your Open Profile account',

    content: `
      <p>Hi ${firstName},</p>

      <p>
        Welcome to Open Profile! Use the verification code below
        to activate your account.
      </p>

      <div class="otp-box">
        <div
          class="otp"
          style="
            background:#f0fdf4;
            border:2px dashed #22c55e;
            color:#15803d;
          "
        >
          ${otp}
        </div>

        <p style="margin-top:12px;color:#6b7280;font-size:13px;">
          This code expires in <strong>5 minutes</strong>.
        </p>
      </div>

      <p>
        If you did not create an account, you can safely ignore this email.
      </p>

      <p>— The Open Profile Team</p>
    `,
  });
}
