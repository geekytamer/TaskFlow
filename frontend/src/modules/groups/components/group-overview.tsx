'use client';

/**
 * The group seen as a portfolio, not as one big company.
 *
 * An owner of several companies asks comparative questions — which company is
 * behind, where the money sits, what needs them today — so this screen ranks
 * the companies against each other rather than only adding them up. Money is
 * shown per currency: companies need not share one, and adding across them
 * would be a made-up number.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany } from '@/context/company-context';
import { useGroupScope } from '@/context/group-scope-context';
import { useI18n } from '@/context/i18n-context';
import { CurrencyAmount } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { getGroupDashboardPayload, type GroupDashboard } from '@/services/dashboardService';
import { GroupCompanyFilter } from './group-company-filter';

/** The columns a group is read by, in the order an owner asks about them. */
const COLUMNS: Array<{ metricId: string; en: string; ar: string; money?: boolean; bad?: boolean }> = [
  { metricId: 'open-tasks', en: 'Open tasks', ar: 'مهام مفتوحة' },
  { metricId: 'overdue-tasks', en: 'Overdue', ar: 'متأخرة', bad: true },
  { metricId: 'open-receivables', en: 'Unpaid invoices', ar: 'فواتير غير محصلة', money: true },
  { metricId: 'open-payables', en: 'Bills to pay', ar: 'فواتير مستحقة', money: true },
  { metricId: 'low-stock-items', en: 'Low stock', ar: 'مخزون منخفض', bad: true },
];

