import Link from 'next/link';
import { PeakTag } from '@/components/deal-list';
import { EmptyState, PageHeader, SectionTitle, list, panel } from '@/components/ui';
import { addMonths, groupByDay, monthGrid, todayIso } from '@/lib/calendar';
import { formatDate } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Lang } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { getCalendar, type CalendarItem } from '@/lib/workspace';

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB');
const monthTitle = (month: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
const weekday = (date: string, lang: Lang, style: 'short' | 'long') =>
  new Intl.DateTimeFormat(locale(lang), { weekday: style, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('influencer');
  const lang = await currentLang();
  const raw = (await searchParams).month;
  const today = todayIso();
  const month = typeof raw === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : today.slice(0, 7);
  const weeks = monthGrid(month);
  const data = await getCalendar(weeks[0][0], weeks.at(-1)!.at(-1)!);
  const inMonth = data.items.filter((i) => i.dueDate.startsWith(month));
  const byDay = new Map(groupByDay(data.items).map((g) => [g.date, g.items]));
  const overdue = month === today.slice(0, 7) ? [...data.overdue, ...data.items.filter((i) => !i.done && i.dueDate < today)] : [];

  const nav = (
    <nav aria-label={monthTitle(month, lang)} className="inline-flex items-center rounded-control border border-line bg-surface">
      <Link href={`/calendar?month=${addMonths(month, -1)}`} aria-label={t(lang, 'cal.prev')} className="grid h-11 w-11 place-items-center text-ink-soft hover:text-ink">
        <span aria-hidden="true" className="rtl:rotate-180">‹</span>
      </Link>
      <Link href="/calendar" className="px-2 text-sm font-medium text-ink-soft hover:text-ink">{t(lang, 'cal.thisMonth')}</Link>
      <Link href={`/calendar?month=${addMonths(month, 1)}`} aria-label={t(lang, 'cal.next')} className="grid h-11 w-11 place-items-center text-ink-soft hover:text-ink">
        <span aria-hidden="true" className="rtl:rotate-180">›</span>
      </Link>
    </nav>
  );

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader title={t(lang, 'cal.title')} subtitle={t(lang, 'cal.subtitle')} actions={nav} />

      {overdue.length > 0 && (
        <section aria-labelledby="overdue-title">
          <SectionTitle id="overdue-title"><span className="text-danger">{t(lang, 'cal.overdue')}</span></SectionTitle>
          <ul className={list}>{overdue.map((i) => <li key={`${i.source}-${i.id}`}><AgendaRow item={i} lang={lang} showDate /></li>)}</ul>
        </section>
      )}

      <h2 className="text-xl font-semibold tracking-tight">{monthTitle(month, lang)}</h2>

      {/* Phones: the days that have something, as a list. */}
      <div className="lg:hidden">
        {inMonth.length === 0 ? <EmptyState title={t(lang, 'cal.empty')} /> : (
          <ol className="space-y-5">
            {groupByDay(inMonth).map((g) => (
              <li key={g.date}>
                <h3 className={`mb-2 text-sm font-semibold ${g.date === today ? 'text-accent' : 'text-ink-soft'}`}>
                  {g.date === today ? `${t(lang, 'cal.today')} · ` : ''}{weekday(g.date, lang, 'long')} <bdi>{formatDate(g.date, lang)}</bdi>
                </h3>
                <ul className={list}>{g.items.map((i) => <li key={`${i.source}-${i.id}`}><AgendaRow item={i} lang={lang} /></li>)}</ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Wide screens: the month as a grid. */}
      <div className={`${panel} hidden overflow-hidden lg:block`}>
        <div className="grid grid-cols-7 border-b border-line text-sm text-ink-soft">
          {weeks[0].map((d) => <div key={d} className="px-3 py-2 font-medium">{weekday(d, lang, 'short')}</div>)}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
            {week.map((d) => {
              const items = byDay.get(d) ?? [];
              const outside = !d.startsWith(month);
              return (
                <div key={d} className={`min-h-28 border-e border-line p-2 last:border-e-0 ${outside ? 'bg-canvas/40' : ''}`}>
                  <p className={`mb-1 text-sm tabular-nums ${d === today ? 'inline-grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1 font-semibold text-accent-ink' : outside ? 'text-ink-soft/60' : 'text-ink-soft'}`}>
                    <span className="sr-only">{d === today ? `${t(lang, 'cal.today')} ` : ''}</span>{Number(d.slice(8))}
                  </p>
                  <ul className="space-y-1">
                    {items.slice(0, 3).map((i) => (
                      <li key={`${i.source}-${i.id}`}>
                        <Link
                          href={`/deals/${i.dealId}${i.source === 'peak' ? `#work-${i.id}` : ''}`}
                          title={`${i.title} · ${i.dealTitle}`}
                          className={`block truncate rounded-[5px] px-1.5 py-0.5 text-[13px] leading-5 hover:bg-ink/5 ${i.done ? 'text-ink-soft line-through decoration-ink-soft/60' : i.source === 'peak' ? 'bg-accent/10 text-ink' : 'bg-ink/[0.06] text-ink'}`}
                        >
                          <bdi dir="auto">{i.title}</bdi>
                          {i.done && <span className="sr-only"> ({t(lang, 'cal.done')})</span>}
                        </Link>
                      </li>
                    ))}
                    {items.length > 3 && <li className="px-1.5 text-xs text-ink-soft">{t(lang, 'cal.more').replace('{n}', String(items.length - 3))}</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgendaRow({ item, lang, showDate = false }: { item: CalendarItem; lang: Lang; showDate?: boolean }) {
  return (
    <Link href={`/deals/${item.dealId}${item.source === 'peak' ? `#work-${item.id}` : ''}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <bdi dir="auto" className={`truncate font-medium ${item.done ? 'text-ink-soft line-through decoration-ink-soft/60' : ''}`}>{item.title}</bdi>
          {item.source === 'peak' && <PeakTag lang={lang} />}
        </span>
        <span className="block truncate text-sm text-ink-soft">
          <bdi dir="auto">{item.dealTitle}</bdi>
          {item.platform && <> · <bdi>{item.platform}</bdi></>}
        </span>
      </span>
      <span className="shrink-0 text-sm text-ink-soft">
        {item.done ? t(lang, 'cal.done') : showDate ? <bdi>{formatDate(item.dueDate, lang)}</bdi> : null}
      </span>
    </Link>
  );
}
