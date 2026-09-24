import { escapeHtml, send, type EmailResult } from '../email';
import type { PortalAudience } from './portal-store';

export interface InviteEmailInput {
  name: string;
  companyName: string;
  audience: PortalAudience;
  link: string;
}

export type PortalInviteSender = (input: InviteEmailInput & { to: string }) => Promise<EmailResult>;

export function renderInviteEmail(input: InviteEmailInput): { subject: string; html: string } {
  const name = escapeHtml(input.name);
  const company = escapeHtml(input.companyName);
  const link = escapeHtml(input.link);
  const portalEn = input.audience === 'client' ? 'client portal' : 'influencer portal';
  const portalAr = input.audience === 'client' ? 'بوابة العملاء' : 'بوابة المؤثرين';
  const button = (label: string) =>
    `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#15171c;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${label}</a></p>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;color:#15171c;line-height:1.5">
      <h2 style="margin:0 0 8px">Hello ${name},</h2>
      <p>${company} has invited you to its ${portalEn}. Set a password to get started.</p>
      ${button('Set your password')}
      <p style="color:#5b6068;font-size:13px">The link works once and expires in 7 days. If you were not expecting this, you can ignore this email.</p>
      <hr style="border:none;border-top:1px solid #e3dfd5;margin:24px 0" />
      <div dir="rtl" style="text-align:right">
        <h2 style="margin:0 0 8px">مرحبًا ${name}،</h2>
        <p>دعتك ${company} إلى ${portalAr}. عيّن كلمة مرور للبدء.</p>
        ${button('عيّن كلمة المرور')}
        <p style="color:#5b6068;font-size:13px">الرابط صالح لاستخدام واحد وينتهي خلال 7 أيام. إن لم تكن تتوقع هذه الرسالة فتجاهلها.</p>
      </div>
    </div>`;

  return { subject: `You are invited to ${input.companyName} | دعوة من ${input.companyName}`, html };
}

export const sendPortalInviteEmail: PortalInviteSender = ({ to, ...input }) => {
  const { subject, html } = renderInviteEmail(input);
  return send(to, subject, html, process.env.PORTAL_FROM_EMAIL || process.env.RESEND_FROM_EMAIL);
};
