import Link from 'next/link';
import type { CampaignSummary } from '@/lib/campaigns';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import type { Message } from '@/lib/messages';
import type { NeedsYouItem } from '@/lib/needs-you';
import { StatusBadge } from './status-badge';
import { EmptyState, Figure, PageHeader, RowLink, SectionTitle, button, list, panel, textLink } from './ui';

function itemText(item: NeedsYouItem, lang: Lang) {
  if (item.kind === 'overdue') {
    return {
      label: t(lang, 'home.overdue').replace('{days}', String(item.daysLate)),
      detail: <><bdi dir="ltr">{item.title}</bdi> · <bdi>{formatMoney(item.amount, item.currency, lang)}</bdi></>,
      action: t(lang, 'home.payNow'),
    };
  }
  if (item.kind === 'proposal') return { label: t(lang, 'dash.waiting'), detail: <bdi dir="auto">{item.title}</bdi>, action: t(lang, 'dash.open') };
  return {
    label: t(lang, item.count === 1 ? 'home.reviewOne' : 'home.reviewMany').replace('{n}', String(item.count)),
    detail: <bdi dir="auto">{item.title}</bdi>,
    action: t(lang, 'home.review'),
  };
}

const tone = (item: NeedsYouItem) => (item.kind === 'overdue' ? 'text-danger' : 'text-accent');

/** The first screen: what waits on the client, ranked, then where things stand. */
export function ClientHome({ lang, firstName, items, campaigns, balances, lastTeamMessage }: {
  lang: Lang;
  firstName: string;
  items: NeedsYouItem[];
  campaigns: CampaignSummary[];
  balances: Array<{ currency: string; outstanding: number; overdue: number }>;
  lastTeamMessage: Message | null;
}) {
  const [top, ...rest] = items;
  const live = campaigns.filter((c) => c.status === 'active' || c.status === 'planned' || c.status === 'on_hold');

  return (
    <div className="space-y-10">
      <PageHeader title={`${t(lang, 'dash.hello')} ${firstName}`} subtitle={items.length ? t(lang, 'home.subtitleWaiting') : t(lang, 'home.subtitleClear')} />

      <section aria-labelledby="needs-title">
        <SectionTitle id="needs-title">{t(lang, 'home.needsYou')}</SectionTitle>
        {top ? (
          <div className={list}>
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-5">
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${tone(top)}`}>{itemText(top, lang).label}</p>
                <p className="mt-0.5 truncate text-[17px] font-semibold">{itemText(top, lang).detail}</p>
              </div>
              <Link href={top.href} className={`${button.primary} w-full sm:w-auto`}>{itemText(top, lang).action}</Link>
            </div>
            {rest.map((item) => (
              <RowLink key={item.key} href={item.href}>
                <p className={`text-sm font-semibold ${tone(item)}`}>{itemText(item, lang).label}</p>
                <p className="truncate font-medium">{itemText(item, lang).detail}</p>
              </RowLink>
            ))}
          </div>
        ) : (
          <div className={`${panel} flex items-center gap-3 px-5 py-4`}>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7.5" /><path d="m6.8 10.2 2.2 2.2 4.2-4.6" /></svg>
            <p className="text-[15px]">{t(lang, 'home.nothing')}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="standing-title">
        <h2 id="standing-title" className="sr-only">{t(lang, 'home.standing')}</h2>
        <dl className={`${panel} grid gap-6 p-5 sm:grid-cols-3 sm:p-6`}>
          <Figure
            label={t(lang, 'bill.outstanding')}
            value={balances.length
              ? balances.map((b) => <bdi key={b.currency} className="block">{formatMoney(b.outstanding, b.currency, lang)}</bdi>)
              : <bdi>{t(lang, 'home.nothingOwed')}</bdi>}
            hint={balances.some((b) => b.overdue > 0)
              ? <span className="font-medium text-danger">{balances.filter((b) => b.overdue > 0).map((b) => `${formatMoney(b.overdue, b.currency, lang)} ${t(lang, 'home.overdueShort')}`).join(' · ')}</span>
              : <Link href="/billing" className="underline-offset-4 hover:underline">{t(lang, 'home.seeBilling')}</Link>}
          />
          <Figure
            label={t(lang, 'home.liveCampaigns')}
            value={<bdi>{live.length}</bdi>}
            hint={<Link href="/campaigns" className="underline-offset-4 hover:underline">{t(lang, 'home.seeCampaigns')}</Link>}
          />
          <div className="min-w-0">
            <dt className="text-sm text-ink-soft">{t(lang, 'home.lastFromTeam')}</dt>
            {lastTeamMessage ? (
              <dd className="mt-1">
                <Link href="/messages" className="group block">
                  <span dir="auto" className="line-clamp-2 font-medium group-hover:underline">{lastTeamMessage.body}</span>
                  <span className="mt-1 block text-sm text-ink-soft"><bdi>{formatDateTime(lastTeamMessage.createdAt, lang)}</bdi></span>
                </Link>
              </dd>
            ) : (
              <dd className="mt-1 text-ink-soft">{t(lang, 'home.noMessages')} <Link href="/messages" className="font-medium text-accent">{t(lang, 'home.writeTeam')}</Link></dd>
            )}
          </div>
        </dl>
      </section>

      <section aria-labelledby="campaigns-title">
        <SectionTitle id="campaigns-title" aside={live.length > 0 && <Link href="/campaigns" className={textLink}>{t(lang, 'home.allCampaigns')}</Link>}>
          {t(lang, 'dash.campaigns')}
        </SectionTitle>
        {live.length === 0 ? (
          <EmptyState title={t(lang, 'dash.client.title')} body={t(lang, 'dash.client.body')}
            action={<Link href="/influencers" className={button.secondary}>{t(lang, 'dash.client.browse')}</Link>} />
        ) : (
          <ul className={list}>
            {live.slice(0, 5).map((c) => (
              <li key={c.id}>
                <RowLink href={`/campaigns/${c.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <p className="min-w-0 truncate font-semibold"><bdi>{c.name}</bdi></p>
                    <StatusBadge lang={lang} campaign={c.status} />
                  </div>
                  <Progress lang={lang} campaign={c} />
                </RowLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Pieces live out of the total, as a thin bar and in words. */
export function Progress({ lang, campaign }: { lang: Lang; campaign: CampaignSummary }) {
  const { total, published, awaitingReview, nextDue } = campaign.deliverables;
  if (total === 0) return <p className="mt-1 text-sm text-ink-soft">{t(lang, 'home.noPieces')}</p>;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]" aria-hidden="true">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((published / total) * 100)}%` }} />
      </div>
      <p className="text-sm text-ink-soft">
        {t(lang, 'home.liveOf').replace('{n}', String(published)).replace('{total}', String(total))}
        {awaitingReview > 0 && <> · <span className="font-semibold text-accent">{t(lang, 'camp.toReview')}: <bdi>{awaitingReview}</bdi></span></>}
        {nextDue && <> · {t(lang, 'home.nextDue')} <bdi>{formatDate(nextDue, lang)}</bdi></>}
      </p>
    </div>
  );
}
