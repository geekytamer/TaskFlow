import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const appUrl =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:9002";
const fromEmail =
  process.env.RESEND_FROM_EMAIL || 'TaskFlow <no-reply@alyarubi-group.com>';

interface WelcomeEmailInput {
  to: string;
  name: string;
  password: string;
}

export async function sendWelcomeEmail({
  to,
  name,
  password,
}: WelcomeEmailInput): Promise<{ sent: boolean; error?: string }> {
  if (!resendApiKey) {
    const msg = 'RESEND_API_KEY not set; skipping welcome email.';
    console.warn(msg);
    return { sent: false, error: msg };
  }

  const resend = new Resend(resendApiKey);
  const loginLink = `${appUrl.replace(/\/$/, '')}/login`;

  const html = `
    <h1>Welcome to TaskFlow, ${name}!</h1>
    <p>Your account has been created.</p>
    <p><strong>Login:</strong> <a href="${loginLink}">${loginLink}</a></p>
    <p><strong>Email:</strong> ${to}</p>
    <p><strong>Temporary password:</strong> ${password}</p>
    <p>Please sign in and change your password.</p>
  `;

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject: 'Your TaskFlow account is ready',
      html,
    });

    if ((result as any)?.error) {
      const message =
        (result as any).error?.message || 'Unknown error sending welcome email.';
      console.error('Resend error:', message);
      return { sent: false, error: message };
    }

    return { sent: true };
  } catch (error: any) {
    const message = error?.message || 'Failed to send welcome email.';
    console.error(message);
    return { sent: false, error: message };
  }
}
