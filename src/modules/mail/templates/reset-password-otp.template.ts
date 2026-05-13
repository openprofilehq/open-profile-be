import { renderEmailLayout } from './layout.template';

export function renderPasswordResetOtpEmail(otp: string): string {
  return renderEmailLayout({
    title: 'Reset your password',

    content: `
      <p>Hi,</p>

      <p>
        We received a request to reset your password.
        Use the code below to continue.
      </p>

      <div class="otp-box">
        <div
          class="otp"
          style="
            background:#fff7ed;
            border:2px dashed #f97316;
            color:#c2410c;
          "
        >
          ${otp}
        </div>

        <p style="margin-top:12px;color:#6b7280;font-size:13px;">
          This code expires in <strong>5 minutes</strong>.
        </p>
      </div>

      <p>
        If you did not request this reset, please ignore this email.
      </p>

      <p>— The Open Profile Team</p>
    `,
  });
}
