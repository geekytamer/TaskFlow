import Link from 'next/link';
import type { CampaignSummary } from '@/lib/campaigns';
import { PeakPlanet, type Satellite } from './cosmic';
import { PeakOrbit } from './peak-orbit';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import type { Message } from '@/lib/messages';
import type { NeedsYouItem } from '@/lib/needs-you';
import { StatusBadge } from './status-badge';
import { EmptyState, RowLink, SectionTitle, button, list, panel, textLink } from './ui';

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
const display = { fontFamily: 'var(--font-display), var(--font-latin), var(--font-arabic), sans-serif' };

/**
 * The first screen, in Peak's voice: a greeting that says where things stand,
 * the Peak planet with the client's own figures circling it, the one next
 * step on a lit card, then campaigns, money and the latest word from the team.
 */
export function ClientHome({ lang, firstName, items, campaigns, balances, lastTeamMessage, markSrc = null }: {
  lang: Lang;
  firstName: string;
  items: NeedsYouItem[];
  campaigns: CampaignSummary[];
  balances: Array<{ currency: string; outstanding: number; overdue: number }>;
  lastTeamMessage: Message | null;
  markSrc?: string | null;
}) {
  const [top, ...rest] = items;
  const live = campaigns.filter((c) => c.status === 'active' || c.status === 'planned' || c.status === 'on_hold');
  const published = live.reduce((n, c) => n + c.deliverables.published, 0);
  const toReview = items.reduce((n, i) => n + (i.kind === 'review' ? i.count : 0), 0);
  const proposals = items.filter((i) => i.kind === 'proposal').length;
  const overdue = items.filter((i) => i.kind === 'overdue').length;
  const owed = balances.find((b) => b.outstanding > 0);

  const heroLine = items.length ? t(lang, 'home.heroWaiting') : live.length ? t(lang, 'home.heroOnTrack') : t(lang, 'home.heroStart');
  const chips = [
    proposals ? { key: 'p', text: t(lang, proposals === 1 ? 'home.chipProposal' : 'home.chipProposals').replace('{n}', String(proposals)), hot: true } : null,
    toReview ? { key: 'r', text: t(lang, 'home.chipReview').replace('{n}', String(toReview)), hot: !proposals } : null,
    overdue ? { key: 'o', text: t(lang, 'home.chipOverdue').replace('{n}', String(overdue)), hot: false } : null,
  ].filter((c): c is { key: string; text: string; hot: boolean } => c !== null);

  const mark = markSrc
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={markSrc} alt="" className="w-[42%]" />
    : <PeakOrbit glyph />;
  // Only figures worth showing: a new client sees the planet alone, not a ring of zeros.
  const satellites = ([
    live.length > 0 && { key: 'live', label: <bdi>{t(lang, 'home.satLive').replace('{n}', String(live.length))}</bdi>, className: 'end-[6%] top-[6%]' },
    published > 0 && { key: 'pub', label: <bdi>{t(lang, 'home.satPublished').replace('{n}', String(published))}</bdi>, className: 'start-0 top-[44%]' },
    owed
      ? { key: 'owed', label: <bdi>{formatMoney(owed.outstanding, owed.currency, lang)} {t(lang, 'home.satOwed')}</bdi>, className: 'bottom-[6%] end-[14%]' }
      : toReview > 0 && { key: 'rev', label: <bdi>{t(lang, 'home.satReview').replace('{n}', String(toReview))}</bdi>, className: 'bottom-[6%] end-[14%]' },
  ] as Array<Satellite | false>).filter((x): x is Satellite => Boolean(x));

  return (
    <div className="space-y-10">
      <section className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* Phones get a small planet above the greeting; the big one with its figures sits beside it on wide screens. */}
          <div className="-mb-4 -mt-2 flex justify-end lg:hidden"><PeakPlanet size={64} mark={mark} /></div>
          <h1 className="text-[36px] font-extrabold leading-[1.18] tracking-tight sm:text-[46px] lg:text-[52px]">
            {t(lang, 'home.heroHello').replace('{name}', firstName)}<br />{heroLine}
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-ink-soft sm:text-[17px]">{items.length ? t(lang, 'home.subtitleWaiting') : t(lang, 'home.subtitleClear')}</p>
          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <li key={c.key} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.14] px-4 text-sm text-ink">
                  {c.hot && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />}{c.text}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/requests/new" className={button.primary}>{t(lang, 'shell.startCampaign')}</Link>
            <Link href="/campaigns" className={button.secondary}>{t(lang, 'home.seeCampaigns')}</Link>
          </div>
        </div>
        <div className="hidden justify-center lg:flex">
          <PeakPlanet size={260} mark={mark} satellites={satellites} />
        </div>
      </section>

      {top ? (
        <section aria-labelledby="needs-title" className="space-y-3">
          <h2 id="needs-title" className="sr-only">{t(lang, 'home.needsYou')}</h2>
          <article className="relative overflow-hidden rounded-[28px] border border-white/[0.08] p-6 card-surface shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] sm:p-7">
            <span aria-hidden="true" className="orange-disc -bottom-20 -start-16 h-52 w-52" />
            <div className="relative space-y-2">
              <p className="text-sm text-ink-soft">{t(lang, 'home.nextStep')}</p>
              <p className={`text-sm font-bold ${tone(top)}`}>{itemText(top, lang).label}</p>
              <p className="max-w-lg text-[24px] font-extrabold leading-snug sm:text-[28px]" style={display}>{itemText(top, lang).detail}</p>
              <div className="pt-3">
                <Link href={top.href} className="inline-flex h-12 items-center rounded-control bg-ink px-6 text-[15px] font-extrabold text-canvas transition-colors hover:bg-ink/90">{itemText(top, lang).action}</Link>
              </div>
            </div>
          </article>
          {rest.length > 0 && (
            <div className={list}>
              {rest.map((item) => (
                <RowLink key={item.key} href={item.href}>
                  <p className={`text-sm font-semibold ${tone(item)}`}>{itemText(item, lang).label}</p>
                  <p className="truncate font-medium">{itemText(item, lang).detail}</p>
                </RowLink>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className={`${panel} flex items-center gap-3 px-5 py-4`}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7.5" /><path d="m6.8 10.2 2.2 2.2 4.2-4.6" /></svg>
          <p className="text-[15px]">{t(lang, 'home.nothing')}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
                      <p className="min-w-0 truncate text-[17px] font-bold" style={display}><bdi>{c.name}</bdi></p>
                      <StatusBadge lang={lang} campaign={c.status} />
                    </div>
                    <Progress lang={lang} campaign={c} />
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4" aria-label={t(lang, 'home.standing')}>
          <div className={`${panel} space-y-2 p-5`}>
            <p className="text-sm text-ink-soft">{t(lang, 'bill.outstanding')}</p>
            {balances.length
              ? balances.map((b) => <p key={b.currency} className="text-[30px] font-extrabold leading-tight" style={display}><bdi>{formatMoney(b.outstanding, b.currency, lang)}</bdi></p>)
              : <p className="text-[22px] font-extrabold" style={display}>{t(lang, 'home.nothingOwed')}</p>}
            {balances.some((b) => b.overdue > 0) && (
              <p className="text-sm font-semibold text-danger">{balances.filter((b) => b.overdue > 0).map((b) => `${formatMoney(b.overdue, b.currency, lang)} ${t(lang, 'home.overdueShort')}`).join(' · ')}</p>
            )}
            <Link href="/billing" className={textLink}>{t(lang, 'home.seeBilling')}</Link>
          </div>
          <div className={`${panel} flex gap-3 p-5`}>
            <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/[0.16] text-accent">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H8l-4 4z" /></svg>
            </span>
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm text-ink-soft">{t(lang, 'home.lastFromTeam')}</p>
              {lastTeamMessage ? (
                <Link href="/messages" className="group block">
                  <span dir="auto" className="line-clamp-3 text-[15px] leading-relaxed group-hover:underline">{lastTeamMessage.body}</span>
                  <span className="mt-1 block text-sm text-ink-soft"><bdi>{formatDateTime(lastTeamMessage.createdAt, lang)}</bdi></span>
                </Link>
              ) : (
                <p className="text-ink-soft">{t(lang, 'home.noMessages')} <Link href="/messages" className="font-semibold text-accent">{t(lang, 'home.writeTeam')}</Link></p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Pieces live out of the total: one segment per piece (a plain bar past 12), and in words. */
export function Progress({ lang, campaign }: { lang: Lang; campaign: CampaignSummary }) {
  const { total, published, awaitingReview, nextDue } = campaign.deliverables;
  if (total === 0) return <p className="mt-1 text-sm text-ink-soft">{t(lang, 'home.noPieces')}</p>;
  return (
    <div className="mt-3 space-y-2">
      {total <= 12 ? (
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full ${i < published ? 'bg-accent' : 'bg-ink/[0.12]'}`} />
          ))}
        </div>
      ) : (
        <div className="h-2 overflow-hidden rounded-full bg-ink/[0.12]" aria-hidden="true">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((published / total) * 100)}%` }} />
        </div>
      )}
      <p className="text-sm text-ink-soft">
        {t(lang, 'home.liveOf').replace('{n}', String(published)).replace('{total}', String(total))}
        {awaitingReview > 0 && <> · <span className="font-semibold text-accent">{t(lang, 'camp.toReview')}: <bdi>{awaitingReview}</bdi></span></>}
        {nextDue && <> · {t(lang, 'home.nextDue')} <bdi>{formatDate(nextDue, lang)}</bdi></>}
      </p>
    </div>
  );
}
