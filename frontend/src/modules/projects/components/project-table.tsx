'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getTasks } from '@/services/projectService';
import { getUsersByCompany } from '@/services/userService';
import { taskStatuses, type Task, type TaskStatus } from '@/modules/projects/types';
import type { User } from '@/modules/users/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TaskDetailsSheet } from './task-details-sheet';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getClients } from '@/services/financeService';
import type { Client } from '@/modules/finance/types';
import { canViewProject } from '@/modules/projects/lib/access';

interface ProjectTableProps {
    projectId?: string;
}

export function ProjectTable({ projectId }: ProjectTableProps) {
    const [selectedStatus, setSelectedStatus] = React.useState<TaskStatus | 'all'>('all');
    const [tasks, setTasks] = React.useState<Task[]>([]);
    const [users, setUsers] = React.useState<User[]>([]);
    const [clients, setClients] = React.useState<Client[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
    const { selectedCompany, projects, currentUser, currentRole } = useCompany();
    const { toast } = useToast();

    const loadData = React.useCallback(async () => {
        if (!selectedCompany) return;
        setLoading(true);
        try {
            const canLoadCompanyReferences = currentRole && currentRole !== 'Employee';
            const [tasksData, usersData, clientData] = await Promise.all([
                getTasks(),
                canLoadCompanyReferences ? getUsersByCompany(selectedCompany.id) : Promise.resolve([]),
                canLoadCompanyReferences ? getClients(selectedCompany.id) : Promise.resolve([]),
            ]);
            
            setTasks(tasksData);
            setUsers(usersData);
            setClients(clientData);
        } catch (error: any) {
            console.error('Failed to load project table data', error);
            setTasks([]);
            setUsers([]);
            setClients([]);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error?.message || 'Could not load project tasks.',
            });
        } finally {
            setLoading(false);
        }
    }, [currentRole, selectedCompany, toast]);

    React.useEffect(() => {
        loadData();
    }, [loadData]);
    
    const visibleProjects = React.useMemo(() => {
        if (!currentUser) return [];
        return projects.filter(p => 
            p.companyId === selectedCompany?.id &&
            canViewProject(p, currentUser.id, currentRole)
        );
    }, [currentUser, currentRole, projects, selectedCompany]);
    
    const filteredTasks = React.useMemo(() => {
        const visibleProjectIds = visibleProjects.map(p => p.id);
        return tasks.filter(task => 
            (!projectId || task.projectId === projectId) &&
            (selectedStatus === 'all' || task.status === selectedStatus) &&
            visibleProjectIds.includes(task.projectId)
        );
    }, [tasks, projectId, selectedStatus, visibleProjects]);

    const handleTaskClick = (task: Task) => {
        setSelectedTask(task);
    }

    const handleSheetClose = (updated?: boolean) => {
        setSelectedTask(null);
        if (updated) {
            loadData();
        }
    }
    
    if (loading) {
        return (
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Task</TableHead>
                            <TableHead>Project</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>Assignees</TableHead>
                            <TableHead>Due Date</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                         {[...Array(5)].map((_, i) => (
                             <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-6 w-12 rounded-full" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            </TableRow>
                         ))}
                    </TableBody>
                </Table>
            </div>
        )
    }


  return (
    <>
    <div className="flex h-full flex-col gap-4">
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
        </div>
        <ScrollArea className="flex-1">
            <div className="rounded-lg border relative">
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Assignees</TableHead>
                    <TableHead>Due Date</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {filteredTasks.map((task) => {
                    const project = projects.find(p => p.id === task.projectId);
                    const client = clients.find((entry) => entry.id === project?.clientId);
                    const assignees = users.filter(u => task.assignedUserIds?.includes(u.id));
                    return (
                        <TableRow key={task.id} onClick={() => handleTaskClick(task)} className="cursor-pointer">
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>
                            <div className="flex items-center gap-2">
                                {project && <span className="h-2 w-2 rounded-full" style={{backgroundColor: task.color || project.color}} />}
                                {project?.name}
                            </div>
                        </TableCell>
                        <TableCell>{client?.name || 'Unlinked'}</TableCell>
                        <TableCell>
                            <Badge variant="outline">{task.status}</Badge>
                        </TableCell>
                        <TableCell>{task.priority}</TableCell>
                        <TableCell>
                            {assignees.length > 0 && (
                                <div className="flex items-center -space-x-2 rtl:space-x-reverse">
                                {assignees.map(user => (
                                    <Avatar key={user.id} className="h-6 w-6 border-2 border-background">
                                        <AvatarImage src={user.avatar} />
                                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                ))}
                                </div>
                            )}
                        </TableCell>
                        <TableCell>
                            {task.dueDate ? format(task.dueDate, 'MMM d, yyyy') : 'N/A'}
                        </TableCell>
                        </TableRow>
                    )
                })}
                </TableBody>
            </Table>
            </div>
        </ScrollArea>
    </div>
    {selectedTask && (
        <TaskDetailsSheet 
            open={!!selectedTask}
            onOpenChange={(open) => {
                if (!open) handleSheetClose(false);
            }}
            onTaskUpdate={() => handleSheetClose(true)}
            task={selectedTask}
        />
    )}
    </>
  );
}
