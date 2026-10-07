import Link from 'next/link';
import { PeakTag } from '@/components/deal-list';
import { DeleteEntry, ExpenseForm } from '@/components/expense-form';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState, PageHeader, SectionTitle, list, panel } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Key, type Lang } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { expenseCategoryKey, getDeals, getMoney, getWorkspaceSettings, type ExpenseCategory, type MoneySummary } from '@/lib/workspace';

const monthName = (month: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

export default async function MoneyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('influencer');
  const lang = await currentLang();
  const raw = (await searchParams).year;
  const thisYear = new Date().getUTCFullYear();
  const year = typeof raw === 'string' && /^\d{4}$/.test(raw) ? Number(raw) : thisYear;
  const [money, deals, settings] = await Promise.all([getMoney(year), getDeals('own'), getWorkspaceSettings()]);
  const empty = money.currencies.length === 0 && money.ledger.length === 0;

  const yearNav = (
    <nav aria-label={t(lang, 'money.yearNav')} className="inline-flex items-center rounded-control border border-line bg-surface">
      <Link href={`/money?year=${year - 1}`} aria-label={t(lang, 'money.prevYear')} className="grid h-11 w-11 place-items-center text-ink-soft hover:text-ink">
        <span aria-hidden="true" className="rtl:rotate-180">‹</span>
      </Link>
      <span className="min-w-14 text-center font-semibold tabular-nums">{year}</span>
      {year < thisYear ? (
        <Link href={`/money?year=${year + 1}`} aria-label={t(lang, 'money.nextYear')} className="grid h-11 w-11 place-items-center text-ink-soft hover:text-ink">
          <span aria-hidden="true" className="rtl:rotate-180">›</span>
        </Link>
      ) : <span className="w-11" />}
    </nav>
  );

  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader title={t(lang, 'money.title')} subtitle={t(lang, 'money.subtitle')} actions={yearNav} />

      {empty ? (
        <EmptyState
          title={t(lang, 'money.emptyTitle')}
          body={t(lang, 'money.emptyBody')}
          action={<ExpenseForm lang={lang} defaultCurrency={settings.defaultCurrency} deals={deals.map((d) => ({ id: d.id, title: d.title }))} />}
        />
      ) : (
        <>
          <Statements money={money} lang={lang} />
          <Owed money={money} lang={lang} />
          <ByMonth money={money} lang={lang} />
          <ByBrand money={money} lang={lang} />
          <section aria-labelledby="ledger-title" className="space-y-4">
            <SectionTitle id="ledger-title">{t(lang, 'money.ledger')}</SectionTitle>
            <ExpenseForm lang={lang} defaultCurrency={settings.defaultCurrency} deals={deals.map((d) => ({ id: d.id, title: d.title }))} />
            <Ledger money={money} lang={lang} />
          </section>
        </>
      )}
    </div>
  );
}

/** One statement per currency, read like a bank statement: what came in, what is still due, what went out, what is left. */
function Statements({ money, lang }: { money: MoneySummary; lang: Lang }) {
  return (
    <section aria-label={t(lang, 'money.title')} className="grid gap-4 sm:grid-cols-2">
      {money.currencies.map((c) => {
        const line = (key: Key, value: number, extra?: string) => (
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-ink-soft">{t(lang, key)}{extra && <span className="ms-1.5 text-sm">({extra})</span>}</dt>
            <dd className="font-medium tabular-nums"><bdi>{formatMoney(value, c.currency, lang)}</bdi></dd>
          </div>
        );
        return (
          <div key={c.currency} className={`${panel} p-5`}>
            <h2 className="text-sm font-semibold text-ink-soft">{t(lang, 'money.inCurrency').replace('{c}', c.currency)}</h2>
            <dl className="mt-2 divide-y divide-line">
              {line('money.received', c.received)}
              {line('money.owed', c.owed, t(lang, 'money.owedNote'))}
              {line('money.expenses', c.expenses)}
              <div className="flex items-baseline justify-between gap-4 pt-3">
                <dt className="font-semibold">{t(lang, 'money.profit')}</dt>
                <dd className={`text-xl font-semibold tabular-nums ${c.profit < 0 ? 'text-danger' : ''}`}><bdi>{formatMoney(c.profit, c.currency, lang)}</bdi></dd>
              </div>
            </dl>
          </div>
        );
      })}
    </section>
  );
}

