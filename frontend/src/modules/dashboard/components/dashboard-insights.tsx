'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardInsights, InsightKpi } from '@/services/dashboardService';

type Tr = (en: string, ar: string) => string;

// Fixed series colours (charts cannot read CSS variables).
const C = { billed: '#2a78d6', collected: '#1baf7a', spent: '#eb6834', created: '#b4b2a9', done: '#2a78d6', late: '#e34948', grid: 'hsl(var(--border))', tick: 'hsl(var(--muted-foreground))' };
const STAGE_COLOURS = ['#b5d4f4', '#85b7eb', '#378add', '#185fa5'];

const locale = (lang: string) => (lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-US');
const money = (n: number, currency: string, lang: string) =>
  new Intl.NumberFormat(locale(lang), { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
const compact = (n: number, lang: string) => new Intl.NumberFormat(locale(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const monthLabel = (key: string, lang: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { month: 'short' });
};
const dayLabel = (iso: string, lang: string) =>
  new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Counts from the last shown value up (or down) to the new one. */
export function useCountUp(target: number, duration = 700) {
  const [value, setValue] = React.useState(prefersReducedMotion() ? target : 0);
  const from = React.useRef(value);
  React.useEffect(() => {
    if (prefersReducedMotion()) { setValue(target); return; }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (target - origin) * eased;
      setValue(next);
      from.current = next;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

/** A small line of the monthly points; newest on the reading end, like the charts. */
function Sparkline({ points: raw, colour, rtl }: { points: number[]; colour: string; rtl: boolean }) {
  if (raw.length < 2) return null;
  const points = rtl ? [...raw].reverse() : raw;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((p, i) => `${(i / (points.length - 1)) * 100},${22 - ((p - min) / span) * 18}`).join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="mt-2 h-6 w-full" aria-hidden="true">
      <polyline points={xy} fill="none" stroke={colour} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Whole class names, so Tailwind keeps them.
const KPI_COLUMNS: Record<number, string> = { 1: '', 2: '', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4' };

const KPI_ROUTES: Record<InsightKpi['id'], string> = {
  revenue: '/finance?tab=invoices',
  collected: '/finance?tab=invoices',
  'net-cash': '/finance',
  receivables: '/finance?tab=invoices',
  'won-deals': '/crm/pipeline',
  'tasks-done': '/tasks',
  'on-time': '/tasks',
};

function kpiLabel(id: InsightKpi['id'], tr: Tr) {
  return {
    revenue: tr('Billed', 'الإيرادات المفوترة'),
    collected: tr('Collected', 'المحصّل'),
    'net-cash': tr('Net cash flow', 'صافي التدفق النقدي'),
    receivables: tr('Owed by clients', 'المستحق على العملاء'),
    'won-deals': tr('Deals won', 'صفقات مكسوبة'),
    'tasks-done': tr('Tasks finished', 'مهام أُنجزت'),
    'on-time': tr('Finished on time', 'أُنجزت في وقتها'),
  }[id];
}

function KpiCard({ kpi, data, tr, language, index }: { kpi: InsightKpi; data: DashboardInsights; tr: Tr; language: string; index: number }) {
  const shown = useCountUp(kpi.value);
  const text = kpi.format === 'currency'
    ? money(shown, data.currency, language)
    : kpi.format === 'percent' ? `${Math.round(shown)}%` : Math.round(shown).toLocaleString(locale(language));

  // A change against the window before: percent for amounts and counts, points for a rate.
  let delta: { text: string; good: boolean | null } | null = null;
  if (kpi.previous !== null) {
    if (kpi.format === 'percent') {
      const d = Math.round(kpi.value - kpi.previous);
      delta = { text: tr(`${d >= 0 ? '+' : ''}${d} pts`, `${d >= 0 ? '+' : ''}${d} نقطة`), good: d === 0 ? null : d > 0 };
    } else if (kpi.previous !== 0) {
      const d = Math.round(((kpi.value - kpi.previous) / Math.abs(kpi.previous)) * 100);
      delta = { text: `${d >= 0 ? '+' : ''}${d}%`, good: d === 0 ? null : d > 0 };
    } else if (kpi.value !== 0) {
      delta = { text: tr('new', 'جديد'), good: kpi.value > 0 };
    }
  }
  const periodWord = { 30: tr('vs the 30 days before', 'عن الـ 30 يوم اللي قبل'), 90: tr('vs the 90 days before', 'عن الـ 90 يوم اللي قبل'), 365: tr('vs the year before', 'عن السنة اللي قبل') }[data.days];

  let sub: string | null = null;
  if (kpi.sub?.kind === 'dso') sub = kpi.sub.value === null ? tr('No billing in 90 days', 'ما فيه فوترة خلال 90 يوم') : tr(`Paid in ${kpi.sub.value} days on average`, `يدفعون خلال ${kpi.sub.value} يوم بالمتوسط`);
  if (kpi.sub?.kind === 'winRate') sub = kpi.sub.value === null ? tr('No deals closed yet', 'ما انقفلت صفقات لسا') : tr(`Win rate ${kpi.sub.value}%`, `نسبة الفوز ${kpi.sub.value}%`);
  if (kpi.sub?.kind === 'count') sub = tr(`${kpi.sub.value} tasks with a due date`, `${kpi.sub.value} مهمة لها موعد`);

  const negative = kpi.id === 'net-cash' && kpi.value < 0;
  const sparkColour = delta?.good === false ? C.late : C.collected;
  const Icon = delta?.good === null || !delta ? Minus : delta.good ? ArrowUpRight : ArrowDownRight;

  return (
    <Link
      href={KPI_ROUTES[kpi.id]}
      className="tf-rise tf-lift block rounded-2xl border border-border bg-card p-4 focus:outline-none focus:ring-2 focus:ring-ring/40"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <p className="text-xs font-medium text-muted-foreground">{kpiLabel(kpi.id, tr)}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${negative ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>{text}</p>
      {delta && (
        <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${delta.good === null ? 'text-muted-foreground' : delta.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{delta.text}</span>
          <span className="font-normal text-muted-foreground">{periodWord}</span>
        </p>
      )}
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {kpi.spark && <Sparkline points={kpi.spark} colour={sparkColour} rtl={language === 'ar'} />}
    </Link>
  );
}

function Panel({ title, note, legend, children, index, className = '' }: { title: string; note?: string; legend?: Array<[string, string]>; children: React.ReactNode; index: number; className?: string }) {
  return (
    <section className={`tf-rise flex flex-col rounded-2xl border border-border bg-card p-5 ${className}`} style={{ animationDelay: `${120 + index * 70}ms` }}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
        </div>
        {legend && (
          <div className="flex flex-wrap gap-3">
            {legend.map(([colour, label]) => (
              <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colour }} />{label}
              </span>
            ))}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ tr }: { tr: Tr }) {
  return <p className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">{tr('Nothing in this period yet.', 'ما فيه شي في هالفترة لسا.')}</p>;
}

/** The KPI row and the charts behind it. Each section shows only when the server sent it (role and modules). */
export function DashboardInsightsView({ data, tr, language }: { data: DashboardInsights; tr: Tr; language: string }) {
  const m = (n: number) => money(n, data.currency, language);
  const rtl = language === 'ar';
  const axis = { tickLine: false, axisLine: false, fontSize: 12, stroke: C.tick } as const;
  const panels: React.ReactNode[] = [];
  let i = 0;

  if (data.cashflow) {
    const rows = data.cashflow.map((p) => ({ ...p, label: monthLabel(p.month, language) }));
    const any = rows.some((r) => r.billed || r.collected || r.spent);
    panels.push(
      <Panel key="cash" index={i++} className="lg:col-span-2" title={tr('Cash flow by month', 'التدفق النقدي بالشهر')} note={tr('Invoices issued, money received, and money paid out.', 'الفواتير الصادرة، والمبالغ المحصّلة، والمبالغ المدفوعة.')}
        legend={[[C.billed, tr('Billed', 'مفوتر')], [C.collected, tr('Collected', 'محصّل')], [C.spent, tr('Spent', 'مصروف')]]}>
        {any ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tfCollected" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.collected} stopOpacity={0.25} /><stop offset="100%" stopColor={C.collected} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axis} reversed={rtl} />
                <YAxis {...axis} width={48} orientation={rtl ? 'right' : 'left'} tickFormatter={(v) => compact(v, language)} />
                <Tooltip formatter={(v: number) => m(v)} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                <Area type="monotone" dataKey="billed" name={tr('Billed', 'مفوتر')} stroke={C.billed} fill="none" strokeWidth={2} animationDuration={900} />
                <Area type="monotone" dataKey="collected" name={tr('Collected', 'محصّل')} stroke={C.collected} fill="url(#tfCollected)" strokeWidth={2.5} animationDuration={900} />
                <Area type="monotone" dataKey="spent" name={tr('Spent', 'مصروف')} stroke={C.spent} fill="none" strokeWidth={2} strokeDasharray="5 4" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty tr={tr} />}
      </Panel>,
    );
  }

  if (data.pipeline) {
    const max = Math.max(1, ...data.pipeline.map((s) => s.value));
    const stageName = (s: string) => ({ New: tr('New', 'جديد'), Qualified: tr('Qualified', 'مؤهل'), Proposal: tr('Proposal', 'عرض سعر'), Negotiation: tr('Negotiation', 'تفاوض') }[s] ?? s);
    const weighted = data.pipeline.reduce((n, s) => n + s.weighted, 0);
    const open = data.pipeline.reduce((n, s) => n + s.count, 0);
    panels.push(
      <Panel key="pipe" index={i++} title={tr('Sales pipeline', 'خط المبيعات')} note={tr(`Open deals worth ${m(weighted)} by their chances.`, `الصفقات المفتوحة تساوي ${m(weighted)} حسب احتمالها.`)}>
        {open ? (
          <div className="space-y-3">
            {data.pipeline.map((s, k) => (
              <Link key={s.stage} href="/crm/pipeline" className="block rounded-lg hover:bg-muted/40">
                <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-foreground">{stageName(s.stage)} · {s.count}</span><span className="tabular-nums text-muted-foreground">{m(s.value)}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, backgroundColor: STAGE_COLOURS[k] }} />
                </div>
              </Link>
            ))}
            {data.staleDeals ? <p className="pt-1 text-xs text-amber-600 dark:text-amber-400">{tr(`${data.staleDeals} deals not touched in 14 days`, `${data.staleDeals} صفقات ما تحركت من 14 يوم`)}</p> : null}
          </div>
        ) : <Empty tr={tr} />}
      </Panel>,
    );
  }

  if (data.forecast) {
    const f = data.forecast;
    const rows = f.weeks.map((w) => ({ ...w, label: dayLabel(w.from, language) }));
    const any = rows.some((r) => r.incoming || r.outgoing);
    panels.push(
      <Panel key="fc" index={i++} title={tr('Cash in the next 30 days', 'النقد خلال 30 يوم الجاية')} note={tr('What clients are due to pay and what is due to suppliers, by week.', 'اللي على العملاء يدفعونه واللي علينا للموردين، كل أسبوع.')}
        legend={[[C.collected, tr('In', 'داخل')], [C.spent, tr('Out', 'خارج')]]}>
        {any ? (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axis} reversed={rtl} />
                <YAxis {...axis} width={44} orientation={rtl ? 'right' : 'left'} tickFormatter={(v) => compact(v, language)} />
                <Tooltip formatter={(v: number) => m(v)} contentStyle={{ borderRadius: 10, fontSize: 12 }} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                <Bar dataKey="incoming" name={tr('In', 'داخل')} fill={C.collected} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="outgoing" name={tr('Out', 'خارج')} fill={C.spent} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty tr={tr} />}
        {(f.overdueIncoming > 0 || f.overdueOutgoing > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {f.overdueIncoming > 0 && <Link href="/finance?tab=invoices" className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{tr(`Overdue from clients ${m(f.overdueIncoming)}`, `متأخر على العملاء ${m(f.overdueIncoming)}`)}</Link>}
            {f.overdueOutgoing > 0 && <Link href="/finance?tab=payables" className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{tr(`Overdue to suppliers ${m(f.overdueOutgoing)}`, `متأخر للموردين ${m(f.overdueOutgoing)}`)}</Link>}
          </div>
        )}
      </Panel>,
    );
  }

  if (data.throughput) {
    const rows = data.throughput.map((w) => ({ ...w, label: dayLabel(w.week, language) }));
    const any = rows.some((r) => r.created || r.completed);
    panels.push(
      <Panel key="tp" index={i++} title={data.variant === 'Employee' ? tr('Your tasks by week', 'مهامك بالأسبوع') : tr('Tasks by week', 'المهام بالأسبوع')} note={tr('New tasks against finished ones, the last 8 weeks.', 'المهام الجديدة مقابل اللي خلصت، آخر 8 أسابيع.')}
        legend={[[C.created, tr('New', 'جديدة')], [C.done, tr('Finished', 'خلصت')]]}>
        {any ? (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axis} reversed={rtl} interval="preserveStartEnd" />
                <YAxis {...axis} allowDecimals={false} width={28} orientation={rtl ? 'right' : 'left'} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                <Bar dataKey="created" name={tr('New', 'جديدة')} fill={C.created} radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="completed" name={tr('Finished', 'خلصت')} fill={C.done} radius={[4, 4, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty tr={tr} />}
      </Panel>,
    );
  }

  if (data.team) {
    const max = Math.max(1, ...data.team.map((r) => r.open));
    panels.push(
      <Panel key="team" index={i++} title={tr('Team load', 'ضغط الفريق')} note={tr('Open tasks per person; red is late.', 'المهام المفتوحة لكل شخص؛ الأحمر متأخر.')}>
        {data.team.length ? (
          <div className="space-y-2.5">
            {data.team.map((r) => (
              <div key={r.userId}>
                <div className="mb-1 flex justify-between text-xs"><span className="truncate font-medium text-foreground">{r.name}</span><span className="tabular-nums text-muted-foreground">{r.open}{r.overdue ? <span className="text-rose-600 dark:text-rose-400"> · {tr(`${r.overdue} late`, `${r.overdue} متأخرة`)}</span> : null}</span></div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(8, (r.open / max) * 100)}%` }}>
                  <div className="h-full" style={{ width: `${((r.open - r.overdue) / r.open) * 100}%`, backgroundColor: C.done }} />
                  <div className="h-full" style={{ width: `${(r.overdue / r.open) * 100}%`, backgroundColor: C.late }} />
                </div>
              </div>
            ))}
          </div>
        ) : <Empty tr={tr} />}
      </Panel>,
    );
  }

  if (data.topClients) {
    panels.push(
      <Panel key="top" index={i++} title={tr('Top clients', 'أكبر العملاء')} note={tr('By what was billed in this period.', 'حسب المفوتر في هالفترة.')}>
        {data.topClients.length ? (
          <ol className="space-y-2.5">
            {data.topClients.map((c, k) => (
              <li key={c.clientId}>
                <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate font-medium text-foreground">{k + 1}. {c.name || tr('Unnamed client', 'عميل بدون اسم')}</span><span className="shrink-0 tabular-nums text-muted-foreground">{m(c.billed)} · {c.share}%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${c.share}%`, backgroundColor: C.billed }} /></div>
              </li>
            ))}
          </ol>
        ) : <Empty tr={tr} />}
      </Panel>,
    );
  }

  return (
    <>
      {data.kpis.length > 0 && (
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${KPI_COLUMNS[Math.min(data.kpis.length, 4)]}`} data-tutorial="dash-kpis">
          {data.kpis.map((kpi, k) => <KpiCard key={kpi.id} kpi={kpi} data={data} tr={tr} language={language} index={k} />)}
        </div>
      )}
      {panels.length > 0 && <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{panels}</div>}
    </>
  );
}

/** Grey shapes where the figures will land, instead of a line of text. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, k) => <div key={k} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-2xl bg-muted lg:col-span-2" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
