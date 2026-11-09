import type { DataStore } from '../data/store';
import type { EmailResult } from '../email';
import { escapeHtml } from '../email';
import { daysBetween, localDay, type MessageChannel, type MessageStage, type PaymentRecord } from './client-payments';

/**
 * What the client hears about their cheques and transfers, on WhatsApp and by
 * email: a few days before a cheque is deposited, on the day, when one
 * bounces, and when a transfer is confirmed or rejected. Each message goes
 * once per channel (the store's claim); practice companies never send.
 */

export interface ClientPaymentSenders {
  /** From the company's connected WhatsApp number; throws when it cannot send. */
  whatsapp(companyId: string, phone: string, text: string, contactId: string | null): Promise<void>;
  email(to: string, subject: string, html: string): Promise<EmailResult>;
}

/** Messages go out in the day, never at night. */
const SEND_FROM_HOUR = 8;
const SEND_UNTIL_HOUR = 21;
const localHour = (now: Date, timeZone = 'Asia/Muscat') =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now));

const money = (n: number, currency: string | null) => `${n.toFixed(3)} ${currency ?? ''}`.trim();

/** Who to tell: the invoice's contact, else its client record. */
export function recipientOf(store: DataStore, record: PaymentRecord): { name: string; phone: string | null; email: string | null; contactId: string | null } | null {
  const invoice = store.getInvoiceById(record.invoiceId);
  if (!invoice) return null;
  const contact = invoice.contactId ? store.getContactById(invoice.contactId) : undefined;
  const client = invoice.clientId ? store.getClientById(invoice.clientId) : undefined;
  const clean = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);
  return {
    name: contact?.name ?? client?.name ?? '',
    phone: clean(contact?.phone) ?? clean(client?.phone),
    email: clean(contact?.email) ?? clean(client?.email),
    contactId: contact?.id ?? null,
  };
}

interface Lines { ar: string; en: string; subject: string }

export function messageFor(stage: MessageStage, record: PaymentRecord, company: string, invoiceNumber: string, today: string): Lines {
  const amount = money(record.amount, record.currency);
  const n = record.chequeNumber ?? '';
  const date = record.dueDate ?? '';
  switch (stage) {
    case 'before': {
      const days = Math.max(1, daysBetween(today, date));
      return {
        ar: `تذكير من ${company}: سيتم إيداع الشيك رقم ${n} بمبلغ ${amount} بتاريخ ${date} (بعد ${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومين' : 'أيام'}). نرجو التأكد من توفر الرصيد في الحساب.`,
        en: `Reminder from ${company}: cheque no. ${n} for ${amount} will be deposited on ${date} (in ${days} day${days === 1 ? '' : 's'}). Please make sure the funds are in the account.`,
        subject: `Cheque ${n} will be deposited on ${date} | سيتم إيداع الشيك ${n}`,
      };
    }
    case 'due':
      return {
        ar: `${company}: سيتم إيداع الشيك رقم ${n} بمبلغ ${amount} اليوم ${date}. نرجو التأكد من توفر الرصيد.`,
        en: `${company}: cheque no. ${n} for ${amount} is being deposited today, ${date}. Please make sure the funds are in the account.`,
        subject: `Cheque ${n} is deposited today | يتم إيداع الشيك ${n} اليوم`,
      };
    case 'bounced':
      return {
        ar: `${company}: تعذّر صرف الشيك رقم ${n} بمبلغ ${amount} (فاتورة ${invoiceNumber}). نرجو التواصل معنا لترتيب السداد.`,
        en: `${company}: cheque no. ${n} for ${amount} (invoice ${invoiceNumber}) could not be cleared. Please contact us to arrange payment.`,
        subject: `Cheque ${n} was returned | تعذّر صرف الشيك ${n}`,
      };
    case 'confirmed':
      return {
        ar: `${company}: استلمنا تحويلك بمبلغ ${amount} لفاتورة ${invoiceNumber}. شكرًا لك.`,
        en: `${company}: we received your transfer of ${amount} for invoice ${invoiceNumber}. Thank you.`,
        subject: `Transfer received for invoice ${invoiceNumber} | تم استلام تحويلك`,
      };
    case 'rejected':
      return {
        ar: `${company}: لم نتمكن من تأكيد تحويلك بمبلغ ${amount} لفاتورة ${invoiceNumber}. السبب: ${record.reason ?? ''}`,
        en: `${company}: we could not confirm your transfer of ${amount} for invoice ${invoiceNumber}. Reason: ${record.reason ?? ''}`,
        subject: `We could not confirm your transfer | لم نتمكن من تأكيد التحويل`,
      };
  }
}

