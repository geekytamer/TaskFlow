import { ReferralForm } from '@/components/referral-form';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import { getAudience } from '@/lib/audience';
import { requireMe } from '@/lib/portal';
import { t, type Lang } from '@/lib/i18n';
import { getReferrals, type Referral } from '@/lib/referrals';
import { currentLang } from '@/lib/session';

/** What the referrer will earn, in the most concrete form known so far. */
function commissionText(c: NonNullable<Referral['commission']>, lang: Lang) {
  if (c.amount !== null) return formatMoney(c.amount, c.currency, lang);
  if (c.basis === 'fixed' && c.fixedAmount !== null) return formatMoney(c.fixedAmount, c.currency, lang);
  return `${formatPercent(c.ratePercent, lang)} ${t(lang, 'ref.ofDeal')}`;
}

export default async function ReferralsPage() {
  const audience = getAudience();
  const lang = await currentLang();
  const [referrals, me] = await Promise.all([getReferrals(), requireMe(audience)]);
  const currency = me.company?.currency ?? '';

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'ref.title')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'ref.subtitle')}</p>
      </header>

      <ReferralForm lang={lang} currency={currency} />

      <section aria-labelledby="yours-title" className="space-y-4">
        <h2 id="yours-title" className="text-lg font-semibold tracking-tight">{t(lang, 'ref.yours')}</h2>
        {referrals.length === 0 ? (
          <div className="border-t border-line pt-6">
            <p className="font-medium">{t(lang, 'ref.emptyTitle')}</p>
            <p className="mt-1 text-ink-soft">{t(lang, 'ref.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {referrals.map((r) => (
              <li key={r.id} className="space-y-2 px-1 py-5 sm:px-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-semibold"><bdi>{r.prospectName}</bdi></p>
                  <StatusBadge lang={lang} referral={r.status} />
                </div>
                <p dir="auto" className="line-clamp-2 text-sm leading-relaxed text-ink-soft">{r.description}</p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <span className="text-ink-soft"><bdi>{formatDate(r.createdAt, lang)}</bdi></span>
                  {r.commission && r.commission.status !== 'voided' && (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-ink-soft">{t(lang, 'ref.commission')}:</span>
                      <span className="font-semibold"><bdi>{commissionText(r.commission, lang)}</bdi></span>
                      <StatusBadge lang={lang} commission={r.commission.status} />
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
