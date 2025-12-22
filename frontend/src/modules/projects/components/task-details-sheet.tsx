'use client';

import * as React from 'react';
import Image from 'next/image';
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
import { getProjectById, getCommentsByTaskId, createComment, updateTask, getTasks } from '@/services/projectService';
import { getUsersByCompany } from '@/services/userService';
import type { Task, Comment, TaskStatus, TaskPriority, Project, User } from '@/modules/projects/types';
import { taskStatuses, taskPriorities } from '@/modules/projects/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { Calendar as CalendarIcon, User as UserIcon, Tag, MessageSquare, GripVertical, Pencil, FileImage, Info } from 'lucide-react';
import { MultiSelect, type MultiSelectItem } from '@/components/ui/multi-select';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';

interface TaskDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdate: () => void;
  task: Task;
}

function DetailRow({ icon: Icon, label, children }: { icon: React.ElementType, label: string, children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-4">
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
  const { selectedCompany, currentUser } = useCompany();

  const [editableTask, setEditableTask] = React.useState<Task>(task);
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [project, setProject] = React.useState<Project | undefined>();
  const [companyUsers, setCompanyUsers] = React.useState<MultiSelectItem[]>([]);
  const [allUsers, setAllUsers] = React.useState<User[]>([]);
  const [allTasks, setAllTasks] = React.useState<Task[]>([]);
  const [newComment, setNewComment] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [invoicePreview, setInvoicePreview] = React.useState<string | null>(task.invoiceImage || null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    async function loadData() {
        if (!task || !selectedCompany) return;
        setLoading(true);
        setEditableTask(task);
        setInvoicePreview(task.invoiceImage || null);
        const [projectData, commentsData, companyUsersData, tasksData] = await Promise.all([
            getProjectById(task.projectId),
            getCommentsByTaskId(task.id),
            getUsersByCompany(selectedCompany.id),
            getTasks(),
        ]);
        setProject(projectData);
        setComments(commentsData);
        setAllUsers(companyUsersData);
        setCompanyUsers(companyUsersData.map(u => ({ value: u.id, label: u.name, icon: UserIcon })));
        setAllTasks(tasksData.filter(t => t.companyId === selectedCompany.id && t.id !== task.id));
        setLoading(false);
    }
    if (open) {
      loadData();
    }
  }, [task, selectedCompany, open]);

  const handleFieldChange = (field: keyof Task, value: any) => {
    setEditableTask(prev => ({...prev, [field]: value}));
  }

  const handleInvoiceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUri = reader.result as string;
        setInvoicePreview(dataUri);
        handleFieldChange('invoiceImage', dataUri);
      };
      reader.readAsDataURL(file);
    }
  };

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
      <SheetContent className="w-full max-w-2xl sm:max-w-2xl flex flex-col">
        {loading ? (
             <div className="space-y-4 py-4">
                <SheetHeader>
                    <SheetTitle><Skeleton className="h-8 w-3/4" /></SheetTitle>
                    <SheetDescription><Skeleton className="h-4 w-1/2" /></SheetDescription>
                </SheetHeader>
                <div className="py-6 space-y-6">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </div>
        ) : (
        <>
            <SheetHeader>
              <SheetTitle>{editableTask?.title || "Task Details"}</SheetTitle>
              <SheetDescription>
                In project <span className="font-semibold text-foreground">{project?.name}</span>
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto pr-6 -mr-6 pl-1 -ml-1">
            <div className="space-y-6 py-4">
                
                <dl className="space-y-4">
                  <DetailRow icon={Pencil} label="Title">
                      <Input 
                          id="title"
                          value={editableTask.title}
                          onChange={(e) => handleFieldChange('title', e.target.value)}
                          className="font-medium"
                      />
                  </DetailRow>
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
                  <DetailRow icon={UserIcon} label="Parent Task">
                    <Select
                      value={editableTask.parentTaskId || 'none'}
                      onValueChange={(value) => handleFieldChange('parentTaskId', value === 'none' ? undefined : value)}
                    >
                      <SelectTrigger className="w-[240px]">
                        <SelectValue placeholder="No parent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No parent</SelectItem>
                        {allTasks
                          .filter((t) => t.projectId === editableTask.projectId)
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.title}
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
                       <FileImage className="h-5 w-5" />
                        Invoice Details
                    </h4>
                    <div className="space-y-4">
                      <div className="grid grid-cols-[120px_1fr] items-start gap-4">
                        <Label className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                            <span>Invoice Image</span>
                        </Label>
                        <div className="flex flex-col gap-2">
                           <Input
                                id="invoiceImage"
                                type="file"
                                ref={fileInputRef}
                                onChange={handleInvoiceImageUpload}
                                accept="image/*"
                                className="hidden"
                            />
                            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                                Upload Image
                            </Button>
                            {invoicePreview && (
                                <Image
                                    src={invoicePreview}
                                    alt="Invoice preview"
                                    width={200}
                                    height={200}
                                    className="rounded-md border object-cover aspect-square"
                                />
                            )}
                        </div>
                      </div>
                      <DetailRow icon={Info} label="Vendor">
                         <Input 
                            value={editableTask.invoiceVendor || ''}
                            onChange={(e) => handleFieldChange('invoiceVendor', e.target.value)}
                            placeholder="e.g. Acme Inc."
                         />
                      </DetailRow>
                      <DetailRow icon={Info} label="Invoice Number">
                         <Input 
                             value={editableTask.invoiceNumber || ''}
                             onChange={(e) => handleFieldChange('invoiceNumber', e.target.value)}
                             placeholder="e.g. INV-12345"
                         />
                      </DetailRow>
                      <DetailRow icon={Info} label="Invoice Amount">
                         <Input 
                             type="number"
                             value={editableTask.invoiceAmount || ''}
                             onChange={(e) => handleFieldChange('invoiceAmount', parseFloat(e.target.value))}
                             placeholder="e.g. 199.99"
                         />
                      </DetailRow>
                      <DetailRow icon={CalendarIcon} label="Invoice Date">
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={'outline'}
                                    className={cn(
                                    'w-[180px] justify-start text-left font-normal',
                                    !editableTask.invoiceDate && 'text-muted-foreground'
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {editableTask.invoiceDate ? format(editableTask.invoiceDate, 'PPP') : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={editableTask.invoiceDate}
                                    onSelect={(date) => handleFieldChange('invoiceDate', date)}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                      </DetailRow>
                    </div>
                </div>

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
                                    <Button size="sm" onClick={handlePostComment} disabled={!newComment.trim()}>Post Comment</Button>
                                </div>
                            </div>
                        </div>}

                        {comments
                            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
                            .map(comment => {
                            const commentUser = allUsers.find(u => u.id === comment.userId);
                            return (
                                <div key={comment.id} className="flex items-start gap-3">
                                    <Avatar className="h-9 w-9">
                                       {commentUser ? (
                                           <>
                                            <AvatarImage src={commentUser.avatar} />
                                            <AvatarFallback>{commentUser.name.charAt(0)}</AvatarFallback>
                                           </>
                                       ) : (
                                            <UserIcon className="h-5 w-5 text-muted-foreground" />
                                       )}
                                    </Avatar>
                                    <div className='flex-1'>
                                        <div className="flex items-baseline gap-2">
                                            <p className="font-semibold text-sm">{commentUser?.name || 'Unknown User'}</p>
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
