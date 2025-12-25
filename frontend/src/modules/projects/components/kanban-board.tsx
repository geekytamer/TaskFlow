'use client';

import * as React from 'react';
import { DragDropContext, Droppable, Draggable, OnDragEndResponder } from '@hello-pangea/dnd';
import { getTasks, updateTask } from '@/services/projectService';
import type { Task, TaskStatus } from '@/modules/projects/types';
import { taskStatuses } from '@/modules/projects/types';
import { KanbanTaskCard } from './kanban-task-card';
import { Skeleton } from '@/components/ui/skeleton';

interface KanbanBoardProps {
    projectId: string;
}

export function KanbanBoard({ projectId }: KanbanBoardProps) {
    const [tasks, setTasks] = React.useState<Task[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        async function loadTasks() {
            setLoading(true);
            const allTasks = await getTasks();
            const projectTasks = allTasks.filter(task => task.projectId === projectId);
            setTasks(projectTasks);
            setLoading(false);
        }
        loadTasks();
    }, [projectId]);

    const columns = React.useMemo(() => {
        const cols: Record<TaskStatus, Task[]> = {
            'To Do': [],
            'In Progress': [],
            'Done': [],
        };
        tasks.forEach(task => {
            cols[task.status].push(task);
        });
        
        // Sort tasks within each column by creation date
        for (const status of taskStatuses) {
            cols[status].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }

        return cols;
    }, [tasks]);

    const onDragEnd: OnDragEndResponder = async (result) => {
        const { destination, source, draggableId } = result;

        if (!destination) {
            return;
        }

        if (destination.droppableId === source.droppableId && destination.index === source.index) {
            return;
        }

        const task = tasks.find(t => t.id === draggableId);
        if (!task) return;

        const newStatus = destination.droppableId as TaskStatus;

        // Optimistically update the UI
        const updatedTasks = tasks.map(t => 
            t.id === draggableId ? { ...t, status: newStatus } : t
        );
        setTasks(updatedTasks);
        
        // Update the backend
        try {
            await updateTask(draggableId, { status: newStatus });
        } catch (error) {
            console.error("Failed to update task status:", error);
            // Revert the UI change on failure
            setTasks(tasks);
        }
    };

    if (loading) {
        return (
            <div className="flex gap-4 h-full">
                {taskStatuses.map(status => (
                    <div key={status} className="w-[300px] flex-shrink-0">
                        <Skeleton className="h-8 w-1/2 mb-4" />
                        <div className="space-y-4">
                            {[...Array(3)].map((_, i) => (
                                <Skeleton key={i} className="h-24 w-full" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 items-start">
                {taskStatuses.map(status => (
                    <div key={status} className="w-[300px] flex-shrink-0 bg-muted/50 rounded-lg p-3">
                        <h3 className="font-semibold mb-3 px-1">{status}</h3>
                        <Droppable droppableId={status}>
                            {(provided, snapshot) => (
                                <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className={`space-y-3 min-h-[200px] rounded-md transition-colors ${snapshot.isDraggingOver ? 'bg-muted' : 'bg-muted/20'}`}
                                    style={{ paddingBottom: '12px' }}
                                >
                                    {columns[status].map((task, index) => (
                                        <Draggable key={task.id} draggableId={task.id} index={index}>
                                            {(provided) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                >
                                                    <KanbanTaskCard task={task} />
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {columns[status].length === 0 && (
                                        <div className="flex items-center justify-center rounded-md border border-dashed border-muted-foreground/40 p-6 text-sm text-muted-foreground">
                                            Drop here to move a task into "{status}"
                                        </div>
                                    )}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </div>
                ))}
            </div>
        </DragDropContext>
    );
}
