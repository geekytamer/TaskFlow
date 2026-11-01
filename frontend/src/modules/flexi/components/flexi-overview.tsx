'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, Download, Megaphone, Snowflake } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { getFlexiOverview, listFlexiAccounts, type FlexiOverview, type FlexiPeriod } from '@/services/flexiService';
import { money, PageTitle, RequestLink, shortDate, UsageBar, useTr, type Tr } from './flexi-ui';
import { downloadAccountsCsv } from './flexi-csv';

// Fixed series colours (charts cannot read CSS variables): approved, used / approved, rejected, waiting.
const C = { approved: '#2a78d6', used: '#eb6834', ok: '#1baf7a', bad: '#e34948', wait: '#b4b2a9', warn: '#eda100', grid: 'hsl(var(--border))', tick: 'hsl(var(--muted-foreground))' };

const monthLabel = (key: string, lang: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { month: 'short' });
};

const compact = (n: number, lang: string) => new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Peak Flexi at a glance: what is lent out, how it is used, how fast applications move, and what needs someone today. */
export function FlexiOverviewPage() {
  const { tr, language } = useTr();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [days, setDays] = React.useState<FlexiPeriod>(90);
  const [data, setData] = React.useState<FlexiOverview | null>(null);

  React.useEffect(() => {
    if (!selectedCompany) return;
    let live = true;
    getFlexiOverview(selectedCompany.id, days)
      .then((d) => { if (live) setData(d); })
      .catch((error) => toast({ title: error instanceof Error ? error.message : String(error), variant: 'destructive' }));
    return () => { live = false; };
  }, [selectedCompany, days, toast]);

  async function exportCsv() {
    if (!selectedCompany) return;
    try {
      downloadAccountsCsv(await listFlexiAccounts(selectedCompany.id), language);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not export', 'تعذّر التصدير'), variant: 'destructive' });
    }
  }

  const header = (
    <PageTitle
      title={tr('Peak Flexi', 'بيك فلكسي')}
      subtitle={tr('Balances, usage, applications and risk.', 'الأرصدة والاستخدام والطلبات والمخاطر.')}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as FlexiPeriod)}>
            <TabsList>
              <TabsTrigger value="30">{tr('30 days', '30 يوم')}</TabsTrigger>
              <TabsTrigger value="90">{tr('90 days', '90 يوم')}</TabsTrigger>
              <TabsTrigger value="365">{tr('Year', 'سنة')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="me-1 h-4 w-4" />{tr('Export accounts', 'صدّر الحسابات')}</Button>
        </div>
      )}
    />
  );
  if (!data) return <div className="space-y-6">{header}<p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p></div>;

  const { kpis, currency } = data;
  const m = (n: number) => money(n, currency, language);
  const periodWord = { 30: tr('the 30 days before', 'الـ 30 يوم اللي قبل'), 90: tr('the 90 days before', 'الـ 90 يوم اللي قبل'), 365: tr('the year before', 'السنة اللي قبل') }[data.days];

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label={tr('Approved balance', 'الأرصدة المعتمدة')} value={m(kpis.balance.value)} delta={change(kpis.balance.value, kpis.balance.previous)} vs={periodWord} tr={tr} />
        <Kpi label={tr('Used', 'المستخدم')} value={`${m(kpis.used.value)} · ${kpis.utilisation.value}%`} delta={points(kpis.utilisation.value, kpis.utilisation.previous, tr)} vs={periodWord} tr={tr} neutral />
        <Kpi label={tr('Available', 'المتاح')} value={m(kpis.available.value)} note={tr(`${kpis.accounts.active} active, ${kpis.accounts.frozen} frozen`, `${kpis.accounts.active} نشط، ${kpis.accounts.frozen} موقوف`)} tr={tr} />
        <Kpi label={tr('Overdue from Flexi clients', 'متأخر من عملاء فلكسي')} value={m(kpis.overdue.amount)} tone={kpis.overdue.amount > 0 ? 'danger' : undefined}
          note={tr(`${kpis.overdue.invoices} invoices, ${kpis.overdue.clients} clients`, `${kpis.overdue.invoices} فواتير، ${kpis.overdue.clients} عملاء`)} tr={tr} />
        <Kpi label={tr('Approval rate', 'نسبة الموافقة')} value={kpis.approvalRate.decided ? `${kpis.approvalRate.value}%` : '…'}
          note={tr(`${kpis.approvalRate.approved} of ${kpis.approvalRate.decided} decided`, `${kpis.approvalRate.approved} من ${kpis.approvalRate.decided} طلب`)} tr={tr} />
        <Kpi label={tr('Average time to decide', 'متوسط وقت الرد')} value={kpis.avgDecisionDays.value === null ? '…' : tr(`${kpis.avgDecisionDays.value} days`, `${kpis.avgDecisionDays.value} يوم`)}
          delta={kpis.avgDecisionDays.value !== null && kpis.avgDecisionDays.previous !== null ? faster(kpis.avgDecisionDays.value, kpis.avgDecisionDays.previous, tr) : undefined} vs={periodWord}
          note={tr(`${kpis.waiting} waiting now`, `${kpis.waiting} ينتظر الحين`)} tr={tr} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{tr('Approved balance and what is used', 'الرصيد المعتمد والمستخدم')}</CardTitle><Legend items={[[C.approved, tr('Approved', 'معتمد')], [C.used, tr('Used', 'مستخدم')]]} /></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend.map((p) => ({ ...p, label: monthLabel(p.month, language) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke={C.tick} reversed={language === 'ar'} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke={C.tick} width={44} orientation={language === 'ar' ? 'right' : 'left'} tickFormatter={(v) => compact(v, language)} />
                <Tooltip formatter={(v: number) => m(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="approved" name={tr('Approved', 'معتمد')} stroke={C.approved} fill={C.approved} fillOpacity={0.1} strokeWidth={2} />
                <Area type="monotone" dataKey="used" name={tr('Used', 'مستخدم')} stroke={C.used} fill={C.used} fillOpacity={0.08} strokeWidth={2} strokeDasharray="5 4" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{tr('Applications by month', 'الطلبات بالشهر')}</CardTitle><Legend items={[[C.ok, tr('Approved', 'موافَق')], [C.bad, tr('Rejected', 'مرفوض')], [C.wait, tr('Waiting', 'ينتظر')]]} /></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.applicationsByMonth.map((p) => ({ ...p, label: monthLabel(p.month, language) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke={C.tick} reversed={language === 'ar'} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke={C.tick} width={28} orientation={language === 'ar' ? 'right' : 'left'} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="approved" name={tr('Approved', 'موافَق')} stackId="a" fill={C.ok} maxBarSize={24} />
                <Bar dataKey="rejected" name={tr('Rejected', 'مرفوض')} stackId="a" fill={C.bad} maxBarSize={24} />
                <Bar dataKey="pending" name={tr('Waiting', 'ينتظر')} stackId="a" fill={C.wait} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{tr('Accounts by how much they use', 'الحسابات حسب نسبة الاستخدام')}</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.utilisation.map((u) => ({ ...u, label: u.bucket === 'over-100' ? tr('Over 100%', 'فوق 100%') : `${u.bucket}%` }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke={C.tick} reversed={language === 'ar'} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke={C.tick} width={28} orientation={language === 'ar' ? 'right' : 'left'} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [v, tr('Accounts', 'حسابات')]} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}
                  shape={(props: unknown) => {
                    const p = props as { x: number; y: number; width: number; height: number; payload: { bucket: string } };
                    const fill = p.payload.bucket === 'over-100' ? C.bad : p.payload.bucket === '80-100' ? C.warn : C.approved;
                    return <rect x={p.x} y={p.y} width={p.width} height={Math.max(0, p.height)} rx={4} fill={fill} />;
                  }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{tr('From the website to a balance', 'من الموقع لين الرصيد')}</CardTitle><CardDescription>{tr('Companies that applied on the Peak Flexi page, all time.', 'الشركات اللي قدّمت من صفحة بيك فلكسي، من البداية.')}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Funnel tr={tr} steps={[
              [tr('Applied on the website', 'قدّموا من الموقع'), data.funnel.website],
              [tr('Invited to the portal', 'اندعوا للبوابة'), data.funnel.invited],
              [tr('Applied for a balance', 'قدّموا على الرصيد'), data.funnel.applied],
              [tr('Balance activated', 'انفعّل رصيدهم'), data.funnel.activated],
            ]} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{tr('Biggest users', 'أكبر العملاء استخدامًا')}</CardTitle>
            {data.concentration && <CardDescription>{tr(`${data.concentration.name} holds ${data.concentration.share}% of all balances.`, `${data.concentration.name} عنده ${data.concentration.share}% من كل الأرصدة.`)}</CardDescription>}
          </CardHeader>
          <CardContent>
            {data.topClients.length === 0 ? <p className="text-sm text-muted-foreground">{tr('No active accounts yet.', 'ما فيه حسابات نشطة لسا.')}</p> : (
              <ul className="space-y-3 text-sm">
                {data.topClients.map((c) => (
                  <li key={c.contactId} className="space-y-1">
                    <Link href={`/flexi/accounts/${c.contactId}`} className="flex justify-between gap-2 hover:text-primary">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{m(c.used)} / {m(c.balance)} · {c.usedPct}%</span>
                    </Link>
                    <UsageBar pct={c.usedPct} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{tr('Needs attention', 'يحتاج متابعة')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Attention data={data} tr={tr} language={language} m={m} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{tr('Latest on the accounts', 'آخر الأحداث على الحسابات')}</CardTitle></CardHeader>
        <CardContent>
          {data.recentEvents.length === 0 ? <p className="text-sm text-muted-foreground">{tr('Nothing yet.', 'ما فيه شي لسا.')}</p> : (
            <ul className="divide-y text-sm">
              {data.recentEvents.map((e) => (
                <li key={e.id}>
                  <Link href={`/flexi/accounts/${e.contactId}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-primary">
                    <span className="min-w-0 truncate"><span className="font-medium">{e.contactName}</span> · {eventWord(e.kind, tr)}{e.amountAfter !== null && e.kind !== 'applied' && e.kind !== 'terms_accepted' ? ` · ${m(e.amountAfter)}` : ''}</span>
                    <span className="shrink-0 text-muted-foreground">{e.actorName ?? (e.actorPortalUserId ? tr('The client', 'العميل') : '')} · {shortDate(e.createdAt, language)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type Delta = { text: string; good: boolean | null };

const change = (now: number, before: number): Delta | undefined => {
  if (!before) return undefined;
  const p = Math.round(((now - before) / before) * 100);
  return { text: `${p > 0 ? '+' : ''}${p}%`, good: p === 0 ? null : p > 0 };
};
const points = (now: number, before: number, tr: Tr): Delta | undefined => {
  if (!before && !now) return undefined;
  const d = Math.round((now - before) * 10) / 10;
  return { text: tr(`${d > 0 ? '+' : ''}${d} pts`, `${d > 0 ? '+' : ''}${d} نقطة`), good: null };
};
const faster = (now: number, before: number, tr: Tr): Delta => {
  const d = Math.round((before - now) * 10) / 10;
  return d >= 0
    ? { text: tr(`${d} days faster`, `أسرع بـ ${d} يوم`), good: d > 0 ? true : null }
    : { text: tr(`${-d} days slower`, `أبطأ بـ ${-d} يوم`), good: false };
};

function Kpi({ label, value, delta, vs, note, tone, neutral, tr }: { label: string; value: string; delta?: Delta; vs?: string; note?: string; tone?: 'danger'; neutral?: boolean; tr: Tr }) {
  const color = !delta || delta.good === null || neutral ? 'text-muted-foreground' : delta.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  const Arrow = delta?.text.startsWith('-') || delta?.text.includes('slower') || delta?.text.includes('أبطأ') ? ArrowDownRight : ArrowUpRight;
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold tabular-nums ${tone === 'danger' ? 'text-red-600 dark:text-red-400' : ''}`}>{value}</p>
        {delta && <p className={`flex items-center gap-1 text-xs ${color}`}><Arrow className="h-3.5 w-3.5 rtl:-scale-x-100" />{delta.text} {vs && <span className="text-muted-foreground">{tr('vs', 'مقارنة بـ')} {vs}</span>}</p>}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map(([color, label]) => <span key={label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{label}</span>)}
    </div>
  );
}

function Funnel({ steps, tr }: { steps: Array<[string, number]>; tr: Tr }) {
  const top = Math.max(1, steps[0][1]);
  return (
    <ul className="space-y-3 text-sm">
      {steps.map(([label, n], i) => {
        const prev = i > 0 ? steps[i - 1][1] : null;
        return (
          <li key={label} className="space-y-1">
            <div className="flex justify-between gap-2">
              <span>{label}</span>
              <span className="tabular-nums text-muted-foreground">{n}{prev !== null && prev > 0 ? ` · ${Math.round((n / prev) * 100)}% ${tr('of the step before', 'من الخطوة اللي قبل')}` : ''}</span>
            </div>
            <div className="h-2 rounded-sm bg-muted"><div className="h-2 rounded-sm bg-primary" style={{ width: `${(n / top) * 100}%`, opacity: 1 - i * 0.18 }} /></div>
          </li>
        );
      })}
    </ul>
  );
}

function Attention({ data, tr, language, m }: { data: FlexiOverview; tr: Tr; language: string; m: (n: number) => string }) {
  const { alerts } = data;
  const rows: React.ReactNode[] = [];
  if (data.kpis.overdue.amount > 0) {
    rows.push(<Row key="overdue" tone="danger" icon={AlertTriangle} href="/flexi/accounts" text={tr(`${data.kpis.overdue.clients} clients have overdue invoices (${m(data.kpis.overdue.amount)})`, `${data.kpis.overdue.clients} عملاء عندهم فواتير متأخرة (${m(data.kpis.overdue.amount)})`)} />);
  }
  alerts.staleApplications.forEach((a) => rows.push(<Row key={`s-${a.id}`} tone="warn" icon={Clock} href={`/flexi/applications?id=${a.id}`} text={tr(`${a.contactName}: waiting since ${shortDate(a.createdAt, language)}`, `${a.contactName}: ينتظر من ${shortDate(a.createdAt, language)}`)} />));
  alerts.nearLimit.forEach((a) => rows.push(<Row key={`n-${a.contactId}`} tone="warn" icon={AlertTriangle} href={`/flexi/accounts/${a.contactId}`} text={tr(`${a.name}: ${a.usedPct}% of the balance used`, `${a.name}: مستخدم ${a.usedPct}% من الرصيد`)} />));
  alerts.frozen.forEach((a) => rows.push(<Row key={`f-${a.contactId}`} icon={Snowflake} href={`/flexi/accounts/${a.contactId}`} text={tr(`${a.name}: frozen`, `${a.name}: موقوف مؤقتًا`)} />));
  alerts.overBudgetRequests.forEach((r) => rows.push(
    <li key={`r-${r.id}`}>
      <RequestLink id={r.id} className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <Megaphone className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{tr(`${r.clientName}: "${r.title}" is above the available balance`, `${r.clientName}: «${r.title}» أكبر من الرصيد المتاح`)}</span>
      </RequestLink>
    </li>,
  ));
  if (rows.length === 0) return <p className="text-muted-foreground">{tr('Nothing needs attention right now.', 'ما فيه شي يحتاج متابعة الحين.')}</p>;
  return <ul className="space-y-2">{rows}</ul>;
}

function Row({ href, text, icon: Icon, tone }: { href: string; text: string; icon: React.ComponentType<{ className?: string }>; tone?: 'danger' | 'warn' }) {
  const style = tone === 'danger' ? 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100' : tone === 'warn' ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100' : 'bg-muted/50';
  return (
    <li>
      <Link href={href} className={`flex items-center gap-2 rounded-md px-3 py-2 ${style}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{text}</span>
      </Link>
    </li>
  );
}

const eventWord = (kind: FlexiOverview['recentEvents'][number]['kind'], tr: Tr) => ({
  applied: tr('applied', 'قدّم طلب'),
  approved: tr('approved', 'تمت الموافقة'),
  rejected: tr('rejected', 'تم الرفض'),
  withdrawn: tr('withdrew', 'سحب طلبه'),
  adjusted: tr('balance or terms changed', 'تعديل الرصيد أو الشروط'),
  frozen: tr('frozen', 'إيقاف مؤقت'),
  unfrozen: tr('unfrozen', 'إلغاء الإيقاف'),
  closed: tr('closed', 'إغلاق'),
  terms_accepted: tr('accepted the terms', 'وافق على الشروط'),
}[kind]);
