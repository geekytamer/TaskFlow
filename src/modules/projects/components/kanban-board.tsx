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
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

type TasksByStatus = Record<TaskStatus, Task[]>;

export function KanbanBoard() {
  const [selectedProject, setSelectedProject] = React.useState('all');
  
  // In a real app, this would come from an auth hook
  const currentUser = placeholderUsers[0]; 

  const [tasks, setTasks] = React.useState<Task[]>(placeholderTasks);

  const visibleProjects = React.useMemo(() => {
    const userTaskProjectIds = tasks
      .filter(t => t.assignedUserId === currentUser.id)
      .map(t => t.projectId);

    return placeholderProjects.filter(p => 
      p.companyId === currentUser.companyId && 
      (p.visibility === 'Public' || userTaskProjectIds.includes(p.id) || currentUser.role === 'Admin')
    );
  }, [tasks, currentUser]);
  
  const tasksByStatus = React.useMemo(() => {
    const filteredTasks = tasks.filter(task => 
      (selectedProject === 'all' || task.projectId === selectedProject) &&
      visibleProjects.some(p => p.id === task.projectId)
    );

    const grouped: TasksByStatus = {
      'To Do': [],
      'In Progress': [],
      'Done': [],
    };
    filteredTasks.forEach(task => {
      grouped[task.status].push(task);
    });
    return grouped;
  }, [tasks, selectedProject, visibleProjects]);

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) {
      return;
    }

    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const startColumn = tasksByStatus[source.droppableId as TaskStatus];
    const endColumn = tasksByStatus[destination.droppableId as TaskStatus];
    const task = startColumn.find(t => t.id === draggableId);

    if (!task) return;

    // In a real app, you would also update the task on the server here
    setTasks(prevTasks => {
      return prevTasks.map(t => {
        if (t.id === draggableId) {
          return { ...t, status: destination.droppableId as TaskStatus };
        }
        return t;
      });
    });
  };

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
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid h-full flex-1 grid-cols-1 md:grid-cols-3 gap-4">
          {taskStatuses.map(status => (
            <Droppable key={status} droppableId={status}>
              {(provided, snapshot) => (
                <div 
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex flex-col rounded-lg bg-muted/50 p-4 transition-colors"
                  style={{ minHeight: '300px' }} // Ensure columns have a minimum height
                >
                  <h3 className="font-semibold mb-4">{status} ({tasksByStatus[status].length})</h3>
                  <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                    {tasksByStatus[status]
                      .sort((a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime())
                      .map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <TaskCard task={task} />
                            </div>
                          )}
                        </Draggable>
                      ))
                    }
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
