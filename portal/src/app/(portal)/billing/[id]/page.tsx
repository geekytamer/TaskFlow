import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyButton } from '@/components/copy-button';
import { StatusBadge } from '@/components/status-badge';
import { PageHeader, SectionTitle, button, list, panel, textLink } from '@/components/ui';
import { getInvoice, invoicePdfHref, receiptHref, type InvoiceDetail } from '@/lib/billing';
import { formatDate, formatMoney } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Lang } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

/** How to pay this invoice: what was printed on it, with copy buttons, and where to send proof. */
function HowToPay({ invoice, lang }: { invoice: InvoiceDetail; lang: Lang }) {
  const payment = invoice.payment ?? { instructions: null, accounts: [] };
  const copy = { label: t(lang, 'pay.copy'), done: t(lang, 'pay.copied') };
  const row = (label: string, value: string | null, copyable = false) => value && (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <dt className="text-xs text-ink-soft">{label}</dt>
        <dd className="font-medium [overflow-wrap:anywhere]"><bdi dir="ltr">{value}</bdi></dd>
      </div>
      {copyable && <CopyButton value={value.replace(/\s+/g, '')} {...copy} />}
    </div>
  );
  return (
    <section aria-labelledby="pay-title" className={`${panel} space-y-4 p-5 sm:p-6`}>
      <div>
        <h2 id="pay-title" className="text-base font-semibold">{t(lang, 'pay.title')}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {t(lang, 'pay.amount')} <bdi className="font-semibold text-ink">{formatMoney(invoice.outstanding, invoice.currency, lang)}</bdi>
        </p>
      </div>
      <dl className="divide-y divide-line">
        {row(t(lang, 'pay.reference'), invoice.number, true)}
        {payment.accounts.map((a, i) => (
          <div key={i} className="py-1">
            {row(t(lang, 'pay.bank'), [a.bankName, a.currency].filter(Boolean).join(' · ') || null)}
            {row(t(lang, 'pay.holder'), a.accountHolder)}
            {row(t(lang, 'pay.iban'), a.iban, true)}
            {row(t(lang, 'pay.account'), a.accountNumber, true)}
            {row(t(lang, 'pay.swift'), a.swift, true)}
          </div>
        ))}
      </dl>
      {payment.instructions && <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed">{payment.instructions}</p>}
      {payment.accounts.length === 0 && !payment.instructions && <p className="text-sm text-ink-soft">{t(lang, 'pay.noDetails')}</p>}
      <p className="border-t border-line pt-4 text-sm text-ink-soft">
        {t(lang, 'pay.proof')} <Link href="/messages" className="font-semibold text-accent underline-offset-4 hover:underline">{t(lang, 'pay.proofLink')}</Link>
      </p>
    </section>
  );
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  requireAudience('client');
  const { id } = await params;
  const lang = await currentLang();
  const invoice = await getInvoice(id);
  if (!invoice) notFound();
  const m = (n: number) => <bdi>{formatMoney(n, invoice.currency, lang)}</bdi>;
  const open = invoice.outstanding > 0 && invoice.status !== 'paid';

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        back={{ href: '/billing', label: t(lang, 'bill.back') }}
        title={<span className="inline-flex flex-wrap items-center gap-3"><bdi dir="ltr">{invoice.number}</bdi><StatusBadge lang={lang} invoice={invoice.status} /></span>}
        subtitle={<>
          {t(lang, 'bill.issued')} <bdi>{formatDate(invoice.issueDate, lang)}</bdi> · {t(lang, 'bill.due')} <bdi>{formatDate(invoice.dueDate, lang)}</bdi>
          {invoice.campaign && <> · <Link href={`/campaigns/${invoice.campaign.id}`} className="underline underline-offset-4"><bdi>{invoice.campaign.name}</bdi></Link></>}
        </>}
        actions={<a href={invoicePdfHref(invoice.id)} download className={button.secondary}>{t(lang, 'bill.download')}</a>}
      />

      <div className={`${panel} flex flex-wrap items-end justify-between gap-4 p-5 sm:p-6`}>
        <div>
          <p className="text-sm text-ink-soft">{t(lang, open ? 'bill.leftToPay' : 'bill.total')}</p>
          <p className={`mt-1 text-[28px] font-semibold leading-none tracking-tight ${invoice.status === 'overdue' ? 'text-danger' : ''}`}>{m(open ? invoice.outstanding : invoice.total)}</p>
        </div>
        {open && <p className="text-sm text-ink-soft">{t(lang, 'bill.ofTotal')} {m(invoice.total)}</p>}
      </div>

      {open && <HowToPay invoice={invoice} lang={lang} />}

      <section aria-labelledby="items-title">
        <SectionTitle id="items-title">{t(lang, 'bill.items')}</SectionTitle>
        <div className={`${panel} px-4 sm:px-5`}>
          {/* Phones: one stacked row per line, so no amount is ever scrolled out of view. */}
          <ul className="divide-y divide-line sm:hidden">
            {invoice.lineItems.map((l, i) => (
              <li key={i} className="py-3 text-sm">
                <p className="font-medium"><bdi>{l.description}</bdi></p>
                <p className="mt-1 flex justify-between gap-4 text-ink-soft">
                  <span><bdi>{l.quantity}</bdi> × {m(l.unitPrice)}</span>
                  <span className="font-medium text-ink">{m(l.amount)}</span>
                </p>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm sm:table">
            <thead className="text-ink-soft">
              <tr className="border-b border-line">
                <th scope="col" className="py-3 pe-4 text-start font-medium">{t(lang, 'bill.description')}</th>
                <th scope="col" className="py-3 pe-4 text-end font-medium">{t(lang, 'bill.qty')}</th>
                <th scope="col" className="py-3 pe-4 text-end font-medium">{t(lang, 'bill.unit')}</th>
                <th scope="col" className="py-3 text-end font-medium">{t(lang, 'bill.amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoice.lineItems.map((l, i) => (
                <tr key={i}>
                  <td dir="auto" className="py-3 pe-4">{l.description}</td>
                  <td className="py-3 pe-4 text-end"><bdi>{l.quantity}</bdi></td>
                  <td className="py-3 pe-4 text-end">{m(l.unitPrice)}</td>
                  <td className="py-3 text-end font-medium">{m(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ms-auto max-w-xs space-y-1.5 border-t border-line py-4 text-sm">
            {invoice.taxRate > 0 && <div className="flex justify-between gap-6"><dt className="text-ink-soft">{t(lang, 'bill.vat')}</dt><dd><bdi>{invoice.taxRate}%</bdi></dd></div>}
            <div className="flex justify-between gap-6 text-base font-semibold"><dt>{t(lang, 'bill.total')}</dt><dd>{m(invoice.total)}</dd></div>
            <div className="flex justify-between gap-6"><dt className="text-ink-soft">{t(lang, 'bill.paid')}</dt><dd>{m(invoice.paid)}</dd></div>
            {invoice.credited > 0 && <div className="flex justify-between gap-6"><dt className="text-ink-soft">{t(lang, 'bill.credited')}</dt><dd>{m(invoice.credited)}</dd></div>}
            <div className="flex justify-between gap-6 border-t border-line pt-1.5 font-semibold"><dt>{t(lang, 'bill.outstanding')}</dt><dd>{m(invoice.outstanding)}</dd></div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="payments-title">
        <SectionTitle id="payments-title">{t(lang, 'bill.payments')}</SectionTitle>
        {invoice.payments.length === 0 ? (
          <p className="text-ink-soft">{t(lang, 'bill.noPayments')}</p>
        ) : (
          <ul className={list}>
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span className="min-w-0">
                  <span className="block font-semibold">{m(p.amount)}</span>
                  <span className="block text-sm text-ink-soft">
                    <bdi>{formatDate(p.paidAt, lang)}</bdi>{p.method && <> · <bdi>{p.method}</bdi></>} · <bdi dir="ltr">{p.receiptNumber}</bdi>
                  </span>
                </span>
                <a href={receiptHref(p.id)} download className={textLink}>{t(lang, 'bill.receipt')}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invoice.creditNotes.length > 0 && (
        <section aria-labelledby="credits-title">
          <SectionTitle id="credits-title">{t(lang, 'bill.creditNotes')}</SectionTitle>
          <ul className={list}>
            {invoice.creditNotes.map((c) => (
              <li key={c.number} className="flex justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <span><bdi dir="ltr">{c.number}</bdi> · <bdi>{formatDate(c.issueDate, lang)}</bdi></span>
                <span className="font-medium">{m(c.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {invoice.notes && (
        <section aria-labelledby="notes-title">
          <SectionTitle id="notes-title">{t(lang, 'bill.notes')}</SectionTitle>
          <p dir="auto" className="whitespace-pre-line leading-relaxed text-ink-soft">{invoice.notes}</p>
        </section>
      )}
    </div>
  );
}
