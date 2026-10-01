import Link from 'next/link';
import { StatusBadge } from './status-badge';
import type { InvoiceSummary } from '@/lib/billing';
import { formatDate, formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

export function InvoiceList({ invoices, lang, showCampaign = true }: { invoices: InvoiceSummary[]; lang: Lang; showCampaign?: boolean }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {invoices.map((i) => (
        <li key={i.id}>
          <Link href={`/billing/${i.id}`} className="grid gap-2 px-1 py-4 transition-colors hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-3">
            <div className="min-w-0">
              <p className="font-semibold"><bdi dir="ltr">{i.number}</bdi></p>
              <p className="mt-0.5 text-sm text-ink-soft">
                {t(lang, 'bill.due')} <bdi>{formatDate(i.dueDate, lang)}</bdi>
                {showCampaign && i.campaign && <> · <bdi dir="auto">{i.campaign.name}</bdi></>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              <span className="text-sm text-ink-soft">{t(lang, 'bill.total')} <bdi className="font-semibold text-ink">{formatMoney(i.total, i.currency, lang)}</bdi></span>
              {i.outstanding > 0 && i.status !== 'paid' && (
                <span className="text-sm text-ink-soft">{t(lang, 'bill.outstanding')} <bdi className="font-semibold text-ink">{formatMoney(i.outstanding, i.currency, lang)}</bdi></span>
              )}
              <StatusBadge lang={lang} invoice={i.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
