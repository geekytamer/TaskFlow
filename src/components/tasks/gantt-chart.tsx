'use client';

import * as React from 'react';
import {
  placeholderTasks,
  placeholderUsers,
} from '@/lib/placeholder-data';
import type { Task, User } from '@/lib/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { addDays, differenceInDays, format, startOfDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ChartContainer, ChartTooltipContent } from '../ui/chart';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';


const GanttTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const user = placeholderUsers.find(u => u.id === data.assignedUserId);
      return (
        <Card className="w-60">
            <CardHeader className='p-4 pb-2'>
                <CardTitle className='text-base'>{data.title}</CardTitle>
            </CardHeader>
          <CardContent className="p-4 pt-0 text-sm">
            <div className="flex justify-between">
                <span className="text-muted-foreground">Start:</span>
                <span>{format(data.startDate, 'MMM d')}</span>
            </div>
             <div className="flex justify-between">
                <span className="text-muted-foreground">End:</span>
                <span>{format(data.endDate, 'MMM d')}</span>
            </div>
             <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span>{data.duration} days</span>
            </div>
            {user && (
                <div className="flex items-center pt-2 mt-2 border-t">
                    <Avatar className="h-6 w-6 mr-2">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs">{user.name}</span>
                </div>
            )}
          </CardContent>
        </Card>
      );
    }
    return null;
  };

export function GanttChart() {
  const [tasks] = React.useState<Task[]>(placeholderTasks);
  const [users] = React.useState<User[]>(placeholderUsers);

  const processedTasks = React.useMemo(() => {
    const today = startOfDay(new Date());
    return tasks
    .filter(task => task.dueDate)
    .map(task => {
        const endDate = startOfDay(task.dueDate!);
        const duration = Math.max(1, Math.ceil(Math.random() * 10)); // Random duration for demo
        const startDate = addDays(endDate, -duration);

        return {
            ...task,
            startDate,
            endDate,
            duration,
            ganttRange: [differenceInDays(startDate, today), differenceInDays(endDate, today)],
            assigneeName: users.find(u => u.id === task.assignedUserId)?.name || 'Unassigned',
        }
    }).sort((a,b) => a.startDate.getTime() - b.startDate.getTime());
  }, [tasks, users]);
  
  const minDay = Math.min(...processedTasks.map(t => t.ganttRange[0]));
  const maxDay = Math.max(...processedTasks.map(t => t.ganttRange[1]));


  const yAxisWidth = 150;
  
  return (
    <Card className="h-full flex flex-col">
        <CardHeader>
            <div className="flex items-center gap-4">
                <Select>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    
                </SelectContent>
                </Select>
                <Select>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by assignee" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Assignees</SelectItem>
                    {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                        {user.name}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent className='flex-1 -mt-4'>
            <ChartContainer config={{}} className='h-full w-full'>
                <ResponsiveContainer>
                    <BarChart
                    layout="vertical"
                    data={processedTasks}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    barCategoryGap={5}
                    >
                    <XAxis 
                        type="number" 
                        domain={[minDay - 2, maxDay + 2]}
                        tickFormatter={(value) => format(addDays(new Date(), value), 'MMM d')}
                        />
                    <YAxis 
                        dataKey="title" 
                        type="category" 
                        width={yAxisWidth} 
                        tick={{ width: yAxisWidth - 10 }}
                        tickLine={false}
                        axisLine={false}
                        />
                    <Tooltip content={<GanttTooltip />} cursor={{fill: 'hsl(var(--muted))'}}/>
                    <ReferenceLine x={0} stroke="hsl(var(--primary))" strokeDasharray="3 3" />
                    <Bar dataKey="ganttRange" barSize={20} radius={[4, 4, 4, 4]}>
                        {processedTasks.map((entry, index) => {
                           let color = 'hsl(var(--chart-3))';
                           if (entry.status === 'In Progress') color = 'hsl(var(--chart-2))';
                           if (entry.status === 'Done') color = 'hsl(var(--chart-1))';
                           return <Bar key={`cell-${index}`} fill={color} />;
                        })}
                    </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </ChartContainer>
      </CardContent>
    </Card>
  );
}
