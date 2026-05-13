export function renderPasswordResetOtpEmail(otp: string): string {
  return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your Open Profile password</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .header  { background: #0f172a; padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; letter-spacing: -0.3px; }
    .body    { padding: 40px; color: #374151; }
    .body p  { margin: 0 0 16px; line-height: 1.6; font-size: 15px; }
    .otp-box { margin: 32px 0; text-align: center; }
    .otp     { display: inline-block; background: #fff7ed; border: 2px dashed #f97316; border-radius: 8px;
                padding: 16px 40px; font-size: 40px; font-weight: 700; letter-spacing: 10px;
                color: #c2410c; font-family: 'Courier New', monospace; }
    .expiry  { font-size: 13px; color: #6b7280; margin-top: 12px; }
    .footer  { padding: 24px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb;
                font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Open Profile</h1>
    </div>
    <div class="body">
      <p>Hi,</p>
      <p>We received a request to reset your Open Profile password. Use the code below to proceed.</p>

      <div class="otp-box">
        <div class="otp">${otp}</div>
        <p class="expiry">⏱ This code expires in <strong>5 minutes</strong>.</p>
      </div>

      <p>Enter this code on the password reset screen to continue.</p>
      <p>If you did not request a password reset, you can safely ignore this email. Your password will not be changed.</p>
      <p>— The Open Profile Team</p>
    </div>
    <div class="footer">
      <p>This is an automated message. Please do not reply directly to this email.</p>
      <p>Open Profile</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
