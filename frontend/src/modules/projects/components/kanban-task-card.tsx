'use client';

import * as React from 'react';
import type { Task } from '@/modules/projects/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getUsers } from '@/services/userService';
import type { User } from '@/modules/users/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const priorityColors: Record<Task['priority'], string> = {
  High: 'bg-red-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-green-500',
};

interface KanbanTaskCardProps {
    task: Task;
}

export function KanbanTaskCard({ task }: KanbanTaskCardProps) {
    const [users, setUsers] = React.useState<User[]>([]);

    React.useEffect(() => {
        async function loadUsers() {
            const allUsers = await getUsers();
            const assigned = allUsers.filter(u => task.assignedUserIds?.includes(u.id));
            setUsers(assigned);
        }
        loadUsers();
    }, [task.assignedUserIds]);

    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="p-3 pb-2">
                <div className="flex justify-between items-start">
                     <h4 className="font-semibold text-sm">{task.title}</h4>
                     <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                <div className={`h-3 w-3 rounded-full ${priorityColors[task.priority]}`} />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{task.priority} priority</p>
                            </TooltipContent>
                        </Tooltip>
                     </TooltipProvider>
                </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
                <div className="flex flex-wrap gap-1 mb-3">
                    {task.tags.map(tag => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                </div>
                <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">
                        {task.dueDate ? `Due: ${new Date(task.dueDate).toLocaleDateString()}` : ''}
                    </p>
                    <div className="flex -space-x-2">
                        {users.map(user => (
                             <TooltipProvider key={user.id}>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <Avatar className="h-6 w-6 border-2 border-background">
                                            <AvatarImage src={user.avatar} />
                                            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{user.name}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
