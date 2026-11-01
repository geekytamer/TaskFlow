'use client';

import * as React from 'react';
import Link from 'next/link';
import { getCurrentLocale } from '@/lib/locale';
import { AlertTriangle, Activity, Zap, Inbox, ChevronDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardInsightsView, DashboardSkeleton } from './dashboard-insights';
import { OnboardingChecklist } from './onboarding-checklist';

const METRIC_ROUTES: Record<string, string> = {
  'open-receivables': '/finance?tab=invoices',
  'open-payables': '/finance?tab=payables',
  'billed-this-month': '/finance?tab=invoices',
  'collected-this-month': '/finance?tab=invoices',
  'paid-payables-this-month': '/finance?tab=payables',
  'open-tasks': '/tasks',
  'overdue-tasks': '/tasks',
  'open-projects': '/projects',
  'active-projects': '/projects',
  'manager-overdue-tasks': '/tasks',
  'admin-overdue-tasks': '/tasks',
  'unbilled-pos': '/purchases',
  'expense-receipts': '/finance?tab=expenses',
};
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { getDashboardInsights, getDashboardPayload, type DashboardInsights, type InsightPeriod } from '@/services/dashboardService';
import type { DashboardPayload, DashboardChart } from '@/modules/dashboard/types';
import { CurrencyAmount, useCompanyCurrency, type SupportedCurrencyCode } from '@/lib/currency';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { useLiveRefresh } from '@/lib/live';

function formatMetricValue(value: number, formatType: string, currencyCode: SupportedCurrencyCode) {
  if (formatType === 'currency') return <CurrencyAmount value={value} currencyCode={currencyCode} />;
  if (formatType === 'percent') return `${value}%`;
  return value.toLocaleString(getCurrentLocale());
}

const TONE_COLORS: Record<string, string> = {
  default: 'text-foreground/80',
  info: 'text-blue-600 dark:text-blue-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-500',
  danger: 'text-rose-600 dark:text-rose-400',
};

