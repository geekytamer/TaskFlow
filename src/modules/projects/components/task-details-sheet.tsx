'use client';

import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  placeholderUsers,
  placeholderProjects,
  placeholderComments,
} from '@/modules/projects/data';
import type { Task, Comment } from '@/modules/projects/types';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { Calendar, User, Tag, Paperclip, MessageSquare } from 'lucide-react';

const priorityColors: Record<Task['priority'], string> = {
  High: 'bg-red-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-green-500',
};

interface TaskDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
}

function DetailRow({ icon: Icon, label, children }: { icon: React.ElementType, label: string, children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-4">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

export function TaskDetailsSheet({ open, onOpenChange, task }: TaskDetailsSheetProps) {
  const assignedUser = placeholderUsers.find((u) => u.id === task.assignedUserId);
  const project = placeholderProjects.find((p) => p.id === task.projectId);
  const comments = placeholderComments.filter((c) => c.taskId === task.id);
  const currentUser = placeholderUsers[0]; // Mock current user

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-2xl sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="truncate pr-8">{task.title}</SheetTitle>
          <SheetDescription>
            In project <span className="font-semibold text-foreground">{project?.name}</span>
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pr-6 -mr-6 pl-1 -ml-1">
          <div className="space-y-6 py-4">
            {task.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {task.description}
                </p>
            )}

            <dl className="space-y-4">
               <DetailRow icon={User} label="Assignee">
                 {assignedUser ? (
                    <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={assignedUser.avatar} />
                            <AvatarFallback>{assignedUser.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span>{assignedUser.name}</span>
                    </div>
                 ) : 'Unassigned'}
               </DetailRow>
               <DetailRow icon={Calendar} label="Due Date">
                 {task.dueDate ? format(task.dueDate, 'PPP') : 'No due date'}
               </DetailRow>
                <DetailRow icon={() => <div className={cn("h-3 w-3 rounded-full", priorityColors[task.priority])} />} label="Priority">
                    {task.priority}
                </DetailRow>
                <DetailRow icon={Tag} label="Tags">
                    <div className="flex flex-wrap gap-1">
                    {task.tags.map(tag => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                    </div>
                </DetailRow>
            </dl>
            
            <Separator />

            <div>
                <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Activity
                </h4>
                <div className="space-y-6">
                    {/* Add Comment Form */}
                    <div className="flex items-start gap-3">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={currentUser.avatar} />
                            <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-2">
                            <Textarea placeholder="Write a comment..." className="text-sm" />
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm"><Paperclip className="h-4 w-4 mr-2" />Attach</Button>
                                <Button size="sm">Post Comment</Button>
                            </div>
                        </div>
                    </div>

                    {/* Comments List */}
                    {comments.map(comment => {
                        const commentUser = placeholderUsers.find(u => u.id === comment.userId);
                        return (
                             <div key={comment.id} className="flex items-start gap-3">
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={commentUser?.avatar} />
                                    <AvatarFallback>{commentUser?.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className='flex-1'>
                                    <div className="flex items-baseline gap-2">
                                        <p className="font-semibold text-sm">{commentUser?.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
                                        </p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-muted/50 mt-1">
                                        <p className="text-sm">{comment.content}</p>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
