import { StatusBadge } from './status-badge';
import { RowLink, list } from './ui';
import type { InvoiceSummary } from '@/lib/billing';
import { formatDate, formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

export function InvoiceList({ invoices, lang, showCampaign = true }: { invoices: InvoiceSummary[]; lang: Lang; showCampaign?: boolean }) {
  return (
    <ul className={list}>
      {invoices.map((i) => {
        const open = i.outstanding > 0 && i.status !== 'paid';
        return (
          <li key={i.id}>
            <RowLink href={`/billing/${i.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold"><bdi dir="ltr">{i.number}</bdi><StatusBadge lang={lang} invoice={i.status} /></p>
                  <p className="mt-0.5 truncate text-sm text-ink-soft">
                    {t(lang, 'bill.due')} <bdi>{formatDate(i.dueDate, lang)}</bdi>
                    {showCampaign && i.campaign && <> · <bdi>{i.campaign.name}</bdi></>}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className={`font-semibold ${i.status === 'overdue' ? 'text-danger' : ''}`}><bdi>{formatMoney(open ? i.outstanding : i.total, i.currency, lang)}</bdi></p>
                  <p className="text-xs text-ink-soft">{t(lang, open ? 'bill.leftToPay' : 'bill.total')}</p>
                </div>
              </div>
            </RowLink>
          </li>
        );
      })}
    </ul>
  );
}
