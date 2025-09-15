
'use client';

import * as React from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import {
  ChartContainer,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { useCompany } from '@/context/company-context';
import { getTasks } from '@/services/projectService';
import type { Task } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

const chartConfig = {
  total: {
    label: 'Tasks',
  },
  'To Do': {
    color: 'hsl(var(--chart-3))'
  },
  'In Progress': {
    color: 'hsl(var(--chart-2))'
  },
  'Done': {
    color: 'hsl(var(--chart-1))'
  }
};

export function OverviewChart() {
  const { selectedCompany, currentUser } = useCompany();
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadTaskData() {
      if (!selectedCompany || !currentUser) return;
      setLoading(true);
      const allTasks = await getTasks();
      
      let tasksToDisplay: Task[];

      if (currentUser.role === 'Employee') {
        // For employees, show only their tasks within the selected company
        tasksToDisplay = allTasks.filter(t => 
            t.companyId === selectedCompany.id &&
            t.assignedUserIds?.includes(currentUser.id)
        );
      } else {
        // For Admins and Managers, show all tasks for the company
        tasksToDisplay = allTasks.filter(t => t.companyId === selectedCompany.id);
      }
      
      const taskCounts = tasksToDisplay.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const chartData = [
        { name: 'To Do', total: taskCounts['To Do'] || 0, fill: 'var(--color-To Do)' },
        { name: 'In Progress', total: taskCounts['In Progress'] || 0, fill: 'var(--color-In Progress)' },
        { name: 'Done', total: taskCounts['Done'] || 0, fill: 'var(--color-Done)' },
      ];
      setData(chartData);
      setLoading(false);
    }
    loadTaskData();
  }, [selectedCompany, currentUser]);

  if (loading) {
      return <Skeleton className="h-[300px] w-full" />
  }

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 20, left: -10, bottom: 0 }}>
            <XAxis
            dataKey="name"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            />
            <YAxis
            stroke="hsl(var(--muted-foreground))"
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