export function GroupOverview() {
  const { group, companyIds, companyName, leaveGroup } = useGroupScope();
  const { companies, setSelectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const router = useRouter();
  const [data, setData] = React.useState<GroupDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sortBy, setSortBy] = React.useState<string | null>(null);

  const groupId = group?.id ?? null;
  const filterKey = companyIds.join(',');

  React.useEffect(() => {
    if (!groupId) return;
    let active = true;
    setLoading(true);
    getGroupDashboardPayload(groupId, companyIds)
      .then((rolled) => {
        if (active) setData(rolled);
      })
      .catch(() => {
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, filterKey]);

  if (!group) return null;

  const figure = (companyId: string, metricId: string) =>
    data?.perCompany.find((c) => c.id === companyId)?.metrics.find((m) => m.id === metricId)?.value ?? 0;

  const currencies = new Set((data?.perCompany ?? []).map((c) => c.currencyCode || 'USD'));
  const manyCurrencies = currencies.size > 1;
  // Ranking by money across currencies would compare 4,000 USD with 2,000 OMR,
  // so a mixed group is ranked by work until the reader asks for money.
  const sortMetric = sortBy ?? (manyCurrencies ? 'open-tasks' : 'open-receivables');
  const sortedColumn = COLUMNS.find((c) => c.metricId === sortMetric);

  /** Currencies ordered by what the group holds in them, biggest first. */
  const currencyOrder = [...currencies].sort(
    (a, b) =>
      (data?.perCompany ?? []).filter((c) => (c.currencyCode || 'USD') === b).reduce((sum, c) => sum + figure(c.id, sortMetric), 0) -
      (data?.perCompany ?? []).filter((c) => (c.currencyCode || 'USD') === a).reduce((sum, c) => sum + figure(c.id, sortMetric), 0),
  );

  const rows = [...(data?.perCompany ?? [])].sort((a, b) => {
    // On a money column, companies cluster under their currency and are ranked
    // inside it: two currencies are never put in one order.
    if (sortedColumn?.money && manyCurrencies) {
      const byCurrency =
        currencyOrder.indexOf(a.currencyCode || 'USD') - currencyOrder.indexOf(b.currencyCode || 'USD');
      if (byCurrency !== 0) return byCurrency;
    }
    const diff = figure(b.id, sortMetric) - figure(a.id, sortMetric);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  /**
   * The biggest figure a bar is measured against: within the same currency for
   * money, across the group for plain counts.
   */
  const peak = (metricId: string, currencyCode?: string) =>
    Math.max(
      ...rows
        .filter((r) => !currencyCode || (r.currencyCode || 'USD') === currencyCode)
        .map((r) => figure(r.id, metricId)),
      0,
    );

  /**
   * Going into one company to act on what the group view showed. The group is
   * left behind: you are working in that company now, and the switcher says
   * so. Coming back is picking the group again.
   */
  const enterCompany = (companyId: string, href = '/') => {
    const company = companies.find((c) => c.id === companyId);
    if (!company) return;
    setSelectedCompany(company);
    leaveGroup();
    router.push(href);
  };
  const canEnter = (companyId: string) => companies.some((c) => c.id === companyId);

  const columnsWithFigures = COLUMNS.filter((column) => rows.some((r) => figure(r.id, column.metricId) !== 0));
  const shown = columnsWithFigures.length ? columnsWithFigures : COLUMNS.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{tr('Group Overview', 'نظرة عامة على المجموعة')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr(
              `${group.name} · ${companyIds.length} ${companyIds.length === 1 ? 'company' : 'companies'}`,
              `${group.name} · ${companyIds.length} ${companyIds.length === 1 ? 'شركة' : 'شركات'}`,
            )}
          </p>
        </div>
        <GroupCompanyFilter />
      </div>

      {loading && !data && (
        <div className="space-y-3" aria-busy="true" aria-label={tr('Loading', 'جارٍ التحميل')}>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {data && (
        <>
          {data.observations.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.observations.map((o) => (
                <li key={o.id} className="flex items-start gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>{o.text}</span>
                </li>
              ))}
            </ul>
          )}

          {data.money.some((line) => line.byCurrency.some((row) => row.value !== 0)) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{tr('Money', 'الأموال')}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {tr(
                    'Totalled per currency — companies in different currencies are never added together.',
                    'الإجمالي لكل عملة — لا تُجمع الشركات ذات العملات المختلفة معًا.',
                  )}
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {data.money.map((line) =>
                  line.byCurrency
                    // A row of zeroes says nothing; the companies table still has it.
                    .filter((row) => row.value !== 0)
                    .map((row) => (
                    <div key={`${line.metricId}-${row.currencyCode}`} className="rounded-xl border bg-muted/30 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{line.label}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        <CurrencyAmount value={row.value} currencyCode={row.currencyCode} />
                      </p>
                      {/* Always name the currency: two cards can carry the same
                          label, and a number alone would not say which is which. */}
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">{row.currencyCode}</span>
                        {' · '}
                        {row.companyIds.length === 1
                          ? companyName(row.companyIds[0])
                          : tr(
                              `${row.companyIds.length} companies`,
                              `${row.companyIds.length} شركات`,
                            )}
                      </p>
                    </div>
                  )),
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{tr('Companies', 'الشركات')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {sortedColumn?.money && manyCurrencies
                  ? tr(
                      'Money columns rank each company within its own currency. Open a company to work in it.',
                      'أعمدة الأموال ترتّب كل شركة ضمن عملتها. افتح شركة للعمل فيها.',
                    )
                  : tr('Sorted by the column you choose. Open a company to work in it.', 'مرتبة حسب العمود الذي تختاره. افتح شركة للعمل فيها.')}
              </p>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-4 py-2 text-start font-medium">{tr('Company', 'الشركة')}</th>
                      {shown.map((column) => (
                        <th key={column.metricId} scope="col" className="px-4 py-2 text-end font-medium">
                          <button
                            type="button"
                            onClick={() => setSortBy(column.metricId)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              sortMetric === column.metricId && 'text-foreground underline underline-offset-4',
                            )}
                            aria-label={tr(`Sort by ${column.en}`, `ترتيب حسب ${column.ar}`)}
                          >
                            {tr(column.en, column.ar)}
                          </button>
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-muted/40">
                        <th scope="row" className="px-4 py-3 text-start font-medium">
                          <span className="block truncate">{row.name}</span>
                          {row.currencyCode && (
                            <span className="text-xs font-normal text-muted-foreground">{row.currencyCode}</span>
                          )}
                        </th>
                        {shown.map((column) => {
                          const value = figure(row.id, column.metricId);
                          const top = peak(column.metricId, column.money ? row.currencyCode || 'USD' : undefined);
                          return (
                            <td key={column.metricId} className="px-4 py-3 text-end align-middle">
                              <span
                                className={cn(
                                  'block tabular-nums',
                                  value === 0 && 'text-muted-foreground',
                                  column.bad && value > 0 && 'font-semibold text-amber-600 dark:text-amber-400',
                                )}
                              >
                                {column.money ? <CurrencyAmount value={value} currencyCode={row.currencyCode} /> : value}
                              </span>
                              {/* How much of the group's biggest figure this company holds. */}
                              {top > 0 && (
                                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                  <span
                                    className={cn('block h-full rounded-full', column.bad ? 'bg-amber-500/70' : 'bg-primary/60')}
                                    style={{ width: `${Math.round((value / top) * 100)}%` }}
                                  />
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-end">
                          {canEnter(row.id) ? (
                            <Button size="sm" variant="ghost" className="gap-1" onClick={() => enterCompany(row.id)}>
                              {tr('Open', 'فتح')}
                              <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">{tr('No access', 'لا وصول')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={shown.length + 2} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          {tr('No company in this group reports to you yet.', 'لا توجد شركة في هذه المجموعة ترفع تقاريرها إليك بعد.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {data.payload.alerts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{tr('Needs attention', 'يحتاج انتباهك')}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {tr('Across every company of the group, the worst first.', 'عبر كل شركات المجموعة، الأهم أولًا.')}
                </p>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <ul className="divide-y">
                  {data.payload.alerts.slice(0, 8).map((alert) => {
                    const companyId = alert.id.split(':')[0];
                    return (
                      <li key={alert.id} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            alert.severity === 'critical' ? 'bg-red-500' : alert.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500',
                          )}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{alert.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{alert.detail}</p>
                        </div>
                        {alert.route && canEnter(companyId) && (
                          <Button size="sm" variant="ghost" className="shrink-0 gap-1" onClick={() => enterCompany(companyId, alert.route)}>
                            {tr('Open', 'فتح')}
                            <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {data.missing.length > 0 && (
            <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
              {tr(
                `Not counted: ${data.missing.map((c) => c.name).join(', ')} — you don't have a company-wide view there.`,
                `غير محتسب: ${data.missing.map((c) => c.name).join('، ')} — ليس لديك عرض على مستوى الشركة هناك.`,
              )}
            </p>
          )}

          {loading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              {tr('Refreshing', 'يجري التحديث')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
