'use client';

import * as React from 'react';
import { MoreHorizontal, AlertTriangle, Activity, Zap, ExternalLink, Inbox } from 'lucide-react';
import { useCompany } from '@/context/company-context';
import { getDashboardPayload } from '@/services/dashboardService';
import type { DashboardPayload, DashboardChart, DashboardChartType, DashboardMetric } from '@/modules/dashboard/types';
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
import { format } from 'date-fns';

function formatMetricValue(value: number, formatType: string) {
  if (formatType === 'currency') return `$${value.toLocaleString()}`;
  if (formatType === 'percent') return `${value}%`;
  return value.toLocaleString();
}

const TONE_COLORS: Record<string, string> = {
  default: 'text-slate-700',
  info: 'text-blue-600',
  success: 'text-emerald-600',
  warning: 'text-amber-500',
  danger: 'text-rose-600',
};

function ChartRenderer({ chart }: { chart: DashboardChart }) {
  const { type, series, data } = chart;

  if (!data || data.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 min-h-[200px]">
        <Inbox className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-sm">No data available for this chart</p>
      </div>
    );
  }

  if (type === 'donut') {
    // For donut, Map series[0].key across data
    const pieData = data.map((d) => ({
      name: d.label,
      value: d.values[series[0]?.key] || 0,
    }));
    const colors = series.map(s => s.color);

    return (
      <div className="flex-1 flex justify-center items-center mt-2 relative min-h-[220px]">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={pieData}
              innerRadius={70}
              outerRadius={95}
              paddingAngle={4}
              dataKey="value"
              stroke="none"
              cornerRadius={8}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length] || '#4F46E5'} />
              ))}
            </Pie>
            <Tooltip
              cursor={{ fill: 'transparent' }}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex justify-center flex-wrap gap-4 mt-4 absolute bottom-0 w-full">
          {pieData.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: colors[i % colors.length] || '#4F46E5' }}
              />
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
            <Tooltip
              cursor={{ fill: 'transparent' }}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={`values.${s.key}`}
                name={s.label}
                stroke={s.color}
                strokeWidth={3}
                dot={{ r: 3, fill: s.color, strokeWidth: 2, stroke: '#fff' }}
              />
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

  // bar and stacked-bar
  return (
    <div className="w-full mt-2 min-h-[240px]">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -25, bottom: 25 }} barGap={6}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
          <Tooltip
            cursor={{ fill: 'transparent' }}
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={`values.${s.key}`}
              name={s.label}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              barSize={type === 'stacked-bar' ? 32 : 16}
              stackId={type === 'stacked-bar' ? 'a' : undefined}
            />
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
  const [payload, setPayload] = React.useState<DashboardPayload | null>(null);
  const [loading, setLoading] = React.useState(true);

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
      } catch (err) {
        if (active) setPayload(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [selectedCompany]);

  if (!selectedCompany) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500">
        Please select a company to view the dashboard.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500 animate-pulse">
        Loading dashboard data...
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500 p-8 text-center bg-slate-50 rounded-[28px]">
        <AlertTriangle className="w-10 h-10 mb-4 text-amber-500 opacity-80" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">No Dashboard Available</h2>
        <p>We could not load the dashboard for this selection.</p>
      </div>
    );
  }

  const { role, scope, metrics, charts, alerts, activity, quickActions } = payload;
  const primaryMetric = metrics.length > 0 ? metrics[0] : null;
  const secondaryMetrics = metrics.length > 1 ? metrics.slice(1) : [];

  return (
    <div className="min-h-screen bg-[#F4F7FE] p-4 lg:p-8 font-sans text-slate-800 space-y-6">
      
      {/* Scope Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight capitalize">
            {scope === 'company' ? 'Company Overview' : 'Personal Dashboard'}
          </h1>
          <p className="text-sm text-slate-500 mt-1 capitalize">Role View: {role}</p>
        </div>
        {quickActions.length > 0 && (
          <div className="flex gap-3">
            {quickActions.map(action => (
              <a
                key={action.id}
                href={action.route}
                className="bg-white hover:bg-slate-50 px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-indigo-600 shadow-sm transition-colors flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                {action.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Hero Banner Section with Metrics */}
      {metrics.length > 0 && (
        <div className="relative w-full rounded-[28px] overflow-hidden shadow-sm p-8 lg:p-10"
          style={{ background: 'linear-gradient(135deg, #e0ebff 0%, #e6e6ff 100%)' }}
        >
          <div className="absolute inset-0 opacity-40 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(circle at 70% 30%, #a5b4fc 0%, transparent 40%), radial-gradient(circle at 100% 80%, #c4b5fd 0%, transparent 40%)',
          }} />
          
          <div className="relative z-10 flex flex-col xl:flex-row items-center gap-8">
            {primaryMetric && (
              <div className="w-full xl:w-1/4">
                <h2 className="text-xl font-bold text-slate-800 mb-1">{primaryMetric.label}</h2>
                <p className="text-sm text-slate-500 mb-6">{primaryMetric.detail || 'Primary Indicator'}</p>
                <div className={`text-5xl font-extrabold mb-2 ${TONE_COLORS[primaryMetric.tone || 'default'] || TONE_COLORS.default}`}>
                  {formatMetricValue(primaryMetric.value, primaryMetric.format)}
                </div>
              </div>
            )}

            {secondaryMetrics.length > 0 && (
              <div className="w-full xl:w-3/4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {secondaryMetrics.map((item) => (
                  <div key={item.id} className="bg-white/90 backdrop-blur-md rounded-2xl p-5 shadow-sm flex flex-col justify-center border border-white/60">
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">{item.label}</p>
                    <div className={`text-2xl font-bold ${TONE_COLORS[item.tone || 'default'] || TONE_COLORS.default}`}>
                      {formatMetricValue(item.value, item.format)}
                    </div>
                    {item.detail && <p className="text-[11px] text-slate-400 mt-1 font-medium">{item.detail}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Charts Area */}
      {charts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {charts.map((chart) => (
            <div key={chart.id} className="bg-white rounded-[24px] p-6 shadow-sm flex flex-col">
              <div className="mb-4">
                <h3 className="font-bold text-slate-800 text-lg">{chart.title}</h3>
                {chart.description && <p className="text-sm text-slate-500 mt-1">{chart.description}</p>}
              </div>
              <ChartRenderer chart={chart} />
            </div>
          ))}
        </div>
      )}

      {/* Alerts and Activity Strip */}
      {(alerts.length > 0 || activity.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {alerts.length > 0 && (
            <div className="lg:col-span-1 bg-white rounded-[24px] p-6 shadow-sm flex flex-col">
              <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Action Required
              </h3>
              <div className="space-y-4">
                {alerts.slice(0, 5).map(alert => (
                  <a key={alert.id} href={alert.route || '#'} className="block p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                    <h4 className="font-bold text-sm text-slate-800">{alert.title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{alert.detail}</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {activity.length > 0 && (
            <div className={alerts.length > 0 ? "lg:col-span-2 bg-white rounded-[24px] p-6 shadow-sm flex flex-col" : "lg:col-span-3 bg-white rounded-[24px] p-6 shadow-sm flex flex-col"}>
               <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" /> Recent Activity
              </h3>
              <div className="space-y-3">
                {activity.slice(0, 5).map(item => (
                  <div key={item.id} className="flex items-start justify-between py-3 border-b border-slate-100 last:border-0">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-800">{item.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {item.detail} {item.actorName && `• by ${item.actorName}`}
                      </p>
                    </div>
                    <time className="text-xs text-slate-400 font-medium whitespace-nowrap ml-4">
                      {format(new Date(item.createdAt), 'MMM d, h:mm a')}
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
