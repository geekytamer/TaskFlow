'use client';

import * as React from 'react';
import { getTasks, getProjects } from '@/services/projectService';
import { getUsers, getCurrentUser } from '@/services/userService';
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
  Label,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addDays, differenceInDays, format, startOfDay, addWeeks, subWeeks, differenceInCalendarDays, addMonths, subMonths, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ProjectLegend } from './project-legend';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { DateRangePicker } from '@/components/ui/date-range-picker';


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

type ZoomLevel = 'week' | 'month' | 'quarter';

const zoomLevels: Record<ZoomLevel, number> = {
    week: 7,
    month: 30,
    quarter: 90
};


export function GanttChart({ projectId }: GanttChartProps) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedStatus, setSelectedStatus] = React.useState<TaskStatus | 'all'>('all');
  const [selectedAssignee, setSelectedAssignee] = React.useState<string | 'all'>('all');
  const { selectedCompany } = useCompany();
  
  const [viewDate, setViewDate] = React.useState(new Date());
  const [zoom, setZoom] = React.useState<ZoomLevel>('month');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
  });


  React.useEffect(() => {
    async function loadData() {
        if (!selectedCompany) return;
        setLoading(true);
        const [tasksData, projectsData, usersData, currentUserData] = await Promise.all([
            getTasks(),
            getProjects(),
            getUsers(),
            getCurrentUser(),
        ]);
        setTasks(tasksData);
        setProjects(projectsData);
        setUsers(usersData);
        setCurrentUser(currentUserData);
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

  const baseTasks = React.useMemo(() => {
    return tasks
    .filter(task => task.dueDate && task.createdAt)
    .map(task => {
        const endDate = startOfDay(task.dueDate!);
        const duration = Math.max(1, differenceInCalendarDays(endDate, task.createdAt) + 1);
        const startDate = task.createdAt;
        const project = projects.find(p => p.id === task.projectId);

        return {
            ...task,
            startDate,
            endDate,
            duration,
            ganttRange: [0,0], // will be recalculated
            projectName: project?.name || 'Uncategorized',
            fill: task.color || project?.color || 'hsl(var(--chart-3))'
        }
    })
  }, [tasks, projects]);


  const processedTasks = React.useMemo(() => {
    const visibleProjectIds = visibleProjects.map(p => p.id);

    return baseTasks
    .filter(task => 
        visibleProjectIds.includes(task.projectId) &&
        (selectedStatus === 'all' || task.status === selectedStatus) &&
        (selectedAssignee === 'all' || task.assignedUserIds?.includes(selectedAssignee)) &&
        (!dateRange?.from || !dateRange?.to || isWithinInterval(task.startDate, dateRange) || isWithinInterval(task.endDate, dateRange)) &&
        task.createdAt
    )
    .map(task => ({
        ...task,
        ganttRange: [differenceInDays(task.startDate, viewDate), differenceInDays(task.endDate, viewDate)],
    }))
    .sort((a,b) => {
        if (a.projectName < b.projectName) return -1;
        if (a.projectName > b.projectName) return 1;
        return a.startDate.getTime() - b.startDate.getTime()
    });
  }, [baseTasks, visibleProjects, selectedStatus, selectedAssignee, dateRange, viewDate]);

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

  const handleZoom = (direction: 'in' | 'out') => {
      const levels: ZoomLevel[] = ['week', 'month', 'quarter'];
      const currentIndex = levels.indexOf(zoom);
      if (direction === 'in' && currentIndex > 0) {
          setZoom(levels[currentIndex - 1]);
      }
      if (direction === 'out' && currentIndex < levels.length - 1) {
          setZoom(levels[currentIndex + 1]);
      }
  }

  const handlePan = (direction: 'prev' | 'next') => {
      const panFn = direction === 'prev' ? subWeeks : addWeeks;
      setViewDate(panFn(viewDate, 1));
  }
  
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
  
  const todayMarker = differenceInCalendarDays(startOfDay(new Date()), viewDate);
  const timeDomain = [ -Math.floor(zoomLevels[zoom] / 2), Math.ceil(zoomLevels[zoom] / 2)];


  const yAxisWidth = 200;
  
  return (
    <Card className="h-full flex flex-col">
        <CardHeader>
            <div className="flex flex-col gap-4">
                 <div className="flex flex-col sm:flex-row gap-4 justify-between">
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
                        <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                    </div>
                     <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={() => handlePan('prev')}><ChevronLeft className="h-4 w-4" /></Button>
                        <Button variant="outline" onClick={() => setViewDate(new Date())}>Today</Button>
                        <Button variant="outline" size="icon" onClick={() => handlePan('next')}><ChevronRight className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => handleZoom('in')}><ZoomIn className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => handleZoom('out')}><ZoomOut className="h-4 w-4" /></Button>
                    </div>
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
                        domain={timeDomain}
                        tickFormatter={(value) => format(addDays(viewDate, value), 'MMM d')}
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
                    <ReferenceLine x={todayMarker} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{value: "Today", position:"insideTopLeft", fill: "hsl(var(--primary))" }} />
                    <Bar dataKey="ganttRange" barSize={20} radius={[4, 4, 4, 4]}>
                         <LabelList 
                            dataKey="title" 
                            position="insideLeft" 
                            offset={10} 
                            className="fill-primary-foreground font-semibold text-xs" 
                            content={(props) => {
                                const {x, y, width, height, value, index} = props;
                                const data = groupedTasks[index as number];
                                if (data.isLabel) return null;
                                
                                const labelWidth = (new TextEncoder().encode(value).length) * 5.5; 
                                if (width < labelWidth) return null;

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
