'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import {
  ChartContainer,
  ChartTooltipContent,
} from '@/components/ui/chart';

const data = [
  { name: 'To Do', total: 12, fill: 'var(--color-chart-3)' },
  { name: 'In Progress', total: 15, fill: 'var(--color-chart-2)' },
  { name: 'Done', total: 28, fill: 'var(--color-chart-1)' },
];

const chartConfig = {
  total: {
    label: 'Tasks',
  },
};

export function OverviewChart() {
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