const emailHtml = (l: Lines) => `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#0f172a;line-height:1.6">
  <p dir="rtl" style="text-align:right">${escapeHtml(l.ar)}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0" />
  <p>${escapeHtml(l.en)}</p>
</div>`;

/** Sends one stage on every channel that has an address. Returns how many went out. */
export async function sendStage(store: DataStore, senders: ClientPaymentSenders, record: PaymentRecord, stage: MessageStage, now = new Date()): Promise<number> {
  if (store.isTrainingCompany(record.companyId)) return 0;
  const to = recipientOf(store, record);
  const invoice = store.getInvoiceById(record.invoiceId);
  if (!to || !invoice) return 0;
  const company = store.getCompanyById(record.companyId);
  const lines = messageFor(stage, record, company?.name ?? '', invoice.invoiceNumber, localDay(now));
  let sent = 0;
  const attempt = async (channel: MessageChannel, address: string | null, run: () => Promise<void>) => {
    if (!store.clientPayments.claim(record.id, stage, channel, now)) return;
    if (!address) { store.clientPayments.settle(record.id, stage, channel, 'skipped', `No ${channel === 'email' ? 'email address' : 'phone number'} on file.`, now); return; }
    try {
      await run();
      store.clientPayments.settle(record.id, stage, channel, 'sent', null, now);
      sent += 1;
    } catch (error) {
      store.clientPayments.settle(record.id, stage, channel, 'failed', (error as Error).message, now);
    }
  };
  await attempt('whatsapp', to.phone, () => senders.whatsapp(record.companyId, to.phone!, `${lines.ar}\n\n${lines.en}`, to.contactId));
  await attempt('email', to.email, async () => {
    const result = await senders.email(to.email!, lines.subject, emailHtml(lines));
    if (!result.sent) throw new Error(result.error ?? 'Email was not sent.');
  });
  return sent;
}

/** Which reminder a cheque is owed today, if any. */
export function reminderStage(record: PaymentRecord, settings: { daysBefore: number; onTheDay: boolean }, today: string): MessageStage | null {
  if (record.method !== 'cheque' || record.status !== 'received' || !record.dueDate) return null;
  const left = daysBetween(today, record.dueDate);
  if (left === 0) return settings.onTheDay ? 'due' : null;
  if (left > 0 && left <= settings.daysBefore) return 'before';
  return null;
}

/** Hourly: the reminders before each cheque is deposited. Returns how many messages went out. */
export async function sweepChequeReminders(store: DataStore, senders: ClientPaymentSenders, now = new Date()): Promise<number> {
  const hour = localHour(now);
  if (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR) return 0;
  const today = localDay(now);
  let sent = 0;
  for (const companyId of store.clientPayments.companiesWithCheques()) {
    const settings = store.clientPayments.settings(companyId);
    if (!settings.remindersEnabled || store.isTrainingCompany(companyId)) continue;
    for (const record of store.clientPayments.listForCompany(companyId, { method: 'cheque', status: ['received'] })) {
      const stage = reminderStage(record, settings, today);
      if (stage) sent += await sendStage(store, senders, record, stage, now);
    }
  }
  return sent;
}
