'use client';

import * as React from 'react';
import { placeholderTasks, placeholderProjects } from '@/modules/projects/data';
import { placeholderUsers } from '@/modules/users/data';
import type { Task, Project } from '@/modules/projects/types';
import type { User } from '@/modules/users/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  Cell
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addDays, differenceInDays, format, startOfDay } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


const GanttTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const user = placeholderUsers.find(u => u.id === data.assignedUserId);
      const project = placeholderProjects.find(p => p.id === data.projectId);
      return (
        <Card className="w-60">
            <CardHeader className='p-4 pb-2 flex flex-row items-center gap-2'>
                {project && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />}
                <h3 className='text-base font-semibold'>{data.title}</h3>
            </CardHeader>
          <CardContent className="p-4 pt-0 text-sm">
            {project && <p className="text-muted-foreground mb-2">Project: {project.name}</p>}
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
  const [projects] = React.useState<Project[]>(placeholderProjects);
  const [selectedProject, setSelectedProject] = React.useState('all');
  
  // In a real app, this would come from an auth hook
  const currentUser = placeholderUsers[0]; 

  const visibleProjects = React.useMemo(() => {
    const userTaskProjectIds = tasks
      .filter(t => t.assignedUserId === currentUser.id)
      .map(t => t.projectId);

    return projects.filter(p => 
      p.companyId === currentUser.companyId && 
      (p.visibility === 'Public' || userTaskProjectIds.includes(p.id) || currentUser.role === 'Admin')
    );
  }, [projects, tasks, currentUser]);


  const processedTasks = React.useMemo(() => {
    const today = startOfDay(new Date());
    const visibleProjectIds = visibleProjects.map(p => p.id);

    return tasks
    .filter(task => 
        task.dueDate && 
        visibleProjectIds.includes(task.projectId) &&
        (selectedProject === 'all' || task.projectId === selectedProject)
    )
    .map(task => {
        const endDate = startOfDay(task.dueDate!);
        const duration = Math.max(1, Math.ceil(Math.random() * 10)); // Random duration for demo
        const startDate = addDays(endDate, -duration);
        const project = projects.find(p => p.id === task.projectId);

        return {
            ...task,
            startDate,
            endDate,
            duration,
            ganttRange: [differenceInDays(startDate, today), differenceInDays(endDate, today)],
            assigneeName: users.find(u => u.id === task.assignedUserId)?.name || 'Unassigned',
            projectName: project?.name || 'Uncategorized',
            fill: task.color || project?.color || '#cccccc'
        }
    }).sort((a,b) => {
        if (a.projectName < b.projectName) return -1;
        if (a.projectName > b.projectName) return 1;
        return a.startDate.getTime() - b.startDate.getTime()
    });
  }, [tasks, users, projects, selectedProject, visibleProjects]);
  
  const minDay = Math.min(0, ...processedTasks.map(t => t.ganttRange[0]));
  const maxDay = Math.max(10, ...processedTasks.map(t => t.ganttRange[1]));

  const yAxisWidth = 200;
  
  return (
    <Card className="h-full flex flex-col">
        <CardHeader>
            <div className="flex items-center gap-4">
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by project" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {visibleProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                         <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                            {project.name}
                        </div>
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
                        margin={{ top: 5, right: 30, left: 20, bottom: 20 }}
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
                        tick={({ y, payload }) => {
                            const project = projects.find(p => p.id === payload.value.projectId)
                            return (
                                <g transform={`translate(0,${y})`}>
                                    <foreignObject x="0" y="-10" width={yAxisWidth -10} height="20">
                                        <p className='text-sm truncate' title={payload.value}>{payload.value}</p>
                                    </foreignObject>
                                </g>
                            )
                        }}
                        tickLine={false}
                        axisLine={false}
                        />
                    <Tooltip content={<GanttTooltip />} cursor={{fill: 'hsl(var(--muted))'}}/>
                    <Legend content={(props) => {
                        const projectColors = visibleProjects.filter(p => selectedProject === 'all' || p.id === selectedProject)
                        .map(p => ({color: p.color, value: p.name}));
                        return (
                            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4">
                                {projectColors.map(p => (
                                    <div key={p.value} className="flex items-center gap-2 text-xs">
                                        <div className="w-3 h-3 rounded-full" style={{backgroundColor: p.color}}></div>
                                        <span>{p.value}</span>
                                    </div>
                                ))}
                            </div>
                        )
                    }} />
                    <ReferenceLine x={0} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{value: "Today", position:"insideTopLeft", fill: "hsl(var(--primary))" }} />
                    <Bar dataKey="ganttRange" barSize={20} radius={[4, 4, 4, 4]}>
                        {processedTasks.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </ChartContainer>
      </CardContent>
    </Card>
  );
}
