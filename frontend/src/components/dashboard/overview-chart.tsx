'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import {
  ChartContainer,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { useI18n } from '@/context/i18n-context';

export function OverviewChart() {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  const data = [
    { name: tr('To Do', 'قيد الانتظار'), total: 12, fill: 'var(--color-chart-3)' },
    { name: tr('In Progress', 'قيد التنفيذ'), total: 15, fill: 'var(--color-chart-2)' },
    { name: tr('Done', 'مكتمل'), total: 28, fill: 'var(--color-chart-1)' },
  ];

  const chartConfig = {
    total: {
      label: tr('Tasks', 'المهام'),
    },
  };

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 20, left: -10, bottom: 0 }}>
            <XAxis
            dataKey="name"
            stroke="#888888"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            />
            <YAxis
            stroke="#888888"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}`}
            />
            <Tooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="total" radius={[4, 4, 0, 0]} />
        </BarChart>
        </ResponsiveContainer>
    </ChartContainer>
  );
}
