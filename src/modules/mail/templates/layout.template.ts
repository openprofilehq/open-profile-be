interface EmailLayoutOptions {
  title: string;
  content: string;
}

export function renderEmailLayout({
  title,
  content,
}: EmailLayoutOptions): string {
  return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>

  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    .wrapper {
      max-width: 560px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,.12);
    }

    .header {
      background: #0f172a;
      padding: 32px 40px;
      text-align: center;
    }

    .logo {
      width: 60px;
      height: 60px;
      margin: 0 auto 12px;
      background: #1e293b;
      border-radius: 12px;
      line-height: 60px;
      color: white;
      font-size: 24px;
      font-weight: bold;
    }

    .company-name {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      margin: 0;
    }

    .body {
      padding: 40px;
      color: #374151;
    }

    .body p {
      margin: 0 0 16px;
      line-height: 1.6;
      font-size: 15px;
    }

    .footer {
      padding: 24px 40px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #9ca3af;
      text-align: center;
      line-height: 1.5;
    }

    .button {
      display: inline-block;
      padding: 14px 24px;
      background: #2563eb;
      color: white !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin-top: 20px;
    }

    .otp-box {
      margin: 32px 0;
      text-align: center;
    }

    .otp {
      display: inline-block;
      padding: 16px 40px;
      font-size: 40px;
      font-weight: 700;
      letter-spacing: 10px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
    }
  </style>
</head>

<body>
  <div class="wrapper">

    <div class="header">
      <!-- COMPANY LOGO PLACEHOLDER -->
      <div class="logo">
        OP
      </div>

      <!-- COMPANY NAME PLACEHOLDER -->
      <h1 class="company-name">
        Open Profile
      </h1>
    </div>

    <div class="body">
      ${content}
    </div>

    <div class="footer">
      <p>This is an automated email. Please do not reply.</p>
      <p>© ${new Date().getFullYear()} Open Profile. All rights reserved.</p>
    </div>

  </div>
</body>
</html>
  `.trim();
}
