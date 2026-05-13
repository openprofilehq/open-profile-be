export const resetPasswordEmailTemplate = (data: { resetUrl: string }) => {
  return `
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 600px;
                margin: 50px auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            h1 {
                color: #333333;
            }
            p {
                color: #555555;
                line-height: 1.5;
            }
            a.button {
                display: inline-block;
                padding: 10px 20px;
                margin-top: 20px;
                background-color: #007BFF;
                color: #ffffff;
                text-decoration: none;
                border-radius: 4px;
            }
            a.button:hover {
                background-color: #0056b3;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Password Reset Request</h1>
            <p>You requested a password reset. Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
            <a href="${data.resetUrl}" class="button">Reset Password</a>
            <p>If you did not request this, you can safely ignore this email.</p>
        </div>
    </body>
</html>
`;
};
