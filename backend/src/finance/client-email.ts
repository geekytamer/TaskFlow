import type Database from 'better-sqlite3';
import type { DataStore } from '../data/store';
import type { Invoice } from '../types';
import { send, type EmailResult } from '../email';

/**
 * Email to clients: an invoice sent on request, and (when the company turns
 * it on) reminders for overdue invoices at set days past due, each once.
 * Practice companies never email anyone. Without an email provider the
 * result says so instead of pretending.
 */

export const DEFAULT_REMINDER_DAYS = [1, 7, 14, 30];

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const appUrl = () => process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
const day = (d: Date) => new Date(d).toISOString().slice(0, 10);

export class ClientEmailStore {
  constructor(private readonly db: Database.Database) {}

  settings(companyId: string): { enabled: boolean; days: number[] } {
    const row = this.db.prepare('SELECT * FROM client_reminder_settings WHERE companyId = ?').get(companyId) as { enabled: number; days: string } | undefined;
    return row ? { enabled: row.enabled === 1, days: JSON.parse(row.days) } : { enabled: false, days: DEFAULT_REMINDER_DAYS };
  }

  setSettings(companyId: string, enabled: boolean, days: number[]): void {
    this.db.prepare(
      `INSERT INTO client_reminder_settings (companyId, enabled, days) VALUES (?, ?, ?)
       ON CONFLICT (companyId) DO UPDATE SET enabled = excluded.enabled, days = excluded.days`,
    ).run(companyId, enabled ? 1 : 0, JSON.stringify(days));
  }

  enabledCompanies(): string[] {
    return (this.db.prepare('SELECT companyId FROM client_reminder_settings WHERE enabled = 1').all() as Array<{ companyId: string }>).map((r) => r.companyId);
  }

  /** Claims a reminder stage for an invoice; false if it was already sent (or claimed). */
  claim(invoiceId: string, stage: number): boolean {
    return this.db.prepare('INSERT OR IGNORE INTO client_reminders (invoiceId, stage, sentAt) VALUES (?, ?, ?)').run(invoiceId, stage, new Date().toISOString()).changes === 1;
  }

  release(invoiceId: string, stage: number): void {
    this.db.prepare('DELETE FROM client_reminders WHERE invoiceId = ? AND stage = ?').run(invoiceId, stage);
  }

  sent(invoiceId: string): Array<{ stage: number; sentAt: string }> {
    return this.db.prepare('SELECT stage, sentAt FROM client_reminders WHERE invoiceId = ? ORDER BY stage').all(invoiceId) as Array<{ stage: number; sentAt: string }>;
  }
}

function invoiceHtml(store: DataStore, invoice: Invoice, intro: string, message?: string) {
  const company = store.getCompanyById(invoice.companyId);
  const outstanding = invoice.outstandingAmount ?? invoice.total;
  const money = (n: number) => `${invoice.currency || ''} ${n.toFixed(3)}`.trim();
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#0f172a">
  <p>${esc(intro)}</p>
  ${message ? `<p style="white-space:pre-line">${esc(message)}</p>` : ''}
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Invoice</td><td><strong>${esc(invoice.invoiceNumber)}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Amount due</td><td><strong>${esc(money(outstanding))}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Due date</td><td>${esc(day(invoice.dueDate))}</td></tr>
  </table>
  <p><a href="${esc(`${appUrl()}/invoice/${invoice.id}`)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View the invoice</a></p>
  <p style="color:#64748b;font-size:13px">${esc(company?.legalName || company?.name || '')}</p>
</div>`;
}

export async function emailInvoice(store: DataStore, invoice: Invoice, input: { to: string; message?: string }): Promise<EmailResult & { refused?: true }> {
  if (store.isTrainingCompany(invoice.companyId)) return { sent: false, refused: true, error: 'A practice company never sends email.' };
  if (invoice.status === 'Draft') return { sent: false, refused: true, error: 'Send the invoice first; a draft is not emailed.' };
  const company = store.getCompanyById(invoice.companyId);
  const subject = `Invoice ${invoice.invoiceNumber} from ${company?.name ?? ''}`.trim();
  return send(input.to, subject, invoiceHtml(store, invoice, `Please find invoice ${invoice.invoiceNumber} below.`, input.message));
}

/**
 * Overdue reminders for companies that turned them on. For each unpaid
 * invoice past due, the latest stage it has reached is sent once; earlier
 * stages it skipped (the setting was off then) are not sent late. A failed
 * send releases the stage so the next sweep retries.
 */
export async function sweepClientReminders(store: DataStore, now: Date = new Date()): Promise<number> {
  let sent = 0;
  const today = Date.parse(day(now));
  for (const companyId of store.clientEmail.enabledCompanies()) {
    if (store.isTrainingCompany(companyId)) continue;
    const { days } = store.clientEmail.settings(companyId);
    const company = store.getCompanyById(companyId);
    for (const invoice of store.listInvoices(companyId)) {
      if (invoice.status === 'Draft' || invoice.status === 'Paid') continue;
      if (!((invoice.outstandingAmount ?? invoice.total) > 0.0005)) continue;
      const overdue = Math.floor((today - Date.parse(day(invoice.dueDate))) / 86400_000);
      const stage = [...days].sort((a, b) => b - a).find((d) => overdue >= d);
      if (stage === undefined) continue;
      const already = store.clientEmail.sent(invoice.id).map((s) => s.stage);
      if (already.some((s) => s >= stage)) continue;
      const client = store.getClientById(invoice.clientId);
      if (!client?.email) continue;
      if (!store.clientEmail.claim(invoice.id, stage)) continue;
      const result = await send(client.email, `Reminder: invoice ${invoice.invoiceNumber} is ${overdue} day${overdue === 1 ? '' : 's'} overdue`,
        invoiceHtml(store, invoice, `This is a reminder that invoice ${invoice.invoiceNumber} from ${company?.name ?? 'us'} was due on ${day(invoice.dueDate)} and is still unpaid.`));
      if (result.sent) sent += 1;
      else store.clientEmail.release(invoice.id, stage);
    }
  }
  return sent;
}
