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
import { placeholderTasks, placeholderProjects } from '@/modules/projects/data';
import { placeholderUsers } from '@/modules/users/data';
import { taskStatuses, type Task, type TaskStatus } from '@/modules/projects/types';
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

export function ProjectTable() {
    const [selectedProject, setSelectedProject] = React.useState('all');
    const [selectedStatus, setSelectedStatus] = React.useState<TaskStatus | 'all'>('all');
    const [tasks, setTasks] = React.useState(placeholderTasks);
    const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
    
    // In a real app, this would come from an auth hook
    const currentUser = placeholderUsers[0]; 

    const visibleProjects = React.useMemo(() => {
        const userTaskProjectIds = tasks
        .filter(t => t.assignedUserId === currentUser.id)
        .map(t => t.projectId);

        return placeholderProjects.filter(p => 
        p.companyId === currentUser.companyId && 
        (p.visibility === 'Public' || userTaskProjectIds.includes(p.id) || currentUser.role === 'Admin')
        );
    }, [tasks, currentUser]);
    
    const filteredTasks = React.useMemo(() => {
        return tasks.filter(task => 
        (selectedProject === 'all' || task.projectId === selectedProject) &&
        (selectedStatus === 'all' || task.status === selectedStatus) &&
        visibleProjects.some(p => p.id === task.projectId)
        );
    }, [tasks, selectedProject, selectedStatus, visibleProjects]);

    const handleTaskClick = (task: Task) => {
        setSelectedTask(task);
    }

    const handleSheetClose = () => {
        setSelectedTask(null);
    }


  return (
    <>
    <div className="flex h-full flex-col gap-4">
        <div className="flex items-center gap-4">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filter by project..." />
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
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Due Date</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {filteredTasks.map((task) => {
                    const project = placeholderProjects.find(p => p.id === task.projectId);
                    const user = placeholderUsers.find(u => u.id === task.assignedUserId);
                    return (
                        <TableRow key={task.id} onClick={() => handleTaskClick(task)} className="cursor-pointer">
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>
                            <div className="flex items-center gap-2">
                                {project && <span className="h-2 w-2 rounded-full" style={{backgroundColor: task.color || project.color}} />}
                                {project?.name}
                            </div>
                        </TableCell>
                        <TableCell>
                            <Badge variant="outline">{task.status}</Badge>
                        </TableCell>
                        <TableCell>{task.priority}</TableCell>
                        <TableCell>
                            {user && (
                                <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                    <AvatarImage src={user.avatar} />
                                    <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{user.name}</span>
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
                if (!open) handleSheetClose();
            }}
            task={selectedTask}
        />
    )}
    </>
  );
}
