import nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  } else {
    // Fallback to test account for development
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  return transporter;
}

function buildVerificationEmailHTML(email: string, verifyLink: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #f9fafb; padding: 40px 20px; border-radius: 0 0 8px 8px; }
          .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .cta-button:hover { background: #5568d3; }
          .footer { font-size: 12px; color: #888; margin-top: 20px; text-align: center; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px 15px; margin-top: 15px; font-size: 13px; color: #856404; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✨ Verify Your Email</h1>
          </div>
          <div class="content">
            <p>Hi <strong>${email}</strong>,</p>
            <p>Thank you for registering with <strong>LevelNLearn</strong>! To complete your registration and start creating amazing quizzes, please verify your email address.</p>
            <div style="text-align: center;">
              <a href="${verifyLink}" class="cta-button">Verify Email Address</a>
            </div>
            <p>Or copy this link into your browser:</p>
            <p style="word-break: break-all; background: white; padding: 10px; border-radius: 4px; font-size: 12px; color: #667eea;"><code>${verifyLink}</code></p>
            <div class="warning">
              ⏰ This verification link expires in <strong>24 hours</strong>. If you didn't create this account, please ignore this email.
            </div>
            <p style="margin-top: 30px; font-size: 13px; color: #666;">
              Need help? Contact us at support@levelnlearn.edu
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2026 LevelNLearn. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function buildPasswordResetEmailHTML(email: string, resetLink: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #f9fafb; padding: 40px 20px; border-radius: 0 0 8px 8px; }
          .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .cta-button:hover { background: #5568d3; }
          .footer { font-size: 12px; color: #888; margin-top: 20px; text-align: center; }
          .warning { background: #f8d7da; border-left: 4px solid #f5c6cb; padding: 10px 15px; margin-top: 15px; font-size: 13px; color: #721c24; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Reset Your Password</h1>
          </div>
          <div class="content">
            <p>Hi <strong>${email}</strong>,</p>
            <p>We received a request to reset the password for your LevelNLearn account. Click the button below to create a new password.</p>
            <div style="text-align: center;">
              <a href="${resetLink}" class="cta-button">Reset Password</a>
            </div>
            <p>Or copy this link into your browser:</p>
            <p style="word-break: break-all; background: white; padding: 10px; border-radius: 4px; font-size: 12px; color: #667eea;"><code>${resetLink}</code></p>
            <div class="warning">
              ⏰ This link expires in <strong>1 hour</strong>. If you didn't request this password reset, you can ignore this email and your password will remain unchanged.
            </div>
            <p style="margin-top: 30px; font-size: 13px; color: #666;">
              Need help? Contact us at support@levelnlearn.edu
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2026 LevelNLearn. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const transporter = await getTransporter();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const verifyLink = `${frontendUrl}/verify-email?token=${token}`;

  const info = await transporter.sendMail({
    from: `LevelNLearn <${process.env.SMTP_USER || 'no-reply@levelnlearn.local'}>`,
    to: email,
    subject: 'Verify your LevelNLearn account',
    text: `Verify your email at: ${verifyLink}`,
    html: buildVerificationEmailHTML(email, verifyLink),
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[Email Verification] Preview URL for ${email}: ${previewUrl}`);
  }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const transporter = await getTransporter();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  const info = await transporter.sendMail({
    from: `LevelNLearn <${process.env.SMTP_USER || 'no-reply@levelnlearn.local'}>`,
    to: email,
    subject: 'Reset your LevelNLearn password',
    text: `Reset your password at: ${resetLink}`,
    html: buildPasswordResetEmailHTML(email, resetLink),
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[Password Reset] Preview URL for ${email}: ${previewUrl}`);
  }
}
