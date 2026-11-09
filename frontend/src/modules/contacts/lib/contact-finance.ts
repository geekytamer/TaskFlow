/** Contact page helpers: quick-action links, debt aging, statement of account. Pure, no React. */

/**
 * Digits for a WhatsApp link. An 8-digit Omani number gets the 968 country
 * code; a leading 00 or + is dropped. Null when there is nothing to dial.
 */
export function whatsappDigits(phone?: string | null): string | null {
  let digits = (phone ?? '').replace(/[^0-9+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  digits = digits.replace(/\D/g, '');
  if (digits.length === 8) digits = `968${digits}`;
  return digits.length >= 8 ? digits : null;
}

export interface QuickLinks {
  call: string | null;
  whatsapp: string | null;
  email: string | null;
}

export function quickLinks(contact: { phone?: string | null; email?: string | null }): QuickLinks {
  const phone = (contact.phone ?? '').trim();
  const wa = whatsappDigits(phone);
  const email = (contact.email ?? '').trim();
  return {
    call: phone ? `tel:${phone.replace(/\s+/g, '')}` : null,
    whatsapp: wa ? `https://wa.me/${wa}` : null,
    email: email ? `mailto:${email}` : null,
  };
}

export interface AgingInvoice {
  dueDate?: string | Date | null;
  outstandingAmount?: number | null;
  exchangeRate?: number | null;
  status?: string;
}

export interface Aging {
  /** Not yet due. */
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
  overdue: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** What a client still owes us, by how long it is overdue, in the company currency. */
export function agingOf(invoices: AgingInvoice[], today: Date = new Date()): Aging {
  const aging: Aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0, overdue: 0 };
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  for (const inv of invoices) {
    if (inv.status === 'Draft' || inv.status === 'Cancelled' || inv.status === 'Void') continue;
    const owed = (Number(inv.outstandingAmount) || 0) * (Number(inv.exchangeRate) || 1);
    if (owed <= 0) continue;
    aging.total += owed;
    const due = inv.dueDate ? new Date(inv.dueDate) : null;
    const days = due ? Math.floor((start - new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()) / DAY) : 0;
    if (days <= 0) aging.current += owed;
    else if (days <= 30) aging.d1_30 += owed;
    else if (days <= 60) aging.d31_60 += owed;
    else if (days <= 90) aging.d61_90 += owed;
    else aging.d90plus += owed;
    if (days > 0) aging.overdue += owed;
  }
  return aging;
}

export interface StatementInvoice {
  id: string;
  invoiceNumber: string;
  issueDate?: string | Date | null;
  total?: number | null;
  exchangeRate?: number | null;
  status?: string;
}

export interface StatementPayment {
  id: string;
  invoiceNumber: string;
  amount: number;
  paidAt: string | Date;
  method?: string | null;
  exchangeRate?: number | null;
}

export interface StatementLine {
  id: string;
  date: Date;
  kind: 'invoice' | 'payment';
  reference: string;
  method?: string | null;
  /** What they owe us more (an invoice) or less (a payment), company currency. */
  debit: number;
  credit: number;
  /** What they owe after this line. */
  balance: number;
}

/** Invoices and payments in date order with a running balance (what the client owes), oldest first. */
export function statementOf(invoices: StatementInvoice[], payments: StatementPayment[]): StatementLine[] {
  const lines: Omit<StatementLine, 'balance'>[] = [];
  for (const inv of invoices) {
    if (inv.status === 'Draft' || inv.status === 'Cancelled' || inv.status === 'Void' || !inv.issueDate) continue;
    lines.push({
      id: `inv-${inv.id}`, date: new Date(inv.issueDate), kind: 'invoice', reference: inv.invoiceNumber,
      debit: (Number(inv.total) || 0) * (Number(inv.exchangeRate) || 1), credit: 0,
    });
  }
  for (const p of payments) {
    lines.push({
      id: `pay-${p.id}`, date: new Date(p.paidAt), kind: 'payment', reference: p.invoiceNumber, method: p.method ?? null,
      debit: 0, credit: (Number(p.amount) || 0) * (Number(p.exchangeRate) || 1),
    });
  }
  // Same day: the invoice before the payment against it.
  lines.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === b.kind ? 0 : a.kind === 'invoice' ? -1 : 1));
  let balance = 0;
  return lines.map((line) => {
    balance += line.debit - line.credit;
    return { ...line, balance: Math.round(balance * 1000) / 1000 };
  });
}

/**
 * 05/11/2026: day/month/year with Western digits and no direction marks, so it
 * reads the same inside right-to-left Arabic text and tables.
 */
export function dayText(at: string | Date | null | undefined): string | null {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "3 days ago" / "منذ 3 أيام", short and in the reader's language. */
export function sinceText(at: string | Date | null | undefined, language: string, now: Date = new Date()): string | null {
  if (!at) return null;
  const days = Math.floor((now.getTime() - new Date(at).getTime()) / DAY);
  const ar = language === 'ar';
  if (days <= 0) return ar ? 'اليوم' : 'today';
  if (days === 1) return ar ? 'أمس' : 'yesterday';
  if (days < 30) return ar ? `منذ ${days} يوم` : `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return ar ? `منذ ${months} شهر` : `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(days / 365);
  return ar ? `منذ ${years} سنة` : `${years} year${years > 1 ? 's' : ''} ago`;
}
