'use client';

import * as React from 'react';
import Link from 'next/link';
import { getCurrentLocale } from '@/lib/locale';
import { AlertTriangle, Activity, Zap, Inbox } from 'lucide-react';
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
import { getDashboardPayload } from '@/services/dashboardService';
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

function formatMetricValue(value: number, formatType: string, currencyCode: SupportedCurrencyCode) {
  if (formatType === 'currency') return <CurrencyAmount value={value} currencyCode={currencyCode} />;
  if (formatType === 'percent') return `${value}%`;
  return value.toLocaleString(getCurrentLocale());
}

const TONE_COLORS: Record<string, string> = {
  default: 'text-slate-700',
  info: 'text-blue-600',
  success: 'text-emerald-600',
  warning: 'text-amber-500',
  danger: 'text-rose-600',
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
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 min-h-[200px]">
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
              <div className="text-xs text-slate-500 font-medium">{d.name}</div>
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
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
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
              <div className="text-xs text-slate-500 font-medium">{s.label}</div>
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
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
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
            <div className="text-xs text-slate-500 font-medium">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
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
      <div className="flex items-center justify-center min-h-[400px] text-slate-500">
        {tr('Please select a company to view the dashboard.', 'يرجى اختيار شركة لعرض لوحة التحكم.')}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500 animate-pulse">
        {tr('Loading dashboard data...', 'جاري تحميل بيانات لوحة التحكم...')}
      </div>
    );
  }

  if (!localizedPayload) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500 p-8 text-center bg-slate-50 rounded-[28px]">
        <AlertTriangle className="w-10 h-10 mb-4 text-amber-500 opacity-80" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">{tr('No Dashboard Available', 'لوحة التحكم غير متاحة')}</h2>
        <p>{tr('We could not load the dashboard for this selection.', 'تعذر تحميل لوحة التحكم لهذا الاختيار.')}</p>
      </div>
    );
  }

  const { role, scope, metrics, charts, alerts, activity, quickActions } = localizedPayload;
  const primaryMetric = metrics.length > 0 ? metrics[0] : null;
  const secondaryMetrics = metrics.length > 1 ? metrics.slice(1) : [];

  return (
    <div className="min-h-screen bg-[#F4F7FE] p-4 lg:p-8 font-sans text-slate-800 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight capitalize">
            {scope === 'company' ? tr('Company Overview', 'نظرة عامة على الشركة') : tr('Personal Dashboard', 'لوحة التحكم الشخصية')}
          </h1>
          <p className="text-sm text-slate-500 mt-1 capitalize">
            {tr('Role View', 'عرض الدور')}: {localizeRole(role, language)}
          </p>
        </div>
        {quickActions.length > 0 && (
          <div className="flex gap-3" data-tutorial="dash-quick-actions">
            {quickActions.map((action) => (
              <a key={action.id} href={action.route} className="bg-white hover:bg-slate-50 px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-indigo-600 shadow-sm transition-colors flex items-center gap-2">
                <Zap className="w-4 h-4" />
                {action.label}
              </a>
            ))}
          </div>
        )}
      </div>

      <OnboardingChecklist />

      {metrics.length > 0 && (
        <div className="relative w-full rounded-[28px] overflow-hidden shadow-sm p-8 lg:p-10" style={{ background: 'linear-gradient(135deg, #e0ebff 0%, #e6e6ff 100%)' }} data-tutorial="dash-primary-metric">
          <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 70% 30%, #a5b4fc 0%, transparent 40%), radial-gradient(circle at 100% 80%, #c4b5fd 0%, transparent 40%)' }} />

          <div className="relative z-10 flex flex-col xl:flex-row items-center gap-8">
            {primaryMetric && (() => {
              const primaryHref = METRIC_ROUTES[primaryMetric.id];
              const inner = (
                <>
                  <h2 className="text-xl font-bold text-slate-800 mb-1">{primaryMetric.label}</h2>
                  <p className="text-sm text-slate-500 mb-6">{primaryMetric.detail || tr('Primary Indicator', 'المؤشر الرئيسي')}</p>
                  <div className={`text-5xl font-extrabold mb-2 ${TONE_COLORS[primaryMetric.tone || 'default'] || TONE_COLORS.default}`}>
                    {formatMetricValue(primaryMetric.value, primaryMetric.format, currencyCode)}
                  </div>
                </>
              );
              return primaryHref ? (
                <Link href={primaryHref} className="block w-full xl:w-1/4 rounded-2xl transition hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 p-2 -m-2">
                  {inner}
                </Link>
              ) : (
                <div className="w-full xl:w-1/4">{inner}</div>
              );
            })()}

            {secondaryMetrics.length > 0 && (
              <div className="w-full xl:w-3/4 grid grid-cols-2 md:grid-cols-3 gap-4" data-tutorial="dash-secondary-metrics">
                {secondaryMetrics.map((item) => {
                  const href = METRIC_ROUTES[item.id];
                  const inner = (
                    <>
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">{item.label}</p>
                      <div className={`text-2xl font-bold ${TONE_COLORS[item.tone || 'default'] || TONE_COLORS.default}`}>
                        {formatMetricValue(item.value, item.format, currencyCode)}
                      </div>
                      {item.detail && <p className="text-[11px] text-slate-400 mt-1 font-medium">{item.detail}</p>}
                    </>
                  );
                  const cls =
                    'bg-white/90 backdrop-blur-md rounded-2xl p-5 shadow-sm flex flex-col justify-center border border-white/60 transition';
                  return href ? (
                    <Link
                      key={item.id}
                      href={href}
                      className={`${cls} hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400/40`}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={item.id} className={cls}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {charts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-tutorial="dash-charts">
          {charts.map((chart) => (
            <div key={chart.id} className="bg-white rounded-[24px] p-6 shadow-sm flex flex-col">
              <div className="mb-4">
                <h3 className="font-bold text-slate-800 text-lg">{chart.title}</h3>
                {chart.description && <p className="text-sm text-slate-500 mt-1">{chart.description}</p>}
              </div>
              <ChartRenderer chart={chart} tr={tr} />
            </div>
          ))}
        </div>
      )}

      {(alerts.length > 0 || activity.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {alerts.length > 0 && (
            <div className="lg:col-span-1 bg-white rounded-[24px] p-6 shadow-sm flex flex-col" data-tutorial="dash-alerts">
              <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> {tr('Action Required', 'إجراء مطلوب')}
              </h3>
              <div className="space-y-4">
                {alerts.slice(0, 5).map((alert) => (
                  <a key={alert.id} href={alert.route || '#'} className="block p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                    <h4 className="font-bold text-sm text-slate-800">{alert.title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{alert.detail}</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {activity.length > 0 && (
            <div className={alerts.length > 0 ? 'lg:col-span-2 bg-white rounded-[24px] p-6 shadow-sm flex flex-col' : 'lg:col-span-3 bg-white rounded-[24px] p-6 shadow-sm flex flex-col'}>
              <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" /> {tr('Recent Activity', 'النشاط الأخير')}
              </h3>
              <div className="space-y-3">
                {activity.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-start justify-between py-3 border-b border-slate-100 last:border-0">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-800">{item.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {item.detail} {item.actorName && `• ${tr('by', 'بواسطة')} ${item.actorName}`}
                      </p>
                    </div>
                    <time className="text-xs text-slate-400 font-medium whitespace-nowrap ms-4">
                      {new Date(item.createdAt).toLocaleString(getCurrentLocale(), {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
