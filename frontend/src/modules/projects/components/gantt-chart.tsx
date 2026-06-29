'use client';

import * as React from 'react';
import { getTasks } from '@/services/projectService';
import { getUsersByCompany } from '@/services/userService';
import type { Task, Project, TaskStatus } from '@/modules/projects/types';
import type { User } from '@/modules/users/types';
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
import { useI18n } from '@/context/i18n-context';
import { Skeleton } from '@/components/ui/skeleton';
import { canViewProject } from '@/modules/projects/lib/access';


const GanttTooltip = ({ active, payload, allUsers, allProjects }: any) => {
    const { language } = useI18n();
    const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
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
                <span className="text-muted-foreground">{tr('Status:', 'الحالة:')}</span>
                <Badge variant="outline">{data.status}</Badge>
            </div>
            {project && <p className="text-muted-foreground mb-2">{tr('Project:', 'المشروع:')} {project.name}</p>}
            <div className="flex justify-between">
                <span className="text-muted-foreground">{tr('Start:', 'البداية:')}</span>
                <span>{data.startDate ? format(data.startDate, 'MMM d') : tr('N/A', 'غير متاح')}</span>
            </div>
             <div className="flex justify-between">
                <span className="text-muted-foreground">{tr('End:', 'النهاية:')}</span>
                <span>{data.endDate ? format(data.endDate, 'MMM d') : tr('N/A', 'غير متاح')}</span>
            </div>
             <div className="flex justify-between">
                <span className="text-muted-foreground">{tr('Duration:', 'المدة:')}</span>
                <span>{data.duration} {tr('days', 'يوم')}</span>
            </div>
            {users.length > 0 && (
                <div className="pt-2 mt-2 border-t">
                  <p className="text-muted-foreground mb-1">{tr('Assignees:', 'المكلّفون:')}</p>
                  <div className="flex items-center -space-x-2 rtl:space-x-reverse">
                    {users.map((user: User) => (
                      <Avatar key={user.id} className="h-6 w-6 border">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                    ))}
                    <span className="ps-4 text-xs">{users.map((u:User) => u.name).join(', ')}</span>
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

const Y_AXIS_WIDTH = 200;
const BAR_HEIGHT = 28;
const CHART_PADDING_TOP = 20;

type ProcessedTaskRow = Task & {
  isLabel: false;
  startDate: Date;
  endDate: Date;
  duration: number;
  ganttRange: [number, number];
  projectName: string;
  fill: string;
};

type LabelRow = {
  isLabel: true;
  title: string;
  fill: string;
};

type GanttRow = ProcessedTaskRow | LabelRow;

export function GanttChart({ projectId }: GanttChartProps) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedStatus, setSelectedStatus] = React.useState<TaskStatus | 'all'>('all');
  const [selectedAssignee, setSelectedAssignee] = React.useState<string | 'all'>('all');
  const { selectedCompany, projects, currentUser, currentRole } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const chartRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    async function loadData() {
        if (!selectedCompany) return;
        setLoading(true);
        try {
          const canLoadCompanyUsers = currentRole && currentRole !== 'Employee';
          const [tasksData, usersData] = await Promise.all([
              getTasks(),
              canLoadCompanyUsers ? getUsersByCompany(selectedCompany.id) : Promise.resolve([]),
          ]);
          setTasks(tasksData);
          setUsers(usersData);
        } catch (error) {
          console.error('Failed to load gantt data', error);
          setTasks([]);
          setUsers([]);
        } finally {
          setLoading(false);
        }
    }
    loadData();
  }, [currentRole, selectedCompany]);

  const visibleProjects = React.useMemo(() => {
    if (!currentUser) return [];
    return projects.filter(p => 
      p.companyId === selectedCompany?.id &&
      (!projectId || p.id === projectId) &&
      canViewProject(p, currentUser.id, currentRole)
    );
  }, [projects, currentUser, currentRole, selectedCompany, projectId]);

  const companyUsers = React.useMemo(() => {
      if (!selectedCompany) return [];
      return users.filter((u) => u.companyIds?.includes(selectedCompany.id));
  }, [users, selectedCompany]);

  const processedTasks = React.useMemo<ProcessedTaskRow[]>(() => {
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
            isLabel: false as const,
            startDate,
            endDate,
            duration,
            ganttRange: [
              differenceInDays(startDate, today),
              differenceInDays(endDate, today),
            ] as [number, number],
            projectName: project?.name || tr('Uncategorized', 'غير مصنّف'),
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
  }, [tasks, projects, visibleProjects, selectedStatus, selectedAssignee, language]);


  const groupedTasks = React.useMemo<GanttRow[]>(() => {
      const groups = processedTasks.reduce((acc, task) => {
          (acc[task.projectName] = acc[task.projectName] || []).push(task);
          return acc;
      }, {} as Record<string, ProcessedTaskRow[]>);

      return Object.entries(groups).flatMap(([projectName, tasks]) => [
          { isLabel: true as const, title: projectName, fill: tasks[0]?.fill || 'transparent' },
          ...tasks
      ]);
  }, [processedTasks]);
  
  const { minDay, maxDay } = React.useMemo(() => {
    if (processedTasks.length === 0) {
      return { minDay: -15, maxDay: 15 };
    }
    const chartWidth = chartRef.current?.clientWidth ?? 800;
    const pixelsPerDay = 20;
    const daysToShow = Math.floor((chartWidth - Y_AXIS_WIDTH) / pixelsPerDay);

    const allDays = processedTasks.flatMap(t => t.ganttRange);
    const min = Math.min(...allDays);
    const max = Math.max(...allDays);
    
    // If the actual range is smaller than what we can show, use the actual range with padding
    if (max - min < daysToShow) {
        const padding = Math.floor((daysToShow - (max-min)) / 2);
        return { minDay: min - padding, maxDay: max + padding };
    }
    
    // Otherwise, center the view on today if possible
    const todayRange = 0;
    const startDay = todayRange - Math.floor(daysToShow / 2);
    
    return { minDay: startDay, maxDay: startDay + daysToShow };

  }, [processedTasks, chartRef.current?.clientWidth]);

  
  if (loading) {
      return (
          <Card>
              <CardHeader>
                  <Skeleton className="h-8 w-full" />
              </CardHeader>
              <CardContent>
                  <Skeleton className="h-[400px] w-full" />
              </CardContent>
          </Card>
      )
  }
  
  const chartHeight = (groupedTasks.length * BAR_HEIGHT) + CHART_PADDING_TOP + 40; // 40 for X-axis
  
  return (
    <Card ref={chartRef}>
        <CardHeader>
            <div className="flex flex-col gap-4">
                 <div className="flex items-center gap-4">
                    <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as TaskStatus | 'all')}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder={tr('Filter by status', 'تصفية حسب الحالة')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{tr('All Statuses', 'كل الحالات')}</SelectItem>
                            {taskStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                                {status}
                            </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                     <Select value={selectedAssignee} onValueChange={(value) => setSelectedAssignee(value as string)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder={tr('Filter by assignee', 'تصفية حسب المكلّف')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{tr('All Assignees', 'كل المكلّفين')}</SelectItem>
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
        <CardContent>
            <ChartContainer config={{}} className="w-full" style={{ height: `${chartHeight}px` }}>
                <ResponsiveContainer>
                    <BarChart
                    layout="vertical"
                    data={groupedTasks}
                    margin={{ top: CHART_PADDING_TOP, right: 30, left: 20, bottom: 5 }}
                    barCategoryGap="35%"
                    >
                    <XAxis 
                        type="number" 
                        domain={[minDay, maxDay]}
                        tickFormatter={(value) => format(addDays(new Date(), value), 'MMM d')}
                        interval="preserveStartEnd"
                        />
                    <YAxis 
                        dataKey="title" 
                        type="category" 
                        width={Y_AXIS_WIDTH} 
                        tick={({ y, payload }) => {
                            const item = payload?.payload as GanttRow | undefined;
                            if (!item) return <g />;
                            const yPos = y + (BAR_HEIGHT / 2) - 10;
                            if (item.isLabel) {
                                 return (
                                    <g transform={`translate(0,${yPos})`}>
                                        <foreignObject x="0" y="0" width={Y_AXIS_WIDTH -10} height="24">
                                            <div className="flex items-center gap-2 font-bold" title={item.title}>
                                                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{backgroundColor: item.fill}} />
                                                <p className='text-sm truncate'>{item.title}</p>
                                            </div>
                                        </foreignObject>
                                    </g>
                                )
                            }
                            return (
                                <g transform={`translate(0,${yPos})`}>
                                    <foreignObject x="0" y="0" width={Y_AXIS_WIDTH -10} height="24">
                                        <div className="flex items-center gap-2 ps-5" title={item.title}>
                                            <p className='text-xs truncate font-medium text-muted-foreground'>{item.title}</p>
                                        </div>
                                    </foreignObject>
                                </g>
                            )
                        }}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        />
                    <Tooltip content={<GanttTooltip allUsers={users} allProjects={projects} />} cursor={{fill: 'hsl(var(--muted))'}}/>
                    <ReferenceLine x={0} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{value: tr("Today", "اليوم"), position:"insideTopLeft", fill: "hsl(var(--primary))" }} />
                    <Bar dataKey="ganttRange" barSize={BAR_HEIGHT * 0.6} radius={[4, 4, 4, 4]}>
                         <LabelList 
                            dataKey="title" 
                            position="insideLeft" 
                            offset={10} 
                            className="fill-primary-foreground font-semibold text-xs" 
                            content={(props) => {
                                const {x, y, width, height, value, index} = props;
                                if (width == null || height == null || value == null || index == null) return null;
                                const data = groupedTasks[index as number];
                                if (!data || data.isLabel) return null;
                                const numericWidth = Number(width);
                                const labelText = String(value);
                                
                                const canvas = document.createElement("canvas");
                                const context = canvas.getContext("2d");
                                if(context) {
                                    context.font = "11px sans-serif";
                                    const labelWidth = context.measureText(labelText).width;
                                    if (numericWidth < labelWidth + 20) return null;
                                }


                                return (
                                    <g>
                                    <text x={Number(x) + 10} y={Number(y) + Number(height) / 2} dy={4} fill="#fff" fontSize="11" fontWeight="bold">
                                        {labelText}
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
