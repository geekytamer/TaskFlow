import Link from 'next/link';
import { InvoiceList } from '@/components/invoice-list';
import { EmptyState, Figure, PageHeader, panel } from '@/components/ui';
import { getInvoices } from '@/lib/billing';
import { formatMoney } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { sumByCurrency } from '@/lib/money';
import { currentLang } from '@/lib/session';

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('client');
  const lang = await currentLang();
  const invoices = await getInvoices();
  const unpaid = invoices.filter((i) => i.status !== 'paid' && i.outstanding > 0);
  // Unpaid first by default: that is what a finance person comes here for.
  const show = (await searchParams).show === 'all' || unpaid.length === 0 ? 'all' : 'unpaid';
  const shown = show === 'all' ? invoices : unpaid;
  const owed = sumByCurrency(unpaid.map((i) => ({ currency: i.currency, amount: i.outstanding })));
  const late = sumByCurrency(unpaid.filter((i) => i.status === 'overdue').map((i) => ({ currency: i.currency, amount: i.outstanding })));
  const tab = (active: boolean) => `inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold ${active ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(16_20_24/0.08)]' : 'text-ink-soft hover:text-ink'}`;

  return (
    <div className="space-y-8">
      <PageHeader title={t(lang, 'bill.title')} subtitle={t(lang, 'bill.subtitle')} />

      {invoices.length === 0 ? (
        <EmptyState title={t(lang, 'bill.emptyTitle')} body={t(lang, 'bill.emptyBody')} />
      ) : (
        <>
          <dl className={`${panel} grid gap-6 p-5 sm:grid-cols-2 sm:p-6`}>
            <Figure size="lg" label={t(lang, 'bill.outstanding')}
              value={owed.length ? owed.map((b) => <bdi key={b.currency} className="block">{formatMoney(b.amount, b.currency, lang)}</bdi>) : <bdi>{t(lang, 'home.nothingOwed')}</bdi>} />
            <Figure size="lg" label={t(lang, 'bill.overdueLabel')} tone={late.length ? 'danger' : 'ink'}
              value={late.length ? late.map((b) => <bdi key={b.currency} className="block">{formatMoney(b.amount, b.currency, lang)}</bdi>) : <bdi>{t(lang, 'bill.noneOverdue')}</bdi>} />
          </dl>

          <section aria-labelledby="invoices-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="invoices-title" className="text-base font-semibold">{t(lang, 'bill.invoices')}</h2>
              <nav aria-label={t(lang, 'bill.invoices')} className="flex gap-1 rounded-control bg-ink/[0.05] p-1">
                <Link href="/billing?show=unpaid" aria-current={show === 'unpaid' ? 'page' : undefined} className={tab(show === 'unpaid')}>
                  {t(lang, 'bill.unpaid')} <bdi className="ms-2 inline-block opacity-70">{unpaid.length}</bdi>
                </Link>
                <Link href="/billing?show=all" aria-current={show === 'all' ? 'page' : undefined} className={tab(show === 'all')}>
                  {t(lang, 'bill.all')} <bdi className="ms-2 inline-block opacity-70">{invoices.length}</bdi>
                </Link>
              </nav>
            </div>
            <InvoiceList invoices={shown} lang={lang} />
          </section>
        </>
      )}
    </div>
  );
}
