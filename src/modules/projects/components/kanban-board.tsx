'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { placeholderProjects, placeholderTasks } from '@/modules/projects/data';
import { placeholderUsers } from '@/modules/users/data';
import { taskStatuses, type Task, type TaskStatus } from '@/modules/projects/types';
import { TaskCard } from './task-card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export function KanbanBoard() {
  const [selectedProject, setSelectedProject] = React.useState('all');
  const [tasks, setTasks] = React.useState<Task[]>(placeholderTasks);
  
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
      visibleProjects.some(p => p.id === task.projectId)
    );
  }, [tasks, selectedProject, visibleProjects]);

  const tasksByStatus = React.useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      'To Do': [],
      'In Progress': [],
      'Done': [],
    };
    filteredTasks.forEach(task => {
      grouped[task.status].push(task);
    });
    return grouped;
  }, [filteredTasks]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
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
      </div>
      <ScrollArea className="flex-1">
        <div className="grid h-full grid-cols-1 md:grid-cols-3 gap-4 pb-4">
          {taskStatuses.map(status => (
            <div key={status} className="flex flex-col gap-4 rounded-lg bg-muted/50 p-4">
              <h3 className="font-semibold">{status} ({tasksByStatus[status].length})</h3>
              <div className="flex flex-col gap-3">
                {tasksByStatus[status]
                  .sort((a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime())
                  .map(task => <TaskCard key={task.id} task={task} />)
                }
              </div>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
