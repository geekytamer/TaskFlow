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

// ── Notification emails ──────────────────────────────────────────────────────

const linkHref = (link?: string) =>
  link ? `${appUrl.replace(/\/$/, '')}${link.startsWith('/') ? '' : '/'}${link}` : appUrl;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );

type EmailResult = { sent: boolean; error?: string };

async function send(to: string, subject: string, html: string): Promise<EmailResult> {
  if (!resendApiKey) {
    return { sent: false, error: 'RESEND_API_KEY not set; skipping email.' };
  }
  try {
    const resend = new Resend(resendApiKey);
    const result = await resend.emails.send({ from: fromEmail, to, subject, html });
    if ((result as any)?.error) {
      const message = (result as any).error?.message || 'Unknown error sending email.';
      console.error('Resend error:', message);
      return { sent: false, error: message };
    }
    return { sent: true };
  } catch (error: any) {
    const message = error?.message || 'Failed to send email.';
    console.error(message);
    return { sent: false, error: message };
  }
}

/** Immediate email for a single critical notification. */
export async function sendNotificationEmail(input: {
  to: string;
  name: string;
  title: string;
  body?: string;
  link?: string;
}): Promise<EmailResult> {
  const href = linkHref(input.link);
  const html = `
    <h2 style="margin:0 0 8px">${escapeHtml(input.title)}</h2>
    ${input.body ? `<p style="color:#475569">${escapeHtml(input.body)}</p>` : ''}
    <p><a href="${href}" style="display:inline-block;margin-top:8px;padding:8px 14px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none">Open in TaskFlow</a></p>
  `;
  return send(input.to, input.title, html);
}

/** Daily digest email rolling up a user's normal-priority notifications. */
export async function sendNotificationDigestEmail(input: {
  to: string;
  name: string;
  items: Array<{ title: string; body?: string; link?: string }>;
}): Promise<EmailResult> {
  if (input.items.length === 0) return { sent: false, error: 'No items to send.' };
  const rows = input.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb">
          <a href="${linkHref(item.link)}" style="color:#0f172a;font-weight:600;text-decoration:none">${escapeHtml(item.title)}</a>
          ${item.body ? `<div style="color:#64748b;font-size:13px;margin-top:2px">${escapeHtml(item.body)}</div>` : ''}
        </td>
      </tr>`,
    )
    .join('');
  const html = `
    <h2 style="margin:0 0 4px">Your TaskFlow summary</h2>
    <p style="color:#64748b;margin:0 0 12px">${input.items.length} update${input.items.length === 1 ? '' : 's'} since yesterday.</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
  `;
  return send(input.to, `TaskFlow: ${input.items.length} new update${input.items.length === 1 ? '' : 's'}`, html);
}