function Owed({ money, lang }: { money: MoneySummary; lang: Lang }) {
  if (money.owedItems.length === 0) return null;
  return (
    <section aria-labelledby="owed-title">
      <SectionTitle id="owed-title">{t(lang, 'money.owedTitle')}</SectionTitle>
      <ul className={list}>
        {money.owedItems.map((o, i) => (
          <li key={`${o.dealId}-${i}`}>
            <Link href={o.source === 'own' ? `/deals/${o.dealId}` : '/deals?source=peak'} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2 sm:px-5">
              <span className="flex min-w-0 items-center gap-2">
                <bdi dir="auto" className="truncate font-medium">{o.title}</bdi>
                {o.source === 'peak' && <PeakTag lang={lang} />}
              </span>
              <span className="shrink-0 font-medium tabular-nums"><bdi>{formatMoney(o.owed, o.currency, lang)}</bdi></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ByMonth({ money, lang }: { money: MoneySummary; lang: Lang }) {
  if (money.months.length === 0) return null;
  return (
    <section aria-labelledby="months-title">
      <SectionTitle id="months-title">{t(lang, 'money.byMonth')}</SectionTitle>
      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-line text-sm text-ink-soft">
              <th scope="col" className="px-4 py-2.5 text-start font-medium">{t(lang, 'money.month')}</th>
              <th scope="col" className="px-4 py-2.5 text-end font-medium">{t(lang, 'money.received')}</th>
              <th scope="col" className="px-4 py-2.5 text-end font-medium">{t(lang, 'money.expenses')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {money.months.map((m) => (
              <tr key={`${m.month}-${m.currency}`}>
                <th scope="row" className="px-4 py-2.5 text-start font-medium">{monthName(m.month, lang)}</th>
                <td className="px-4 py-2.5 text-end tabular-nums"><bdi>{m.received ? formatMoney(m.received, m.currency, lang) : '—'}</bdi></td>
                <td className="px-4 py-2.5 text-end tabular-nums text-ink-soft"><bdi>{m.expenses ? formatMoney(m.expenses, m.currency, lang) : '—'}</bdi></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ByBrand({ money, lang }: { money: MoneySummary; lang: Lang }) {
  if (money.byBrand.length === 0) return null;
  return (
    <section aria-labelledby="brands-title">
      <SectionTitle id="brands-title">{t(lang, 'money.byBrand')}</SectionTitle>
      <ul className={list}>
        {money.byBrand.map((b) => (
          <li key={`${b.source}-${b.brand}-${b.currency}`} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
            <span className="flex min-w-0 items-center gap-2">
              {b.source === 'peak'
                ? <><span className="font-medium">{t(lang, 'money.peakDeals')}</span><PeakTag lang={lang} /></>
                : <bdi dir="auto" className="truncate font-medium">{b.brand ?? t(lang, 'money.noBrand')}</bdi>}
            </span>
            <span className="shrink-0 font-medium tabular-nums"><bdi>{formatMoney(b.received, b.currency, lang)}</bdi></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ledger({ money, lang }: { money: MoneySummary; lang: Lang }) {
  if (money.ledger.length === 0) return null;
  return (
    <ul className={list}>
      {money.ledger.map((l) => {
        const out = l.kind === 'expense';
        const label = l.kind === 'expense' ? t(lang, expenseCategoryKey(l.label as ExpenseCategory)) : l.label;
        return (
          <li key={`${l.kind}-${l.id}`} className="flex items-center gap-3 px-4 py-2 sm:px-5">
            <div className="min-w-0 flex-1 py-1.5">
              <p className="flex items-center gap-2">
                <bdi dir="auto" className="truncate font-medium">{label}</bdi>
                {l.kind === 'peak_payout' && <PeakTag lang={lang} />}
              </p>
              <p className="truncate text-sm text-ink-soft">
                <bdi>{formatDate(l.date, lang)}</bdi>
                <span aria-hidden="true"> · </span>{t(lang, `money.kind.${l.kind}`)}
                {l.detail && <><span aria-hidden="true"> · </span><bdi dir="auto">{l.detail}</bdi></>}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`font-medium tabular-nums ${out ? 'text-ink-soft' : ''}`}><bdi>{out ? '−' : ''}{formatMoney(l.amount, l.currency, lang)}</bdi></span>
              {l.status && l.status !== 'paid' && <StatusBadge lang={lang} payout={l.status} />}
            </div>
            {l.deletable && <DeleteEntry lang={lang} path={`${l.kind === 'payment' ? 'payments' : 'expenses'}/${l.id}/delete`} label={label} />}
          </li>
        );
      })}
    </ul>
  );
}
