import { InvoiceList } from '@/components/invoice-list';
import { getInvoices } from '@/lib/billing';
import { formatMoney } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export default async function BillingPage() {
  requireAudience('client');
  const lang = await currentLang();
  const invoices = await getInvoices();
  // Totals per currency: an account can be billed in more than one.
  const outstanding = Object.entries(invoices.reduce<Record<string, number>>((acc, i) => {
    if (i.outstanding > 0) acc[i.currency] = (acc[i.currency] ?? 0) + i.outstanding;
    return acc;
  }, {}));

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'bill.title')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'bill.subtitle')}</p>
      </header>

      {outstanding.length > 0 && (
        <dl className="flex flex-wrap gap-x-10 gap-y-2">
          {outstanding.map(([currency, amount]) => (
            <div key={currency}>
              <dt className="text-sm text-ink-soft">{t(lang, 'bill.outstanding')}</dt>
              <dd className="text-2xl font-semibold tracking-tight"><bdi>{formatMoney(amount, currency, lang)}</bdi></dd>
            </div>
          ))}
        </dl>
      )}

      {invoices.length === 0 ? (
        <section className="max-w-xl border-t border-line pt-8">
          <h2 className="text-xl font-semibold tracking-tight">{t(lang, 'bill.emptyTitle')}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'bill.emptyBody')}</p>
        </section>
      ) : (
        <InvoiceList invoices={invoices} lang={lang} />
      )}
    </div>
  );
}
