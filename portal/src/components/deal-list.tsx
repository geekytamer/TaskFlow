import Link from 'next/link';
import { formatDate, formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import type { Assignment } from '@/lib/influencer-types';
import type { DealSummary } from '@/lib/workspace-types';
import { AssignmentActions } from './assignment-actions';
import { StatusBadge } from './status-badge';
import { list, panel, RowLink } from './ui';

const today = () => new Date().toISOString().slice(0, 10);

/** "Peak", as words beside the title: never colour alone. */
export const PeakTag = ({ lang }: { lang: Lang }) => (
  <span className="inline-flex shrink-0 items-center rounded-[5px] border border-accent/40 px-1.5 text-[11px] font-semibold leading-[18px] text-accent">
    {t(lang, 'deal.peakTag')}
  </span>
);

/** One deal in a list: what it is and for whom, then the money and where it stands. */
export function DealRow({ deal, lang }: { deal: DealSummary; lang: Lang }) {
  const due = deal.nextDue?.dueDate ?? null;
  const overdue = due !== null && due < today() && deal.status !== 'paid' && deal.status !== 'cancelled';
  return (
    <RowLink href={`/deals/${deal.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span dir="auto" className="truncate font-semibold"><bdi>{deal.title}</bdi></span>
            {deal.source === 'peak' && <PeakTag lang={lang} />}
          </p>
          <p className="mt-0.5 truncate text-sm text-ink-soft">
            {deal.brand && <bdi>{deal.brand.name}</bdi>}
            {deal.brand && deal.nextDue && <span aria-hidden="true"> · </span>}
            {deal.nextDue && (
              <span className={overdue ? 'font-medium text-danger' : ''}>
                {overdue ? t(lang, 'deal.overdue') : t(lang, 'deal.next')}: <bdi dir="auto">{deal.nextDue.title}</bdi>
                {due && <> <bdi>{formatDate(due, lang)}</bdi></>}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {deal.amount !== null && <span className="font-medium tabular-nums"><bdi>{formatMoney(deal.amount, deal.currency, lang)}</bdi></span>}
          <StatusBadge lang={lang} deal={deal.status} />
        </div>
      </div>
    </RowLink>
  );
}

export function DealGroup({ title, deals, lang }: { title: string; deals: DealSummary[]; lang: Lang }) {
  if (deals.length === 0) return null;
  const id = `group-${title.replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-base font-semibold">{title}</h2>
      <ul className={list}>{deals.map((d) => <li key={d.id}><DealRow deal={d} lang={lang} /></li>)}</ul>
    </section>
  );
}

/** A Peak offer waiting for a yes or no: enough to decide, and the two buttons. */
export function OfferCard({ offer, lang }: { offer: Assignment; lang: Lang }) {
  const to = lang === 'ar' ? 'إلى' : '–';
  return (
    <article id={offer.id} className={`${panel} space-y-5 border-accent/40 p-5 sm:p-6`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Link href={`/deals/peak-${offer.id}`} className="underline-offset-4 hover:underline"><bdi>{offer.campaign.name}</bdi></Link>
            <PeakTag lang={lang} />
          </h3>
          {offer.campaign.brand && <p className="mt-0.5 text-ink-soft"><bdi>{offer.campaign.brand}</bdi></p>}
        </div>
        {offer.agreedRate !== null && (
          <p className="text-end">
            <span className="block text-sm text-ink-soft">{t(lang, 'asg.fee')}</span>
            <span className="text-xl font-semibold tabular-nums"><bdi>{formatMoney(offer.agreedRate, offer.currency, lang)}</bdi></span>
          </p>
        )}
      </header>
      {(offer.campaign.startDate || offer.deliverables.length > 0) && (
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {offer.campaign.startDate && (
            <div>
              <dt className="text-ink-soft">{t(lang, 'asg.dates')}</dt>
              <dd className="font-medium"><bdi>{formatDate(offer.campaign.startDate, lang)}</bdi> {to} <bdi>{formatDate(offer.campaign.endDate, lang)}</bdi></dd>
            </div>
          )}
          {offer.deliverables.length > 0 && (
            <div>
              <dt className="text-ink-soft">{t(lang, 'asg.deliverables')}</dt>
              <dd className="font-medium">{offer.deliverables.map((d) => <bdi key={d.id} dir="auto" className="block">{d.title}</bdi>)}</dd>
            </div>
          )}
        </dl>
      )}
      <p className="text-sm text-ink-soft">{t(lang, 'asg.briefAfter')}</p>
      <AssignmentActions id={offer.id} lang={lang} />
    </article>
  );
}

/** All / Mine / From Peak, as links so the choice survives a refresh and the back button. */
export function DealFilter({ lang, current, counts }: { lang: Lang; current: 'all' | 'own' | 'peak'; counts: Record<'all' | 'own' | 'peak', number> }) {
  const options = [['all', '/deals'], ['own', '/deals?source=own'], ['peak', '/deals?source=peak']] as const;
  return (
    <nav aria-label={t(lang, 'deal.filterLabel')} className="inline-flex rounded-control border border-line bg-surface p-1">
      {options.map(([key, href]) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? 'page' : undefined}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-[calc(var(--radius-control)-4px)] px-3 text-sm font-medium transition-colors ${current === key ? 'bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]' : 'text-ink-soft hover:text-ink'}`}
        >
          {t(lang, `deal.filter.${key}`)}
          <span className="tabular-nums text-ink-soft"><bdi>{counts[key]}</bdi></span>
        </Link>
      ))}
    </nav>
  );
}
