import { PayoutList } from '@/components/payout-list';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { getPayouts } from '@/lib/influencer';
import { currentLang } from '@/lib/session';

export default async function PayoutsPage() {
  requireAudience('influencer');
  const lang = await currentLang();
  const payouts = await getPayouts();

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'pay.title')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'pay.subtitle')}</p>
      </header>
      {payouts.length === 0 ? (
        <section className="border-t border-line pt-8">
          <h2 className="text-xl font-semibold tracking-tight">{t(lang, 'pay.emptyTitle')}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'pay.emptyBody')}</p>
        </section>
      ) : (
        <PayoutList payouts={payouts} lang={lang} />
      )}
    </div>
  );
}
