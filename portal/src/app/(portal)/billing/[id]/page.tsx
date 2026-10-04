import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';
import { getInvoice, invoicePdfHref, receiptHref } from '@/lib/billing';
import { formatDate, formatMoney } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { backLink } from '@/components/field';

const button = 'inline-flex h-11 items-center rounded-[10px] border border-field bg-surface px-4 text-sm font-semibold transition-colors hover:border-ink/60';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  requireAudience('client');
  const { id } = await params;
  const lang = await currentLang();
  const invoice = await getInvoice(id);
  if (!invoice) notFound();
  const m = (n: number) => <bdi>{formatMoney(n, invoice.currency, lang)}</bdi>;

  return (
    <div className="max-w-4xl space-y-10">
      <Link href="/billing" className={backLink}>{t(lang, 'bill.back')}</Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl"><bdi dir="ltr">{invoice.number}</bdi></h1>
            <StatusBadge lang={lang} invoice={invoice.status} />
          </div>
          <p className="text-sm text-ink-soft">
            {t(lang, 'bill.issued')} <bdi>{formatDate(invoice.issueDate, lang)}</bdi> · {t(lang, 'bill.due')} <bdi>{formatDate(invoice.dueDate, lang)}</bdi>
            {invoice.campaign && <> · <Link href={`/campaigns/${invoice.campaign.id}`} className="underline underline-offset-4"><bdi dir="auto">{invoice.campaign.name}</bdi></Link></>}
          </p>
        </div>
        <a href={invoicePdfHref(invoice.id)} download className={button}>{t(lang, 'bill.download')}</a>
      </header>

      <section aria-labelledby="items-title">
        <h2 id="items-title" className="mb-3 text-base font-semibold">{t(lang, 'bill.items')}</h2>
        {/* Phones: one stacked row per line, so no amount is ever scrolled out of view. */}
        <ul className="divide-y divide-line border-y border-line sm:hidden">
          {invoice.lineItems.map((l, i) => (
            <li key={i} className="py-3 text-sm">
              <p dir="auto" className="font-medium">{l.description}</p>
              <p className="mt-1 flex justify-between gap-4 text-ink-soft">
                <span><bdi>{l.quantity}</bdi> × {m(l.unitPrice)}</span>
                <span className="font-medium text-ink">{m(l.amount)}</span>
              </p>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block">
          <table className="w-full text-sm">
            <thead className="text-ink-soft">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pe-4 text-start font-medium">{t(lang, 'bill.description')}</th>
                <th scope="col" className="py-2 pe-4 text-end font-medium">{t(lang, 'bill.qty')}</th>
                <th scope="col" className="py-2 pe-4 text-end font-medium">{t(lang, 'bill.unit')}</th>
                <th scope="col" className="py-2 text-end font-medium">{t(lang, 'bill.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((l, i) => (
                <tr key={i} className="border-b border-line">
                  <td dir="auto" className="py-3 pe-4">{l.description}</td>
                  <td className="py-3 pe-4 text-end"><bdi>{l.quantity}</bdi></td>
                  <td className="py-3 pe-4 text-end">{m(l.unitPrice)}</td>
                  <td className="py-3 text-end font-medium">{m(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ms-auto mt-4 max-w-xs space-y-1 text-sm">
          {invoice.taxRate > 0 && (
            <div className="flex justify-between gap-6"><dt className="text-ink-soft">{t(lang, 'bill.vat')}</dt><dd><bdi>{invoice.taxRate}%</bdi></dd></div>
          )}
          <div className="flex justify-between gap-6 text-base font-semibold"><dt>{t(lang, 'bill.total')}</dt><dd>{m(invoice.total)}</dd></div>
          <div className="flex justify-between gap-6"><dt className="text-ink-soft">{t(lang, 'bill.paid')}</dt><dd>{m(invoice.paid)}</dd></div>
          {invoice.credited > 0 && <div className="flex justify-between gap-6"><dt className="text-ink-soft">{t(lang, 'bill.credited')}</dt><dd>{m(invoice.credited)}</dd></div>}
          <div className="flex justify-between gap-6 border-t border-line pt-1 font-semibold"><dt>{t(lang, 'bill.outstanding')}</dt><dd>{m(invoice.outstanding)}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="payments-title">
        <h2 id="payments-title" className="mb-3 text-base font-semibold">{t(lang, 'bill.payments')}</h2>
        {invoice.payments.length === 0 ? (
          <p className="text-ink-soft">{t(lang, 'bill.noPayments')}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 sm:px-3">
                <span className="min-w-0">
                  <span className="block font-semibold">{m(p.amount)}</span>
                  <span className="block text-sm text-ink-soft">
                    <bdi>{formatDate(p.paidAt, lang)}</bdi>{p.method && <> · <bdi dir="auto">{p.method}</bdi></>} · <bdi dir="ltr">{p.receiptNumber}</bdi>
                  </span>
                </span>
                <a href={receiptHref(p.id)} download className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{t(lang, 'bill.receipt')}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invoice.creditNotes.length > 0 && (
        <section aria-labelledby="credits-title">
          <h2 id="credits-title" className="mb-3 text-base font-semibold">{t(lang, 'bill.creditNotes')}</h2>
          <ul className="divide-y divide-line border-y border-line">
            {invoice.creditNotes.map((c) => (
              <li key={c.number} className="flex justify-between gap-3 px-1 py-3 text-sm sm:px-3">
                <span><bdi dir="ltr">{c.number}</bdi> · <bdi>{formatDate(c.issueDate, lang)}</bdi></span>
                <span className="font-medium">{m(c.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {invoice.notes && (
        <section aria-labelledby="notes-title">
          <h2 id="notes-title" className="mb-1 text-base font-semibold">{t(lang, 'bill.notes')}</h2>
          <p dir="auto" className="whitespace-pre-line leading-relaxed text-ink-soft">{invoice.notes}</p>
        </section>
      )}
    </div>
  );
}
