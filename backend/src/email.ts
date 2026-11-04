import { Resend } from 'resend';
import { createEmailQueue, isRateLimitError, type EmailAttempt, type EmailQueueOptions } from './email-queue';

const resendApiKey = process.env.RESEND_API_KEY;
const appUrl =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:9002";
const fromEmail =
  process.env.RESEND_FROM_EMAIL || 'Al Yarubi Group <no-reply@alyarubi-group.com>';


// ── Notification emails ──────────────────────────────────────────────────────

const linkHref = (link?: string) =>
  link ? `${appUrl.replace(/\/$/, '')}${link.startsWith('/') ? '' : '/'}${link}` : appUrl;

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );

export type EmailResult = { sent: boolean; error?: string; rateLimited?: boolean };

// Every email leaves through one queue that keeps under Resend's 10 requests a second.
const defaultQueueOptions = (): EmailQueueOptions => ({
  perSecond: Number(process.env.RESEND_MAX_PER_SECOND) || 8,
  maxRetries: 4,
  baseDelayMs: 500,
  maxDelayMs: 8000,
});
let queue = createEmailQueue(defaultQueueOptions());
/** Tests tune the limit and backoff; null restores the defaults. */
export function configureEmailQueue(options: Partial<EmailQueueOptions> | null): void {
  queue = createEmailQueue({ ...defaultQueueOptions(), ...(options ?? {}) });
}

/** One Resend call, its error reported with whether a 429 retry may help. */
async function resendSend(message: { from: string; to: string; subject: string; html: string }): Promise<EmailAttempt> {
  const result = await new Resend(resendApiKey).emails.send(message);
  const error = (result as any)?.error;
  if (error) {
    return { sent: false, error: error.message || 'Unknown error sending email.', rateLimited: isRateLimitError(error) };
  }
  return { sent: true };
}

const strip = ({ sent, error }: EmailAttempt): EmailResult => (error === undefined ? { sent } : { sent, error });

/** Replaces how mail leaves (tests capture it; null restores Resend). */
type Transport = (message: { from: string; to: string; subject: string; html: string }) => Promise<EmailResult>;
let transport: Transport | null = null;
export function setEmailTransport(next: Transport | null): void {
  transport = next;
}

export async function send(to: string, subject: string, html: string, from: string = fromEmail): Promise<EmailResult> {
  const deliver = transport;
  if (!deliver && !resendApiKey) {
    return { sent: false, error: 'RESEND_API_KEY not set; skipping email.' };
  }
  const result = await queue.run(() => (deliver ? deliver({ from, to, subject, html }) : resendSend({ from, to, subject, html })));
  if (!result.sent && !deliver) console.error('Resend error:', result.error);
  return strip(result);
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
    <p><a href="${href}" style="display:inline-block;margin-top:8px;padding:8px 14px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none">Open in Al Yarubi Group</a></p>
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
    <h2 style="margin:0 0 4px">Your Al Yarubi Group summary</h2>
    <p style="color:#64748b;margin:0 0 12px">${input.items.length} update${input.items.length === 1 ? '' : 's'} since yesterday.</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
  `;
  return send(input.to, `Al Yarubi Group: ${input.items.length} new update${input.items.length === 1 ? '' : 's'}`, html);
}

export interface PasswordEmailInput {
  to: string;
  name: string;
  link: string;
  purpose: 'invite' | 'reset';
}
export type PasswordEmailSender = (input: PasswordEmailInput) => Promise<{ sent: boolean; error?: string }>;

/**
 * The link to set a password: a new account's invitation (valid 72 hours) or a
 * reset (valid 1 hour). Arabic and English together, since the reader's
 * language is not known yet.
 */
export const sendPasswordEmail: PasswordEmailSender = async ({ to, name, link, purpose }) => {
  if (!resendApiKey) {
    const msg = 'RESEND_API_KEY not set; skipping password email.';
    console.warn(msg);
    return { sent: false, error: msg };
  }
  const who = escapeHtml(name);
  const href = escapeHtml(link);
  const invite = purpose === 'invite';
  const button = (label: string) =>
    `<p><a href="${href}" style="display:inline-block;padding:10px 18px;background:#94701a;color:#fff;border-radius:6px;text-decoration:none">${label}</a></p>`;
  const html = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif">
      <h2>${invite ? `مرحباً ${who}، تم إنشاء حسابك في مجموعة اليعربي` : `مرحباً ${who}`}</h2>
      <p>${invite ? 'اضغط الزر لتعيين كلمة المرور الخاصة بك. الرابط صالح لمدة 72 ساعة.' : 'وصلنا طلب لإعادة تعيين كلمة المرور. اضغط الزر لتعيين كلمة مرور جديدة. الرابط صالح لمدة ساعة واحدة.'}</p>
      ${button(invite ? 'تعيين كلمة المرور' : 'إعادة تعيين كلمة المرور')}
      ${invite ? '' : '<p style="color:#666">إذا لم تطلب ذلك فتجاهل هذه الرسالة، وكلمة مرورك الحالية تبقى كما هي.</p>'}
    </div>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0" />
    <div dir="ltr" style="font-family:Arial,sans-serif">
      <h2>${invite ? `Welcome to Al Yarubi Group, ${who}` : `Hello ${who}`}</h2>
      <p>${invite ? 'Your account is ready. Set your own password with the button below. The link works for 72 hours.' : 'We received a request to reset your password. Set a new one with the button below. The link works for 1 hour.'}</p>
      ${button(invite ? 'Set your password' : 'Reset your password')}
      ${invite ? '' : "<p style=\"color:#666\">If you did not ask for this, ignore this email; your password stays as it is.</p>"}
      <p style="color:#666;font-size:12px">${href}</p>
    </div>`;
  const result = await queue.run(() => resendSend({
    from: fromEmail,
    to,
    subject: invite ? 'تعيين كلمة المرور | Set your password' : 'إعادة تعيين كلمة المرور | Reset your password',
    html,
  }));
  if (!result.sent) console.error('Resend error (password email):', result.error);
  return strip(result);
};

/** An absolute link into the web app (APP_URL). */
export const appLink = (path: string) => `${appUrl.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