const DASHBOARD_AR: Record<string, string> = {
  'Open Tasks': 'المهام المفتوحة',
  'Assigned work not yet completed.': 'المهام المسندة التي لم تكتمل بعد.',
  Overdue: 'متأخرة',
  'Assigned tasks past due date.': 'مهام مسندة تجاوزت تاريخ الاستحقاق.',
  'Due This Week': 'مستحقة هذا الأسبوع',
  'Assigned tasks due in the next 7 days.': 'المهام المسندة المستحقة خلال 7 أيام القادمة.',
  'Completion Rate': 'نسبة الإنجاز',
  'Completed versus tracked assigned tasks.': 'المهام المكتملة مقابل المهام المسندة المتتبعة.',
  'Task Status': 'حالة المهام',
  'Current status split for assigned work.': 'توزيع الحالة الحالية للمهام المسندة.',
  'To Do': 'للعمل',
  'In Progress': 'قيد التنفيذ',
  Done: 'مكتملة',
  'Priority Mix': 'توزيع الأولويات',
  'Open assigned work by urgency.': 'توزيع المهام المفتوحة المسندة حسب الأولوية.',
  High: 'عالية',
  Medium: 'متوسطة',
  Low: 'منخفضة',
  'Deadline Pressure': 'ضغط المواعيد',
  'Where open assigned tasks sit across due-date buckets.': 'موقع المهام المسندة المفتوحة عبر فئات المواعيد.',
  'Due Soon': 'مستحقة قريبًا',
  Planned: 'مخططة',
  'No Date': 'بدون تاريخ',
  'Task Load': 'حمولة المهام',
  'Assigned work created versus scheduled due load over the last 6 months.': 'المهام المسندة المنشأة مقابل حمولة الاستحقاق المجدولة خلال آخر 6 أشهر.',
  'Open Projects': 'المشاريع المفتوحة',
  'Open Diagram': 'المخطط',
  'Active Projects': 'المشاريع النشطة',
  'Projects with unfinished work.': 'مشاريع تحتوي على أعمال غير منتهية.',
  'Company tasks not yet completed.': 'مهام الشركة التي لم تكتمل بعد.',
  'Overdue Tasks': 'مهام متأخرة',
  'Open tasks that have passed their due date.': 'المهام المفتوحة التي تجاوزت تاريخ الاستحقاق.',
  'Low Stock Items': 'عناصر منخفضة المخزون',
  'Items at or below their reorder point.': 'عناصر عند أو أقل من نقطة إعادة الطلب.',
  'Company task distribution by status.': 'توزيع مهام الشركة حسب الحالة.',
  'Created work versus scheduled due load over the last 6 months.': 'العمل المُنشأ مقابل حمولة الاستحقاق المجدولة خلال آخر 6 أشهر.',
  'Purchase Lifecycle': 'دورة المشتريات',
  'Open purchasing distributed by order status.': 'توزيع المشتريات المفتوحة حسب حالة الطلب.',
  Draft: 'مسودة',
  Ordered: 'مؤكدة',
  'Partially Received': 'مستلمة جزئيًا',
  Received: 'مستلمة',
  'Inventory Health': 'صحة المخزون',
  'Healthy, low-stock, and out-of-stock item split.': 'توزيع العناصر بين جيد ومنخفض المخزون ونافد المخزون.',
  Healthy: 'جيد',
  'Low Stock': 'مخزون منخفض',
  'Out of Stock': 'نفد المخزون',
  Projects: 'المشاريع',
  Inventory: 'المخزون',
  Purchases: 'المشتريات',
  Clients: 'العملاء',
  'Open Receivables': 'الذمم المدينة المفتوحة',
  'Outstanding client balances.': 'أرصدة العملاء المستحقة.',
  'Open Payables': 'الذمم الدائنة المفتوحة',
  'Outstanding vendor liabilities.': 'التزامات الموردين المستحقة.',
  'Billed This Month': 'المفوتر هذا الشهر',
  'Invoices issued during the current month.': 'الفواتير الصادرة خلال الشهر الحالي.',
  'Collected This Month': 'المحصل هذا الشهر',
  'Payments received during the current month.': 'المدفوعات المحصلة خلال الشهر الحالي.',
  'Finance Exposure': 'التعرض المالي',
  'Receivables, payables, stock value, and unbilled purchasing.': 'الذمم المدينة والدائنة وقيمة المخزون والمشتريات غير المفوترة.',
  Receivables: 'الذمم المدينة',
  Payables: 'الذمم الدائنة',
  'Stock Value': 'قيمة المخزون',
  'Unbilled POs': 'أوامر شراء غير مفوترة',
  'Revenue vs Collections': 'الإيرادات مقابل التحصيل',
  'Invoices issued versus cash collected over the last 6 months.': 'الفواتير الصادرة مقابل النقد المحصل خلال آخر 6 أشهر.',
  'Aging Overview': 'نظرة أعمار الذمم',
  'Receivable and payable balances by aging bucket.': 'أرصدة الذمم المدينة والدائنة حسب فئات العمر.',
  Current: 'حالي',
  Users: 'المستخدمون',
  Companies: 'الشركات',
  Finance: 'المالية',
  'Company tasks still in flight.': 'مهام الشركة التي ما زالت قيد التنفيذ.',
  'Items at or below reorder point.': 'عناصر عند أو أقل من نقطة إعادة الطلب.',
};

function localizeDashboardText(text: string, language: 'en' | 'ar'): string {
  if (language !== 'ar' || !text) return text;
  if (DASHBOARD_AR[text]) return DASHBOARD_AR[text];

  // Attention alerts (src/dashboard/attention.ts on the server).
  const attention: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^(\d+) waiting for your approval$/, (m) => `${m[1]} بانتظار موافقتك`],
    [/^Purchase orders and expenses above an approval level\.$/, () => 'أوامر شراء ومصروفات فوق مستوى الموافقة.'],
    [/^(\d+) out-of-range readings? in the last 24 hours$/, (m) => `${m[1]} قراءات خارج النطاق خلال آخر 24 ساعة`],
    [/^(\d+) shipments? past arrival date$/, (m) => `${m[1]} شحنات تجاوزت موعد وصولها`],
    [/^(\d+) batch(?:es)? waiting for QC$/, (m) => `${m[1]} دفعات بانتظار فحص الجودة`],
    [/^(\d+) recurring documents? could not be created$/, (m) => `${m[1]} مستندات متكررة تعذّر إنشاؤها`],
    [/^(\d+) bank statements? not reconciled$/, (m) => `${m[1]} كشوف بنكية لم تُسوَّ`],
    [/^(\d+) lines? still to match$/, (m) => `${m[1]} أسطر لم تُطابق بعد`],
    [/^Ready to mark reconciled$/, () => 'جاهزة لتأكيد التسوية'],
  ];
  for (const [pattern, render] of attention) {
    const m = text.match(pattern);
    if (m) return render(m);
  }

  const overdueTasks = text.match(/^(\d+) overdue tasks$/);
  if (overdueTasks) return `${overdueTasks[1]} مهام متأخرة`;

  const onHandVsReorder = text.match(/^(.+) on hand against reorder point (.+)\.$/);
  if (onHandVsReorder) return `المتوفر ${onHandVsReorder[1]} مقابل نقطة إعادة الطلب ${onHandVsReorder[2]}.`;

  const awaitingReceipt = text.match(/^(\d+) units are awaiting receipt\.$/);
  if (awaitingReceipt) return `${awaitingReceipt[1]} وحدة بانتظار الاستلام.`;

  const overdueFromClient = text.match(/^(.+) overdue from client (.+)\.$/);
  if (overdueFromClient) return `${overdueFromClient[1]} متأخر من العميل ${overdueFromClient[2]}.`;

  const overdueForVendor = text.match(/^(.+) overdue for (.+)\.$/);
  if (overdueForVendor) return `${overdueForVendor[1]} متأخر للمورد ${overdueForVendor[2]}.`;

  const unitsOnHand = text.match(/^(.+) units on hand\.$/);
  if (unitsOnHand) return `${unitsOnHand[1]} وحدة متوفرة.`;

  const stillOutstanding = text.match(/^(.+) still outstanding\.$/);
  if (stillOutstanding) return `${stillOutstanding[1]} ما زالت مستحقة.`;

  const stillPayable = text.match(/^(.+) still payable\.$/);
  if (stillPayable) return `${stillPayable[1]} ما زالت مستحقة الدفع.`;

  return text;
}

