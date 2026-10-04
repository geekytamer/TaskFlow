import { AvailabilitySwitch } from '@/components/availability-switch';
import { ConnectedAccounts } from '@/components/connected-accounts';
import { getSocialAccounts } from '@/lib/social';
import { ProfileChangeForm } from '@/components/profile-change-form';
import { formatCompact, formatMoney, formatPercent, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Key } from '@/lib/i18n';
import { getProfile } from '@/lib/influencer';
import { currentLang } from '@/lib/session';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('influencer');
  const lang = await currentLang();
  const [profile, accounts, params] = await Promise.all([getProfile(), getSocialAccounts().catch(() => null), searchParams]);
  // Back from Instagram: ?connected=instagram, with &error=... when it did not work.
  const notice: Key | null = params.connected !== 'instagram' ? null
    : params.error === 'personal_account' ? 'social.errPersonal'
    : params.error === 'taken' ? 'social.errTaken'
    : params.error ? 'social.errCancelled'
    : 'social.connected';
  const dash = '-';

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'prof.title')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'prof.subtitle')}</p>
      </header>

      <AvailabilitySwitch lang={lang} value={profile.availability} />

      {accounts && <ConnectedAccounts lang={lang} accounts={accounts} notice={notice} />}

      <section aria-labelledby="details-title" className="space-y-3">
        <h2 id="details-title" className="text-lg font-semibold tracking-tight">{t(lang, 'prof.details')}</h2>
        <dl className="divide-y divide-line border-y border-line">
          {[
            [t(lang, 'prof.niche'), profile.niche ?? dash],
            [t(lang, 'prof.location'), profile.location ?? dash],
            [t(lang, 'prof.languages'), profile.languages.length ? profile.languages.join(listSep(lang)) : dash],
            [t(lang, 'prof.rateCard'), profile.rateCard.amount !== null ? formatMoney(profile.rateCard.amount, profile.rateCard.currency, lang) : dash],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
              <dt className="text-sm text-ink-soft">{label}</dt>
              <dd className="font-medium"><bdi>{value}</bdi></dd>
            </div>
          ))}
        </dl>
        {profile.accounts.length > 0 && (
          <ul className="divide-y divide-line border-b border-line">
            {profile.accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="font-medium"><bdi>{a.platform}</bdi></span>
                  {a.handle && (a.url
                    ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="ms-2 text-ink-soft underline underline-offset-4"><bdi dir="ltr">{a.handle}</bdi></a>
                    : <span className="ms-2 text-ink-soft"><bdi dir="ltr">{a.handle}</bdi></span>)}
                </span>
                <span className="flex gap-4 text-sm text-ink-soft">
                  <span>{t(lang, 'prof.followers')}: <bdi className="font-medium text-ink">{formatCompact(a.followers, lang)}</bdi></span>
                  <span><bdi className="font-medium text-ink">{formatPercent(a.engagementRate, lang)}</bdi></span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {profile.pendingChange ? (
        <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-4 font-medium text-accent">{t(lang, 'prof.pending')}</p>
      ) : (
        <>
          {profile.lastDecision && (
            <div role="status" className="rounded-xl border border-line bg-surface p-4">
              <p className="font-medium">{t(lang, profile.lastDecision.status === 'approved' ? 'prof.approved' : 'prof.rejected')}</p>
              {profile.lastDecision.note && <p dir="auto" className="mt-1 text-sm text-ink-soft">{profile.lastDecision.note}</p>}
            </div>
          )}
          <ProfileChangeForm lang={lang} profile={profile} />
        </>
      )}
    </div>
  );
}
