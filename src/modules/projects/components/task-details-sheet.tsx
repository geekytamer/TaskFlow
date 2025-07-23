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
import { getProjectById, getCommentsByTaskId, createComment, updateTask } from '@/services/projectService';
import { getUsers, getCurrentUser, getUsersByCompany } from '@/services/userService';
import type { Task, Comment, TaskStatus, TaskPriority, Project, User } from '@/modules/projects/types';
import { taskStatuses, taskPriorities } from '@/modules/projects/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { Calendar as CalendarIcon, User as UserIcon, Tag, Paperclip, MessageSquare, GripVertical } from 'lucide-react';
import { MultiSelect, type MultiSelectItem } from '@/components/ui/multi-select';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';

interface TaskDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdate: () => void;
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

export function TaskDetailsSheet({ open, onOpenChange, onTaskUpdate, task }: TaskDetailsSheetProps) {
  const { toast } = useToast();
  const { selectedCompany } = useCompany();

  const [editableTask, setEditableTask] = React.useState<Task>(task);
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [project, setProject] = React.useState<Project | undefined>();
  const [currentUser, setCurrentUser] = React.useState<User | undefined>();
  const [companyUsers, setCompanyUsers] = React.useState<MultiSelectItem[]>([]);
  const [newComment, setNewComment] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadData() {
        if (!task || !selectedCompany) return;
        setLoading(true);
        setEditableTask(task);
        const [projectData, commentsData, currentUserData, companyUsersData] = await Promise.all([
            getProjectById(task.projectId),
            getCommentsByTaskId(task.id),
            getCurrentUser(),
            getUsersByCompany(selectedCompany.id),
        ]);
        setProject(projectData);
        setComments(commentsData);
        setCurrentUser(currentUserData);
        setCompanyUsers(companyUsersData.map(u => ({ value: u.id, label: u.name, icon: UserIcon })));
        setLoading(false);
    }
    loadData();
  }, [task, selectedCompany]);

  const handleFieldChange = (field: keyof Task, value: any) => {
    setEditableTask(prev => ({...prev, [field]: value}));
  }

  const handleSaveChanges = async () => {
    try {
        await updateTask(editableTask.id, editableTask);
        toast({
            title: "Task Saved",
            description: `Changes to "${editableTask.title}" have been saved.`,
        });
        onTaskUpdate();
        onOpenChange(false);
    } catch (error) {
         toast({
            variant: 'destructive',
            title: "Error",
            description: `Failed to save changes.`,
        });
    }
  }

  const handlePostComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    try {
        const newCommentObject = await createComment({
            taskId: task.id,
            userId: currentUser.id,
            content: newComment,
        });
        setComments(prevComments => [...prevComments, newCommentObject]);
        setNewComment('');
    } catch (error) {
         toast({
            variant: 'destructive',
            title: "Error",
            description: `Failed to post comment.`,
        });
    }
  };


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-3xl sm:max-w-3xl flex flex-col">
        {loading ? (
             <div className="space-y-4 py-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="py-6 space-y-6">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </div>
        ) : (
        <>
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
                <DetailRow icon={UserIcon} label="Assignees">
                    <MultiSelect
                        items={companyUsers}
                        selected={editableTask.assignedUserIds || []}
                        onChange={(selected) => handleFieldChange('assignedUserIds', selected)}
                        placeholder="Select assignees..."
                        className="max-w-xs"
                    />
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
                        {currentUser && <div className="flex items-start gap-3">
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
                        </div>}

                        {comments
                            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
                            .map(comment => {
                            const commentUser = companyUsers.find(u => u.value === comment.userId);
                            return (
                                <div key={comment.id} className="flex items-start gap-3">
                                    <Avatar className="h-9 w-9">
                                        <UserIcon className="h-5 w-5 text-muted-foreground" />
                                    </Avatar>
                                    <div className='flex-1'>
                                        <div className="flex items-baseline gap-2">
                                            <p className="font-semibold text-sm">{commentUser?.label}</p>
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
        </>
        )}
      </SheetContent>
    </Sheet>
  );
}
