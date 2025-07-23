
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ListTodo, Loader, CheckCircle, Users } from 'lucide-react';
import { OverviewChart } from '@/modules/dashboard/components/overview-chart';
import { useCompany } from '@/context/company-context';
import { getTasks } from '@/services/projectService';
import { getUsersByCompany } from '@/services/userService';
import type { Task, User } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

export function Dashboard() {
  const { selectedCompany } = useCompany();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadDashboardData() {
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
    }
    loadDashboardData();
  }, [selectedCompany]);

  const stats = React.useMemo(() => {
    return {
      totalTasks: tasks.length,
      inProgress: tasks.filter(t => t.status === 'In Progress').length,
      done: tasks.filter(t => t.status === 'Done').length,
      activeUsers: users.length,
    }
  }, [tasks, users]);
  
  const StatCard = ({ title, value, icon: Icon, description, isLoading }: {title: string, value: string | number, icon: React.ElementType, description: string, isLoading: boolean}) => (
      <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-7 w-12 mt-1" /> : <div className="text-2xl font-bold">{value}</div>}
            {isLoading ? <Skeleton className="h-3 w-3/4 mt-2" /> : <p className="text-xs text-muted-foreground">{description}</p>}
          </CardContent>
        </Card>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Tasks" value={stats.totalTasks} icon={ListTodo} description="" isLoading={loading} />
        <StatCard title="In Progress" value={stats.inProgress} icon={Loader} description="" isLoading={loading} />
        <StatCard title="Tasks Done" value={stats.done} icon={CheckCircle} description="" isLoading={loading} />
        <StatCard title="Active Users" value={stats.activeUsers} icon={Users} description={`in ${selectedCompany?.name}`} isLoading={loading} />
      </div>
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
