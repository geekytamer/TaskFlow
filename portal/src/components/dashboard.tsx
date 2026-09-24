import type { Audience } from '@/lib/audience';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { Me } from '@/lib/portal';

export function Dashboard({ me, lang, audience }: { me: Me; lang: Lang; audience: Audience }) {
  const rows: Array<{ label: string; value: string; ltr?: boolean }> = [
    { label: t(lang, 'dash.name'), value: me.user.name },
    { label: t(lang, 'dash.email'), value: me.user.email, ltr: true },
    { label: t(lang, audience === 'client' ? 'dash.organisation' : 'dash.profile'), value: me.subject.name },
    { label: t(lang, 'dash.role'), value: t(lang, `role.${me.user.role}` as Key) },
  ];

  return (
    <div className="space-y-14">
      <header>
        <p className="text-sm text-ink-soft">{t(lang, 'dash.hello')}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{me.user.name}</h1>
      </header>

      <section aria-labelledby="empty-title" className="max-w-xl">
        <h2 id="empty-title" className="text-xl font-semibold tracking-tight">
          {t(lang, audience === 'client' ? 'dash.client.title' : 'dash.influencer.title')}
        </h2>
        <p className="mt-2 leading-relaxed text-ink-soft">
          {t(lang, audience === 'client' ? 'dash.client.body' : 'dash.influencer.body')}
        </p>
      </section>

      <section aria-labelledby="account-title">
        <h2 id="account-title" className="mb-3 text-base font-semibold">{t(lang, 'dash.account')}</h2>
        <dl className="divide-y divide-line border-y border-line">
          {rows.map(({ label, value, ltr }) => (
            <div key={label} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:items-baseline sm:gap-6">
              <dt className="text-sm text-ink-soft">{label}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">
                {ltr ? <bdi dir="ltr">{value}</bdi> : value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
