'use client';

import * as React from 'react';
import { getTasks } from '@/services/projectService';
import { getUsers } from '@/services/userService';
import type { Task, Project, TaskStatus, User } from '@/modules/projects/types';
import { taskStatuses } from '@/modules/projects/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  LabelList,
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
import { Badge } from '@/components/ui/badge';
import { ProjectLegend } from './project-legend';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';


const GanttTooltip = ({ active, payload, allUsers, allProjects }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.isLabel) return null;
      const users = allUsers.filter((u: User) => data.assignedUserIds?.includes(u.id));
      const project = allProjects.find((p: Project) => p.id === data.projectId);
      return (
        <Card className="w-60">
            <CardHeader className='p-4 pb-2 flex flex-row items-center gap-2'>
                {project && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />}
                <h3 className='text-base font-semibold'>{data.title}</h3>
            </CardHeader>
          <CardContent className="p-4 pt-0 text-sm">
            <div className="flex justify-between items-center mb-2">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline">{data.status}</Badge>
            </div>
            {project && <p className="text-muted-foreground mb-2">Project: {project.name}</p>}
            <div className="flex justify-between">
                <span className="text-muted-foreground">Start:</span>
                <span>{data.startDate ? format(data.startDate, 'MMM d') : 'N/A'}</span>
            </div>
             <div className="flex justify-between">
                <span className="text-muted-foreground">End:</span>
                <span>{data.endDate ? format(data.endDate, 'MMM d') : 'N/A'}</span>
            </div>
             <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span>{data.duration} days</span>
            </div>
            {users.length > 0 && (
                <div className="pt-2 mt-2 border-t">
                  <p className="text-muted-foreground mb-1">Assignees:</p>
                  <div className="flex items-center -space-x-2">
                    {users.map((user: User) => (
                      <Avatar key={user.id} className="h-6 w-6 border">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                    ))}
                    <span className="pl-4 text-xs">{users.map((u:User) => u.name).join(', ')}</span>
                  </div>
                </div>
            )}
          </CardContent>
        </Card>
      );
    }
    return null;
  };

interface GanttChartProps {
    projectId?: string;
}

