
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ListTodo, CheckCircle, Users, Clock, AlertTriangle, PieChart, Briefcase, UserCheck } from 'lucide-react';
import { OverviewChart } from '@/modules/dashboard/components/overview-chart';
import { useCompany } from '@/context/company-context';
import { getTasks } from '@/services/projectService';
import { getUsersByCompany } from '@/services/userService';
import type { Task, User } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { differenceInDays, startOfToday } from 'date-fns';
import { cn } from '@/lib/utils';

export function Dashboard() {
  const { selectedCompany, currentUser } = useCompany();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  
  const loadDashboardData = React.useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    const [allTasks, companyUsers] = await Promise.all([
      getTasks(),
      getUsersByCompany(selectedCompany.id)
    ]);
    const companyTasks = allTasks.filter(t => t.companyId === selectedCompany.id);
    setTasks(companyTasks);
    setUsers(companyUsers);
    setLoading(false);
  }, [selectedCompany]);

  React.useEffect(() => {
    if(currentUser) {
        loadDashboardData();
    }
  }, [loadDashboardData, currentUser]);

  const employeeStats = React.useMemo(() => {
    if (!currentUser) return {};
    const myTasks = tasks.filter(t => t.assignedUserIds?.includes(currentUser.id));
    const today = startOfToday();
    return {
      myOpenTasks: myTasks.filter(t => t.status === 'To Do' || t.status === 'In Progress').length,
      myTasksDueSoon: myTasks.filter(t => t.status !== 'Done' && t.dueDate && differenceInDays(t.dueDate, today) >= 0 && differenceInDays(t.dueDate, today) <= 7).length,
      myCompletedTasks: myTasks.filter(t => t.status === 'Done').length, // Simplified for now
      myOverdueTasks: myTasks.filter(t => t.status !== 'Done' && t.dueDate && differenceInDays(t.dueDate, today) < 0).length,
    }
  }, [tasks, currentUser]);

  const managerStats = React.useMemo(() => {
    const openTasks = tasks.filter(t => t.status === 'To Do' || t.status === 'In Progress');
    const workload = users.length > 0 ? (openTasks.length / users.length).toFixed(1) : 0;
    const today = startOfToday();
    return {
      totalActiveTasks: openTasks.length,
      teamWorkload: workload,
      companyOverdueTasks: tasks.filter(t => t.status !== 'Done' && t.dueDate && differenceInDays(t.dueDate, today) < 0).length,
      activeProjects: [...new Set(tasks.filter(t => t.status !== 'Done').map(t => t.projectId))].length
    }
  }, [tasks, users]);
  
  const StatCard = ({ title, value, icon: Icon, description, isLoading, color }: {title: string, value: string | number, icon: React.ElementType, description?: string, isLoading: boolean, color?: string}) => (
      <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className={cn('h-4 w-4 text-muted-foreground', color)} />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-7 w-12 mt-1" /> : <div className="text-2xl font-bold">{value}</div>}
            {isLoading ? <Skeleton className="h-3 w-3/4 mt-2" /> : <p className="text-xs text-muted-foreground">{description}</p>}
          </CardContent>
        </Card>
  )
  
  const renderDashboardContent = () => {
    if (loading || !currentUser) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="..." value="" icon={ListTodo} description="..." isLoading={true} />
                <StatCard title="..." value="" icon={Clock} description="..." isLoading={true} />
                <StatCard title="..." value="" icon={CheckCircle} description="..." isLoading={true} />
                <StatCard title="..." value="" icon={AlertTriangle} description="..." isLoading={true} />
            </div>
        );
    }

    if (currentUser.role === 'Employee') {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="My Open Tasks" value={employeeStats.myOpenTasks || 0} icon={ListTodo} description="Tasks 'To Do' or 'In Progress'" isLoading={loading} />
                <StatCard title="My Tasks Due Soon" value={employeeStats.myTasksDueSoon || 0} icon={Clock} description="Tasks due in the next 7 days" isLoading={loading} />
                <StatCard title="My Completed Tasks" value={employeeStats.myCompletedTasks || 0} icon={CheckCircle} description="All your completed tasks" isLoading={loading} />
                <StatCard title="My Overdue Tasks" value={employeeStats.myOverdueTasks || 0} icon={AlertTriangle} description="Tasks past their due date" isLoading={loading} color="text-destructive" />
            </div>
        )
    }

    // Manager and Admin View
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Active Tasks" value={managerStats.totalActiveTasks || 0} icon={Briefcase} description={`Across ${selectedCompany?.name}`} isLoading={loading} />
            <StatCard title="Team's Workload" value={managerStats.teamWorkload || 0} icon={UserCheck} description="Avg. open tasks per user" isLoading={loading} />
            <StatCard title="Company Overdue Tasks" value={managerStats.companyOverdueTasks || 0} icon={AlertTriangle} description="Tasks past their due date" isLoading={loading} color="text-destructive" />
            <StatCard title="Active Projects" value={managerStats.activeProjects || 0} icon={PieChart} description="Projects with unfinished tasks" isLoading={loading} />
        </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
        {renderDashboardContent()}
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Tasks Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <OverviewChart />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
