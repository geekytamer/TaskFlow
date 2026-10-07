import { AvailabilitySwitch } from '@/components/availability-switch';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { panel } from '@/components/ui';
import { getSocialAccounts } from '@/lib/social';
import { ProfileChangeForm } from '@/components/profile-change-form';
import { formatCompact, formatMoney, formatPercent, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { getProfile } from '@/lib/influencer';
import { currentLang } from '@/lib/session';
import { getAlertSettings } from '@/lib/alerts';
import { WhatsAppAlerts } from '@/components/whatsapp-alerts';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('influencer');
  const lang = await currentLang();
  const [profile, accounts, params, alerts] = await Promise.all([getProfile(), getSocialAccounts().catch(() => null), searchParams, getAlertSettings().catch(() => null)]);
  // Older Instagram returns still come here; the notice lives on Connected accounts now.
  if (params.connected === 'instagram') redirect(`/connections?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === 'string')).toString()}`);
  const linked = accounts?.find((a) => a.status === 'active' || a.status === 'needs_reconnect');
  const dash = '-';

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'prof.title')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'prof.subtitle')}</p>
      </header>

      <AvailabilitySwitch lang={lang} value={profile.availability} />

      <Link href="/connections" className={`${panel} flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-2`}>
        <span className="min-w-0">
          <span className="block font-semibold">{t(lang, 'conn.profileLink')}</span>
          <span className="block text-sm text-ink-soft">
            {linked ? t(lang, 'conn.profileSome').replace('{u}', linked.username) : t(lang, 'conn.profileNone')}
          </span>
        </span>
        <span aria-hidden="true" className="text-ink-soft rtl:rotate-180">›</span>
      </Link>

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
              {profile.lastDecision.note && <p className="mt-1 text-sm text-ink-soft"><bdi>{profile.lastDecision.note}</bdi></p>}
            </div>
          )}
          <ProfileChangeForm lang={lang} profile={profile} />
        </>
      )}

      {alerts && <WhatsAppAlerts lang={lang} initial={alerts} />}
    </div>
  );
}
