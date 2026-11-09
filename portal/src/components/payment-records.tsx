import { StatusBadge } from './status-badge';
import { list, textLink } from './ui';
import { daysUntil, paymentFileHref, type PaymentRecord } from '@/lib/payments';
import { formatDate, formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

/** "today", "tomorrow", "in 3 days": when a cheque will be deposited, or null once past. */
export function whenLabel(date: string, lang: Lang, now = new Date()): string | null {
  const n = daysUntil(date, now);
  if (n < 0) return null;
  if (n === 0) return t(lang, 'cp.today');
  if (n === 1) return t(lang, 'cp.tomorrow');
  if (n === 2) return t(lang, 'cp.inTwoDays');
  return t(lang, n > 10 ? 'cp.inDaysMany' : 'cp.inDays').replace('{n}', String(n));
}

/** Cheques and transfers on one invoice (or across invoices when `showInvoice`). */
export function PaymentRecords({ records, lang, showInvoice = false }: { records: PaymentRecord[]; lang: Lang; showInvoice?: boolean }) {
  return (
    <ul className={list}>
      {records.map((r) => {
        const cheque = r.method === 'cheque';
        const when = cheque && r.status === 'received' && r.dueDate ? whenLabel(r.dueDate, lang) : null;
        return (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
            <span className="min-w-0 space-y-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold"><bdi>{formatMoney(r.amount, r.currency ?? '', lang)}</bdi></span>
                <StatusBadge lang={lang} record={r.status} />
              </span>
              <span className="block text-sm text-ink-soft">
                {cheque ? (
                  <>
                    {t(lang, 'cp.cheque')} <bdi dir="ltr">{r.chequeNumber}</bdi>{r.bankName && <> · <bdi>{r.bankName}</bdi></>}
                    {r.dueDate && <> · {t(lang, 'cp.depositOn')} <bdi>{formatDate(r.dueDate, lang)}</bdi>{when && <> ({when})</>}</>}
                  </>
                ) : (
                  <>
                    {t(lang, 'cp.transfer')}{r.paidOn && <> · {t(lang, 'cp.sentOn')} <bdi>{formatDate(r.paidOn, lang)}</bdi></>}
                    {r.reference && <> · {t(lang, 'cp.ref')} <bdi dir="ltr">{r.reference}</bdi></>}
                  </>
                )}
                {showInvoice && r.invoiceNumber && <> · <bdi dir="ltr">{r.invoiceNumber}</bdi></>}
              </span>
              {r.reason && <span dir="auto" className="block text-sm text-danger">{t(lang, 'cp.reason')} {r.reason}</span>}
            </span>
            {r.files.length > 0 && (
              <a href={paymentFileHref(r.files[0].id)} download className={textLink}>{t(lang, 'cp.file')}</a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