export function GanttChart({ projectId }: GanttChartProps) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedStatus, setSelectedStatus] = React.useState<TaskStatus | 'all'>('all');
  const [selectedAssignee, setSelectedAssignee] = React.useState<string | 'all'>('all');
  const { selectedCompany, projects, currentUser } = useCompany();

  React.useEffect(() => {
    async function loadData() {
        if (!selectedCompany) return;
        setLoading(true);
        const [tasksData, usersData] = await Promise.all([
            getTasks(),
            getUsers(),
        ]);
        setTasks(tasksData);
        setUsers(usersData);
        setLoading(false);
    }
    loadData();
  }, [selectedCompany]);

  const visibleProjects = React.useMemo(() => {
    if (!currentUser) return [];
    return projects.filter(p => 
      p.companyId === selectedCompany?.id &&
      (!projectId || p.id === projectId) &&
      (p.visibility === 'Public' || p.memberIds?.includes(currentUser.id) || currentUser.role === 'Admin')
    );
  }, [projects, currentUser, selectedCompany, projectId]);

  const companyUsers = React.useMemo(() => {
      if (!selectedCompany) return [];
      return users.filter(u => u.companyId === selectedCompany.id);
  }, [users, selectedCompany]);

  const processedTasks = React.useMemo(() => {
    const today = startOfDay(new Date());
    const visibleProjectIds = visibleProjects.map(p => p.id);

    const baseTasks = tasks
    .filter(task => task.createdAt && task.dueDate) // Ensure dates are present
    .map(task => {
        const endDate = startOfDay(task.dueDate!);
        const startDate = startOfDay(task.createdAt!);
        const duration = Math.max(1, differenceInDays(endDate, startDate) + 1);
        const project = projects.find(p => p.id === task.projectId);

        return {
            ...task,
            startDate,
            endDate,
            duration,
            ganttRange: [differenceInDays(startDate, today), differenceInDays(endDate, today)],
            projectName: project?.name || 'Uncategorized',
            fill: task.color || project?.color || 'hsl(var(--chart-3))'
        }
    })

    return baseTasks
    .filter(task => 
        visibleProjectIds.includes(task.projectId) &&
        (selectedStatus === 'all' || task.status === selectedStatus) &&
        (selectedAssignee === 'all' || task.assignedUserIds?.includes(selectedAssignee))
    )
    .sort((a,b) => {
        if (a.projectName < b.projectName) return -1;
        if (a.projectName > b.projectName) return 1;
        if (!a.startDate || !b.startDate) return 0;
        return a.startDate.getTime() - b.startDate.getTime()
    });
  }, [tasks, projects, visibleProjects, selectedStatus, selectedAssignee]);


  const groupedTasks = React.useMemo(() => {
      const groups = processedTasks.reduce((acc, task) => {
          (acc[task.projectName] = acc[task.projectName] || []).push(task);
          return acc;
      }, {} as Record<string, typeof processedTasks>);

      return Object.entries(groups).flatMap(([projectName, tasks]) => [
          {isLabel: true, title: projectName, fill: tasks[0]?.fill},
          ...tasks
      ]);
  }, [processedTasks]);

  const minDay = Math.min(0, ...processedTasks.map(t => t.ganttRange[0]).filter(v => !isNaN(v)));
  const maxDay = Math.max(30, ...processedTasks.map(t => t.ganttRange[1]).filter(v => !isNaN(v)));
  
  if (loading) {
      return (
          <Card className="h-full">
              <CardHeader>
                  <Skeleton className="h-8 w-full" />
              </CardHeader>
              <CardContent>
                  <Skeleton className="h-[400px] w-full" />
              </CardContent>
          </Card>
      )
  }
  
  const todayMarker = differenceInDays(startOfDay(new Date()), addDays(startOfDay(new Date()), minDay));

  const yAxisWidth = 200;
  
  return (
    <Card className="h-full flex flex-col">
        <CardHeader>
            <div className="flex flex-col gap-4">
                 <div className="flex items-center gap-4">
                    <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as TaskStatus | 'all')}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            {taskStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                                {status}
                            </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                     <Select value={selectedAssignee} onValueChange={(value) => setSelectedAssignee(value as string)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by assignee" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Assignees</SelectItem>
                            {companyUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                                {user.name}
                            </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {!projectId && <ProjectLegend projects={visibleProjects} />}
            </div>
        </CardHeader>
        <CardContent className='flex-1 -mt-4'>
            <ChartContainer config={{}} className='h-full w-full'>
                <ResponsiveContainer>
                    <BarChart
                    layout="vertical"
                    data={groupedTasks}
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
                        tick={({ y, payload }) => {
                            const item = payload.payload;
                            if (!item) return null;
                            if (item.isLabel) {
                                 return (
                                    <g transform={`translate(0,${y})`}>
                                        <foreignObject x="0" y="-10" width={yAxisWidth -10} height="24">
                                            <div className="flex items-center gap-2 font-bold" title={item.title}>
                                                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{backgroundColor: item.fill}} />
                                                <p className='text-sm truncate'>{item.title}</p>
                                            </div>
                                        </foreignObject>
                                    </g>
                                )
                            }
                            return (
                                <g transform={`translate(0,${y})`}>
                                    <foreignObject x="0" y="-10" width={yAxisWidth -10} height="24">
                                        <div className="flex items-center gap-2 pl-5" title={item.title}>
                                            <p className='text-xs truncate font-medium text-muted-foreground'>{item.title}</p>
                                        </div>
                                    </foreignObject>
                                </g>
                            )
                        }}
                        tickLine={false}
                        axisLine={false}
                        />
                    <Tooltip content={<GanttTooltip allUsers={users} allProjects={projects} />} cursor={{fill: 'hsl(var(--muted))'}}/>
                    {todayMarker >= minDay && todayMarker <= maxDay && 
                        <ReferenceLine x={0} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{value: "Today", position:"insideTopLeft", fill: "hsl(var(--primary))" }} />
                    }
                    <Bar dataKey="ganttRange" barSize={20} radius={[4, 4, 4, 4]}>
                         <LabelList 
                            dataKey="title" 
                            position="insideLeft" 
                            offset={10} 
                            className="fill-primary-foreground font-semibold text-xs" 
                            content={(props) => {
                                const {x, y, width, height, value, index} = props;
                                if (!width || !height || !value || !index) return null;
                                const data = groupedTasks[index as number];
                                if (!data || data.isLabel) return null;
                                
                                const canvas = document.createElement("canvas");
                                const context = canvas.getContext("2d");
                                if(context) {
                                    context.font = "11px sans-serif";
                                    const labelWidth = context.measureText(value).width;
                                    if (width < labelWidth + 20) return null;
                                }


                                return (
                                    <g>
                                    <text x={Number(x) + 10} y={Number(y) + Number(height) / 2} dy={4} fill="#fff" fontSize="11" fontWeight="bold">
                                        {value}
                                    </text>
                                    </g>
                                )
                            }}
                         />
                        {groupedTasks.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.isLabel ? 'transparent' : entry.fill} />
                        ))}
                    </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </ChartContainer>
      </CardContent>
    </Card>
  );
}
