'use client';

import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  placeholderProjects,
  placeholderComments,
} from '@/modules/projects/data';
import { placeholderUsers } from '@/modules/users/data';
import type { Task, Comment, TaskStatus, TaskPriority } from '@/modules/projects/types';
import { taskStatuses, taskPriorities } from '@/modules/projects/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { Calendar as CalendarIcon, User, Tag, Paperclip, MessageSquare, GripVertical } from 'lucide-react';

interface TaskDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
}

function DetailRow({ icon: Icon, label, children }: { icon: React.ElementType, label: string, children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-start gap-4">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

export function TaskDetailsSheet({ open, onOpenChange, task }: TaskDetailsSheetProps) {
  const { toast } = useToast();
  // In a real app, you would fetch fresh data or have a more robust state management solution
  const [editableTask, setEditableTask] = React.useState<Task>(task);
  const [comments, setComments] = React.useState<Comment[]>(
    placeholderComments.filter((c) => c.taskId === task.id)
  );
  const [newComment, setNewComment] = React.useState('');

  React.useEffect(() => {
    setEditableTask(task);
    setComments(placeholderComments.filter((c) => c.taskId === task.id));
  }, [task]);

  const assignedUser = placeholderUsers.find((u) => u.id === editableTask.assignedUserId);
  const project = placeholderProjects.find((p) => p.id === editableTask.projectId);
  const currentUser = placeholderUsers[0]; // Mock current user

  const handleFieldChange = (field: keyof Task, value: any) => {
    setEditableTask(prev => ({...prev, [field]: value}));
  }

  const handleSaveChanges = () => {
    // In a real app, you'd call an API here to save the task.
    // For now, we'll just show a toast notification.
    console.log('Saving changes:', editableTask);
    toast({
        title: "Task Saved",
        description: `Changes to "${editableTask.title}" have been saved.`,
    })
    onOpenChange(false);
  }

  const handlePostComment = () => {
    if (!newComment.trim()) return;
    const newCommentObject: Comment = {
        id: `comment-${Date.now()}`,
        taskId: task.id,
        userId: currentUser.id,
        content: newComment,
        createdAt: new Date(),
    };
    placeholderComments.push(newCommentObject);
    setComments(prevComments => [...prevComments, newCommentObject]);
    setNewComment('');
  };


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-3xl sm:max-w-3xl flex flex-col">
        <SheetHeader>
           <Input 
                id="title"
                value={editableTask.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                className="text-lg font-semibold h-auto p-0 border-none focus-visible:ring-0 shadow-none"
            />
          <SheetDescription>
            In project <span className="font-semibold text-foreground">{project?.name}</span>
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pr-6 -mr-6 pl-1 -ml-1">
          <div className="space-y-6 py-4">
            
            <dl className="space-y-4">
               <DetailRow icon={GripVertical} label="Status">
                <Select
                    value={editableTask.status}
                    onValueChange={(value: TaskStatus) => handleFieldChange('status', value)}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Set status" />
                    </SelectTrigger>
                    <SelectContent>
                        {taskStatuses.map(status => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
               </DetailRow>
               <DetailRow icon={User} label="Assignee">
                 <Select
                    value={editableTask.assignedUserId}
                    onValueChange={(value) => handleFieldChange('assignedUserId', value)}
                 >
                    <SelectTrigger className="w-[180px]">
                         <SelectValue placeholder="Select Assignee">
                            {assignedUser ? (
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                        <AvatarImage src={assignedUser.avatar} />
                                        <AvatarFallback>{assignedUser.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span>{assignedUser.name}</span>
                                </div>
                            ) : 'Unassigned'}
                         </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {placeholderUsers.filter(u => u.companyId === task.companyId).map(user => (
                            <SelectItem key={user.id} value={user.id}>
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                        <AvatarImage src={user.avatar} />
                                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span>{user.name}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                 </Select>
               </DetailRow>
               <DetailRow icon={CalendarIcon} label="Due Date">
                 <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        variant={'outline'}
                        className={cn(
                        'w-[180px] justify-start text-left font-normal',
                        !editableTask.dueDate && 'text-muted-foreground'
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editableTask.dueDate ? format(editableTask.dueDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={editableTask.dueDate}
                        onSelect={(date) => handleFieldChange('dueDate', date)}
                        initialFocus
                    />
                    </PopoverContent>
                </Popover>
               </DetailRow>
                <DetailRow icon={Tag} label="Priority">
                    <Select
                        value={editableTask.priority}
                        onValueChange={(value: TaskPriority) => handleFieldChange('priority', value)}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Set priority" />
                        </SelectTrigger>
                        <SelectContent>
                            {taskPriorities.map(priority => (
                                <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </DetailRow>
                 <DetailRow icon={GripVertical} label="Description">
                     <Textarea
                        id="description"
                        placeholder="Add a detailed description for the task..."
                        value={editableTask.description}
                        onChange={(e) => handleFieldChange('description', e.target.value)}
                        className="min-h-[120px]"
                    />
                </DetailRow>
            </dl>
            
            <Separator />

            <div>
                <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Activity
                </h4>
                <div className="space-y-6">
                    <div className="flex items-start gap-3">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={currentUser.avatar} />
                            <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-2">
                            <Textarea 
                                placeholder="Write a comment..." 
                                className="text-sm"
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm"><Paperclip className="h-4 w-4 mr-2" />Attach</Button>
                                <Button size="sm" onClick={handlePostComment} disabled={!newComment.trim()}>Post Comment</Button>
                            </div>
                        </div>
                    </div>

                    {comments
                        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
                        .map(comment => {
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
         <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button onClick={handleSaveChanges}>Save Changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
