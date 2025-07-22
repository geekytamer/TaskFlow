import type { Task, User } from '@/lib/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Edit, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Button } from '../ui/button';

interface TaskCardProps {
  task: Task;
  users: User[];
}

const priorityColors: Record<Task['priority'], string> = {
  High: 'bg-red-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-green-500',
};

export function TaskCard({ task, users }: TaskCardProps) {
  const assignedUser = users.find((user) => user.id === task.assignedUserId);

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardHeader>
        <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{task.title}</CardTitle>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem><Edit className="mr-2 h-4 w-4" /> Edit Task</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
        <CardDescription className="line-clamp-2">{task.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {task.tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <div
                  className={cn(
                    'h-4 w-4 rounded-full',
                    priorityColors[task.priority]
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{task.priority} Priority</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {task.dueDate && (
             <p className="text-sm text-muted-foreground">
                {format(task.dueDate, 'MMM d')}
            </p>
          )}
        </div>

        {assignedUser && (
           <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <Avatar className="h-8 w-8">
                    <AvatarImage src={assignedUser.avatar} />
                    <AvatarFallback>{assignedUser.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Assigned to {assignedUser.name}</p>
                </TooltipContent>
            </Tooltip>
           </TooltipProvider>
        )}
      </CardFooter>
    </Card>
  );
}
