'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { placeholderUsers } from '@/modules/users/data';
import { placeholderProjects } from '@/modules/projects/data';
import type { Task } from '@/modules/projects/types';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

const priorityColors: Record<Task['priority'], string> = {
  High: 'bg-red-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-green-500',
};

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const assignedUser = placeholderUsers.find(u => u.id === task.assignedUserId);
  const project = placeholderProjects.find(p => p.id === task.projectId);

  const cardBorderColor = task.color || project?.color;

  return (
    <TooltipProvider>
      <Card 
        className="cursor-pointer hover:bg-card/90 border-l-4"
        style={{borderLeftColor: cardBorderColor}}
        >
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start justify-between">
            <h4 className="font-semibold text-base leading-snug pr-4">{task.title}</h4>
            <Tooltip>
              <TooltipTrigger>
                {assignedUser ? (
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={assignedUser.avatar} alt={assignedUser.name} />
                    <AvatarFallback>{assignedUser.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                ) : (
                    <Avatar className="h-7 w-7">
                        <AvatarFallback>?</AvatarFallback>
                    </Avatar>
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>{assignedUser ? assignedUser.name : 'Unassigned'}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground">{project?.name}</p>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
             <div className="flex items-center gap-2">
                <div
                    className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        priorityColors[task.priority]
                    )}
                    />
                <span>{task.priority}</span>
            </div>
            {task.dueDate && (
                <span>
                    {format(task.dueDate, 'MMM d')}
                </span>
            )}
          </div>
          {task.tags && task.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {task.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
