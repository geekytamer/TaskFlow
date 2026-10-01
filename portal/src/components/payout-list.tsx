import { StatusBadge } from './status-badge';
import { formatDate, formatMoney, listSep } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import type { Payout } from '@/lib/influencer-types';

export function PayoutList({ payouts, lang }: { payouts: Payout[]; lang: Lang }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {payouts.map((p) => (
        <li key={p.id} className="grid gap-2 px-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {p.kind === 'referral' && <span className="me-2 font-normal text-ink-soft">{t(lang, 'pay.referral')}:</span>}
              <bdi dir="auto">{p.label}</bdi>
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">
              <bdi dir="ltr">{p.number}</bdi>
              {p.items.length > 0 && <> · <bdi dir="auto">{p.items.join(listSep(lang))}</bdi></>}
              {' · '}
              {p.status === 'paid' && p.paidAt
                ? <>{t(lang, 'pay.paidOn')} <bdi>{formatDate(p.paidAt, lang)}</bdi></>
                : <>{t(lang, 'pay.due')} <bdi>{formatDate(p.dueDate, lang)}</bdi></>}
            </p>
          </div>
          <div className="flex items-center gap-3 sm:justify-end">
            <span className="font-semibold"><bdi>{formatMoney(p.amount, p.currency, lang)}</bdi></span>
            <StatusBadge lang={lang} payout={p.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