function localizeRole(role: string, language: 'en' | 'ar') {
  if (language !== 'ar') return role;
  const map: Record<string, string> = {
    Admin: 'مدير النظام',
    Manager: 'مدير',
    Accountant: 'محاسب',
    Employee: 'موظف',
  };
  return map[role] || role;
}

function ChartRenderer({ chart, tr }: { chart: DashboardChart; tr: (en: string, ar: string) => string }) {
  const { type, series, data } = chart;

  if (!data || data.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/70 p-6 min-h-[200px]">
        <Inbox className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-sm">{tr('No data available for this chart', 'لا توجد بيانات متاحة لهذا المخطط')}</p>
      </div>
    );
  }

  if (type === 'donut') {
    const pieData = data.map((d) => ({
      name: d.label,
      value: d.values[series[0]?.key] || 0,
    }));
    const colors = series.map((s) => s.color);

    return (
      <div className="flex-1 flex justify-center items-center mt-2 relative min-h-[220px]">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={pieData} innerRadius={70} outerRadius={95} paddingAngle={4} dataKey="value" stroke="none" cornerRadius={8}>
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length] || '#4F46E5'} />
              ))}
            </Pie>
            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex justify-center flex-wrap gap-4 mt-4 absolute bottom-0 w-full">
          {pieData.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[i % colors.length] || '#4F46E5' }} />
              <div className="text-xs text-muted-foreground font-medium">{d.name}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'line') {
    return (
      <div className="w-full mt-2 min-h-[240px]">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 5, right: 0, left: -25, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }} />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={`values.${s.key}`} name={s.label} stroke={s.color} strokeWidth={3} dot={{ r: 3, fill: s.color, strokeWidth: 2, stroke: '#fff' }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div className="flex justify-center flex-wrap gap-6 mt-2">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <div className="text-xs text-muted-foreground font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mt-2 min-h-[240px]">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -25, bottom: 25 }} barGap={6}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={`values.${s.key}`} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} barSize={type === 'stacked-bar' ? 32 : 16} stackId={type === 'stacked-bar' ? 'a' : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center flex-wrap gap-6 mt-2">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <div className="text-xs text-muted-foreground font-medium">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { selectedCompany, currentUser } = useCompany();
  const { language } = useI18n();
  const [days, setDays] = React.useState<InsightPeriod>(30);
  const [insights, setInsights] = React.useState<DashboardInsights | null>(null);
  const [pulse, setPulse] = React.useState(0);
  // Only the latest request for the current company and period may land.
  const insightsRequest = React.useRef(0);
  const { currencyCode } = useCompanyCurrency();
  const [payload, setPayload] = React.useState<DashboardPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);

  React.useEffect(() => {
    let active = true;
    async function load() {
      if (!selectedCompany) {
        setPayload(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await getDashboardPayload(selectedCompany.id);
        if (active) setPayload(data);
      } catch {
        if (active) setPayload(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [selectedCompany]);

  // The period figures load on their own, so switching the period does not reload the page.
  React.useEffect(() => {
    const ticket = ++insightsRequest.current;
    if (!selectedCompany) { setInsights(null); return; }
    setInsights((current) => (current && current.companyId === selectedCompany.id ? current : null));
    getDashboardInsights(selectedCompany.id, days)
      .then((data) => { if (ticket === insightsRequest.current) setInsights(data); })
      .catch(() => { if (ticket === insightsRequest.current) setInsights(null); });
  }, [selectedCompany, days]);

  // The figures follow the company's changes, quietly (no spinner, last figures kept on a failed refresh).
  useLiveRefresh('*', async () => {
    if (!selectedCompany) return;
    const ticket = ++insightsRequest.current;
    const [data, fresh] = await Promise.all([
      getDashboardPayload(selectedCompany.id).catch(() => null),
      getDashboardInsights(selectedCompany.id, days).catch(() => null),
    ]);
    if (data && data.companyId === selectedCompany.id) setPayload(data);
    if (fresh && ticket === insightsRequest.current) setInsights(fresh);
    if (data || fresh) setPulse((n) => n + 1);
  });

  const localizedPayload = React.useMemo(() => {
    if (!payload || language !== 'ar') return payload;
    return {
      ...payload,
      metrics: payload.metrics.map((metric) => ({
        ...metric,
        label: localizeDashboardText(metric.label, language),
        detail: metric.detail ? localizeDashboardText(metric.detail, language) : metric.detail,
      })),
      charts: payload.charts.map((chart) => ({
        ...chart,
        title: localizeDashboardText(chart.title, language),
        description: chart.description
          ? localizeDashboardText(chart.description, language)
          : chart.description,
        series: chart.series.map((series) => ({
          ...series,
          label: localizeDashboardText(series.label, language),
        })),
        data: chart.data.map((data) => ({
          ...data,
          label: localizeDashboardText(data.label, language),
        })),
      })),
      alerts: payload.alerts.map((alert) => ({
        ...alert,
        title: localizeDashboardText(alert.title, language),
        detail: localizeDashboardText(alert.detail, language),
      })),
      quickActions: payload.quickActions.map((action) => ({
        ...action,
        label: localizeDashboardText(action.label, language),
      })),
      activity: payload.activity.map((item) => ({
        ...item,
        title: localizeDashboardText(item.title, language),
        detail: localizeDashboardText(item.detail, language),
      })),
    };
  }, [payload, language]);

  if (!selectedCompany) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
        {tr('Please select a company to view the dashboard.', 'يرجى اختيار شركة لعرض لوحة التحكم.')}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-0 sm:p-4 lg:p-8">
        <span className="sr-only">{tr('Loading dashboard data...', 'جاري تحميل بيانات لوحة التحكم...')}</span>
        <DashboardSkeleton />
      </div>
    );
  }

  if (!localizedPayload) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground p-8 text-center bg-muted/50 rounded-[28px]">
        <AlertTriangle className="w-10 h-10 mb-4 text-amber-500 opacity-80" />
        <h2 className="text-xl font-bold text-foreground mb-2">{tr('No Dashboard Available', 'لوحة التحكم غير متاحة')}</h2>
        <p>{tr('We could not load the dashboard for this selection.', 'تعذر تحميل لوحة التحكم لهذا الاختيار.')}</p>
      </div>
    );
  }

  const { role, scope, metrics, charts, alerts, activity, quickActions } = localizedPayload;
  const hour = new Date().getHours();
  const firstName = currentUser?.name?.split(' ')[0] ?? '';
  const greeting = hour < 12 ? tr('Good morning', 'صباح الخير') : hour < 18 ? tr('Good afternoon', 'مساء الخير') : tr('Good evening', 'مساء النور');
  const today = new Date().toLocaleDateString(language === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const severityChip: Record<string, string> = {
    critical: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    info: 'border-border bg-card text-foreground',
  };

  return (
    <div className="min-h-screen bg-background p-0 sm:p-4 lg:p-8 font-sans text-foreground space-y-6">
      <div className="tf-rise flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {firstName ? `${greeting}${language === 'ar' ? '، ' : ', '}${firstName}` : greeting}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{today}</span>
            <span aria-hidden="true">·</span>
            <span>{scope === 'company' ? tr('Company view', 'عرض الشركة') : tr('Your work', 'شغلك')} ({localizeRole(role, language)})</span>
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400" title={tr('Figures update by themselves', 'الأرقام تتحدث بنفسها')}>
              <span className="relative flex h-2 w-2">
                <span key={pulse} className={`absolute inline-flex h-full w-full rounded-full bg-emerald-500 ${pulse ? 'tf-ping' : ''}`} />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {tr('Live', 'مباشر')}
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as InsightPeriod)}>
            <TabsList>
              <TabsTrigger value="30">{tr('30 days', '30 يوم')}</TabsTrigger>
              <TabsTrigger value="90">{tr('90 days', '90 يوم')}</TabsTrigger>
              <TabsTrigger value="365">{tr('Year', 'سنة')}</TabsTrigger>
            </TabsList>
          </Tabs>
          {quickActions.length > 0 && (
            // On a phone the shortcuts scroll sideways in one row instead of squeezing the title.
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:pb-0" data-tutorial="dash-quick-actions">
              {quickActions.map((action) => (
                <Link key={action.id} href={action.route} className="tf-lift flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-primary hover:bg-muted/50">
                  <Zap className="h-4 w-4" />
                  {action.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="tf-rise -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ animationDelay: '40ms' }} data-tutorial="dash-alerts">
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> {tr('Needs you today', 'يحتاجك اليوم')}
          </span>
          {alerts.slice(0, 8).map((alert) => (
            <a key={alert.id} href={alert.route || '#'} title={alert.detail} className={`tf-lift shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${severityChip[alert.severity] ?? severityChip.info}`}>
              {alert.title}
              {alert.detail && <span className="ms-1.5 hidden max-w-[16rem] truncate align-bottom font-normal opacity-80 sm:inline-block">{alert.detail}</span>}
            </a>
          ))}
        </div>
      )}

      <OnboardingChecklist />

      {insights && insights.companyId === selectedCompany.id && <DashboardInsightsView data={insights} tr={tr} language={language} />}

      {metrics.length > 0 && (
        <section className="tf-rise space-y-2" style={{ animationDelay: '320ms' }} data-tutorial="dash-primary-metric">
          <h2 className="text-sm font-semibold text-muted-foreground">{tr('Right now', 'الحين')}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-tutorial="dash-secondary-metrics">
            {metrics.map((item) => {
              const href = METRIC_ROUTES[item.id];
              const inner = (
                <>
                  <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                  <div className={`mt-1 text-xl font-bold tabular-nums ${TONE_COLORS[item.tone || 'default'] || TONE_COLORS.default}`}>
                    {formatMetricValue(item.value, item.format, currencyCode)}
                  </div>
                  {item.detail && <p className="mt-1 text-[11px] text-muted-foreground/80">{item.detail}</p>}
                </>
              );
              const cls = 'rounded-2xl border border-border bg-card p-4';
              return href ? (
                <Link key={item.id} href={href} className={`${cls} tf-lift focus:outline-none focus:ring-2 focus:ring-ring/40`}>{inner}</Link>
              ) : (
                <div key={item.id} className={cls}>{inner}</div>
              );
            })}
          </div>
        </section>
      )}

      {activity.length > 0 && (
        <section className="tf-rise rounded-2xl border border-border bg-card p-5" style={{ animationDelay: '380ms' }}>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <Activity className="h-5 w-5 text-primary" /> {tr('Recent activity', 'النشاط الأخير')}
          </h3>
          <ol className="relative space-y-4 border-s border-border ps-5">
            {activity.slice(0, 6).map((item) => (
              <li key={item.id} className="relative">
                <span className="absolute -start-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-foreground">{item.title}</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.detail} {item.actorName && `• ${tr('by', 'بواسطة')} ${item.actorName}`}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs font-medium text-muted-foreground/80">{relativeTime(item.createdAt, language)}</time>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {charts.length > 0 && (
        <details className="group rounded-2xl border border-border bg-card" data-tutorial="dash-charts">
          <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-base font-semibold text-foreground">
            {tr('More details', 'تفاصيل أكثر')}
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid grid-cols-1 gap-6 px-5 pb-5 lg:grid-cols-2">
            {charts.map((chart) => (
              <div key={chart.id} className="flex flex-col rounded-xl bg-muted/30 p-5">
                <div className="mb-4">
                  <h3 className="text-base font-bold text-foreground">{chart.title}</h3>
                  {chart.description && <p className="mt-1 text-sm text-muted-foreground">{chart.description}</p>}
                </div>
                <ChartRenderer chart={chart} tr={tr} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** "5 min ago", "yesterday", or the date, in the reader's language. */
function relativeTime(at: Date, language: 'en' | 'ar') {
  const seconds = Math.round((new Date(at).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(language === 'ar' ? 'ar-OM-u-nu-latn' : 'en', { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), 'day');
  return new Date(at).toLocaleDateString(getCurrentLocale(), { month: 'short', day: 'numeric' });
}
