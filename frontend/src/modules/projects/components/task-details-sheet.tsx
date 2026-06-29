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
import { ContributorsPanel } from '@/modules/crm/components/contributors-panel';
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
import { getProjectById, getCommentsByTaskId, createComment, updateTask, deleteTask, getTasks, markTasksAsInvoiced } from '@/services/projectService';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { TaskTimePanel } from './task-time-panel';
import { getCompanyMembers, type CompanyMember } from '@/services/userService';
import type { Task, Comment, TaskStatus, TaskPriority, Project } from '@/modules/projects/types';
import type { User } from '@/modules/users/types';
import { taskStatuses, taskPriorities } from '@/modules/projects/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { add, format, formatDistanceToNow } from 'date-fns';
import { Calendar as CalendarIcon, User as UserIcon, Tag, MessageSquare, GripVertical, Pencil, FileImage, Info, ExternalLink, Trash2 } from 'lucide-react';
import { MultiSelect, type MultiSelectItem } from '@/components/ui/multi-select';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { createInvoice } from '@/services/financeService';
import { Badge } from '@/components/ui/badge';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';
import { useI18n } from '@/context/i18n-context';

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
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const confirm = useConfirm();
  const { selectedCompany, currentUser, currentRole } = useCompany();
  const canCreateFinanceInvoice = currentRole && currentRole !== 'Employee';

  const [editableTask, setEditableTask] = React.useState<Task>(task);
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [project, setProject] = React.useState<Project | undefined>();
  const [companyUsers, setCompanyUsers] = React.useState<MultiSelectItem[]>([]);
  const [allUsers, setAllUsers] = React.useState<CompanyMember[]>([]);
  const [allTasks, setAllTasks] = React.useState<Task[]>([]);
  const [newComment, setNewComment] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [invoicePreview, setInvoicePreview] = React.useState<string | null>(task.invoiceImage || null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [creatingInvoice, setCreatingInvoice] = React.useState(false);

  React.useEffect(() => {
    async function loadData() {
        if (!task || !selectedCompany) return;
        setLoading(true);
        setEditableTask(task);
        setInvoicePreview(task.invoiceImage || null);
        // Any company member (including employees) can load the lightweight
        // member directory, so everyone can assign people to a task.
        const [projectData, commentsData, companyUsersData, tasksData] = await Promise.all([
            getProjectById(task.projectId),
            getCommentsByTaskId(task.id),
            getCompanyMembers(selectedCompany.id),
            getTasks(),
        ]);
        const visibleUsers: CompanyMember[] =
          companyUsersData.length > 0
            ? companyUsersData
            : currentUser
              ? [{ id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar ?? null }]
              : [];
        setProject(projectData);
        setComments(commentsData);
        setAllUsers(visibleUsers);
        setCompanyUsers(visibleUsers.map(u => ({ value: u.id, label: u.name, icon: UserIcon })));
        setAllTasks(tasksData.filter(t => t.companyId === selectedCompany.id && t.id !== task.id));
        setLoading(false);
    }
    if (open) {
      loadData();
    }
  }, [task, selectedCompany, open, currentRole, currentUser]);

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

  const handleCreateFinanceInvoice = async () => {
    if (creatingInvoice) return;
    if (!selectedCompany) {
      toast({
        variant: 'destructive',
        title: tr('Missing company', 'الشركة غير محددة'),
        description: tr('Select a company before creating an invoice.', 'يرجى اختيار شركة قبل إنشاء فاتورة.'),
      });
      return;
    }
    if (!project?.clientId) {
      toast({
        variant: 'destructive',
        title: tr('Missing client', 'العميل غير محدد'),
        description: tr('Assign a client to this project to bill the task.', 'يرجى ربط عميل بهذا المشروع لفوترة المهمة.'),
      });
      return;
    }
    if (!editableTask.invoiceAmount || !editableTask.title) {
      toast({
        variant: 'destructive',
        title: tr('Add invoice details', 'أضف تفاصيل الفاتورة'),
        description: tr('Please add an amount (and optionally number/date) before creating an invoice.', 'يرجى إضافة مبلغ (واختيارياً الرقم/التاريخ) قبل إنشاء الفاتورة.'),
      });
      return;
    }
    if (editableTask.generatedInvoiceId) {
      toast({
        title: tr('Already invoiced', 'تمت الفوترة بالفعل'),
        description: tr('This task is already linked to a finance invoice.', 'هذه المهمة مرتبطة بالفعل بفاتورة مالية.'),
      });
      return;
    }

    setCreatingInvoice(true);
    try {
      const issueDate = editableTask.invoiceDate || new Date();
      const dueDate = add(issueDate, { days: 30 });
      const invoiceNumber =
        editableTask.invoiceNumber?.trim() || `INV-${Date.now().toString().slice(-6)}`;

      const invoice = await createInvoice({
        invoiceNumber,
        companyId: selectedCompany.id,
        clientId: project.clientId,
        issueDate,
        dueDate,
        lineItems: [
          {
            taskId: editableTask.id,
            itemType: 'Task',
            description: editableTask.title,
            quantity: 1,
            unitPrice: editableTask.invoiceAmount || 0,
            amount: editableTask.invoiceAmount || 0,
          },
        ],
        total: editableTask.invoiceAmount || 0,
        status: 'Draft',
        notes: editableTask.description || undefined,
      });

      await markTasksAsInvoiced([editableTask.id], invoice.id);
      setEditableTask((prev) => ({
        ...prev,
        generatedInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      }));
      onTaskUpdate();
      toast({
        title: tr('Invoice created', 'تم إنشاء الفاتورة'),
        description: tr(
          `Linked to ${invoice.invoiceNumber}. Visible in Finance for accountants.`,
          `تم الربط بـ ${invoice.invoiceNumber}. ظاهرة في المالية للمحاسبين.`,
        ),
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not create invoice', 'تعذّر إنشاء الفاتورة'),
        description: error?.message || tr('Please try again.', 'يرجى المحاولة مرة أخرى.'),
      });
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handleSaveChanges = async () => {
    try {
        await updateTask(editableTask.id, editableTask);
        toast({
            title: tr('Task Saved', 'تم حفظ المهمة'),
            description: tr(`Changes to "${editableTask.title}" have been saved.`, `تم حفظ التغييرات على "${editableTask.title}".`),
        });
        onTaskUpdate();
        onOpenChange(false);
    } catch (error) {
         toast({
            variant: 'destructive',
            title: tr('Error', 'خطأ'),
            description: tr(`Failed to save changes.`, 'تعذّر حفظ التغييرات.'),
        });
    }
  }

  const handleDeleteTask = async () => {
    if (!(await confirm({
      title: tr('Delete task?', 'حذف المهمة؟'),
      description: tr(`Delete "${editableTask.title}"? Its comments and time entries will be removed. This cannot be undone.`, `حذف "${editableTask.title}"؟ ستُحذف تعليقاتها وسجلات الوقت الخاصة بها. لا يمكن التراجع عن هذا الإجراء.`),
      confirmText: tr('Delete', 'حذف'),
      cancelText: tr('Cancel', 'إلغاء'),
      destructive: true,
    }))) return;
    try {
      await deleteTask(editableTask.id);
      toast({ title: tr('Task deleted', 'تم حذف المهمة') });
      onTaskUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete task', 'تعذّر حذف المهمة'), description: error?.message });
    }
  };

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
            title: tr('Error', 'خطأ'),
            description: tr(`Failed to post comment.`, 'تعذّر نشر التعليق.'),
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
                    <Skeleton className="h-4 w-1/2 mt-2" />
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
              <SheetTitle>{editableTask?.title || tr('Task Details', 'تفاصيل المهمة')}</SheetTitle>
              <SheetDescription>
                {project ? (
                  <>{tr('In project', 'في المشروع')} <span className="font-semibold text-foreground">{project.name}</span></>
                ) : (
                  <span className="text-muted-foreground">{tr('No project', 'لا يوجد مشروع')}</span>
                )}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto pe-6 -me-6 ps-1 -ms-1">
            <div className="space-y-6 py-4">
                
                <dl className="space-y-4">
                  <DetailRow icon={Pencil} label={tr('Title', 'العنوان')}>
                      <Input 
                          id="title"
                          value={editableTask.title}
                          onChange={(e) => handleFieldChange('title', e.target.value)}
                          className="font-medium"
                      />
                  </DetailRow>
                  <DetailRow icon={GripVertical} label={tr('Status', 'الحالة')}>
                      <Select
                          value={editableTask.status}
                          onValueChange={(value: TaskStatus) => handleFieldChange('status', value)}
                      >
                          <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder={tr('Set status', 'تحديد الحالة')} />
                          </SelectTrigger>
                          <SelectContent>
                              {taskStatuses.map(status => (
                                  <SelectItem key={status} value={status}>{status}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </DetailRow>
                  <DetailRow icon={UserIcon} label={tr('Assignees', 'المكلّفون')}>
                      <MultiSelect
                          items={companyUsers}
                          selected={editableTask.assignedUserIds || []}
                          onChange={(selected) => handleFieldChange('assignedUserIds', selected)}
                          placeholder={tr('Select assignees...', 'اختر المكلّفين...')}
                          className="max-w-xs"
                      />
                  </DetailRow>
                  <DetailRow icon={UserIcon} label={tr('Parent Task', 'المهمة الأصل')}>
                    <Select
                      value={editableTask.parentTaskId || 'none'}
                      onValueChange={(value) => handleFieldChange('parentTaskId', value === 'none' ? undefined : value)}
                    >
                      <SelectTrigger className="w-[240px]">
                        <SelectValue placeholder={tr('No parent', 'لا توجد مهمة أصل')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tr('No parent', 'لا توجد مهمة أصل')}</SelectItem>
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
                  <DetailRow icon={CalendarIcon} label={tr('Due Date', 'تاريخ الاستحقاق')}>
                      <Popover>
                          <PopoverTrigger asChild>
                          <Button
                              variant={'outline'}
                              className={cn(
                              'w-[180px] justify-start text-start font-normal',
                              !editableTask.dueDate && 'text-muted-foreground'
                              )}
                          >
                              <CalendarIcon className="me-2 h-4 w-4" />
                              {editableTask.dueDate ? format(editableTask.dueDate, 'PPP') : <span>{tr('Pick a date', 'اختر تاريخاً')}</span>}
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
                    <DetailRow icon={Tag} label={tr('Priority', 'الأولوية')}>
                        <Select
                            value={editableTask.priority}
                            onValueChange={(value: TaskPriority) => handleFieldChange('priority', value)}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder={tr('Set priority', 'تحديد الأولوية')} />
                            </SelectTrigger>
                            <SelectContent>
                                {taskPriorities.map(priority => (
                                    <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </DetailRow>
                    <DetailRow icon={GripVertical} label={tr('Description', 'الوصف')}>
                        <Textarea
                            id="description"
                            placeholder={tr('Add a detailed description for the task...', 'أضف وصفاً تفصيلياً للمهمة...')}
                            value={editableTask.description}
                            onChange={(e) => handleFieldChange('description', e.target.value)}
                            className="min-h-[120px]"
                        />
                    </DetailRow>
                </dl>
                
                <Separator />

                {selectedCompany && (
                  <>
                    <RecordSupportPanel
                      companyId={selectedCompany.id}
                      entityType="task"
                      entityId={editableTask.id}
                      title={tr('Task Attachments & Timeline', 'مرفقات المهمة والجدول الزمني')}
                      compact
                    />
                    <Separator />
                  </>
                )}

                <div>
                    <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                       <FileImage className="h-5 w-5" />
                        {tr('Invoice Details', 'تفاصيل الفاتورة')}
                    </h4>
                    <div className="space-y-4">
                      <div className="grid grid-cols-[120px_1fr] items-start gap-4">
                        <Label className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                            <span>{tr('Invoice Image', 'صورة الفاتورة')}</span>
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
                                {tr('Upload Image', 'رفع صورة')}
                            </Button>
                            {invoicePreview && (
                                <Image
                                    src={invoicePreview}
                                    alt={tr('Invoice preview', 'معاينة الفاتورة')}
                                    width={200}
                                    height={200}
                                    className="rounded-md border object-cover aspect-square"
                                />
                            )}
                        </div>
                      </div>
                      <DetailRow icon={Info} label={tr('Vendor', 'المورّد')}>
                         <Input
                            value={editableTask.invoiceVendor || ''}
                            onChange={(e) => handleFieldChange('invoiceVendor', e.target.value)}
                            placeholder={tr('e.g. Acme Inc.', 'مثال: شركة أكمي')}
                         />
                      </DetailRow>
                      <DetailRow icon={Info} label={tr('Invoice Number', 'رقم الفاتورة')}>
                         <Input
                             value={editableTask.invoiceNumber || ''}
                             onChange={(e) => handleFieldChange('invoiceNumber', e.target.value)}
                             placeholder={tr('e.g. INV-12345', 'مثال: INV-12345')}
                         />
                      </DetailRow>
                      <DetailRow icon={Info} label={tr('Invoice Amount', 'مبلغ الفاتورة')}>
                         <Input
                             type="number"
                             value={editableTask.invoiceAmount || ''}
                             onChange={(e) => handleFieldChange('invoiceAmount', parseFloat(e.target.value))}
                             placeholder={tr('e.g. 199.99', 'مثال: 199.99')}
                         />
                      </DetailRow>
                      <DetailRow icon={CalendarIcon} label={tr('Invoice Date', 'تاريخ الفاتورة')}>
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={'outline'}
                                    className={cn(
                                    'w-[180px] justify-start text-start font-normal',
                                    !editableTask.invoiceDate && 'text-muted-foreground'
                                    )}
                                >
                                    <CalendarIcon className="me-2 h-4 w-4" />
                                    {editableTask.invoiceDate ? format(editableTask.invoiceDate, 'PPP') : <span>{tr('Pick a date', 'اختر تاريخاً')}</span>}
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
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                        <div className="space-y-1">
                          <p className="font-semibold text-sm">{tr('Finance invoice', 'فاتورة مالية')}</p>
                          <p className="text-sm text-muted-foreground">
                            {editableTask.generatedInvoiceId
                              ? tr(`Linked to invoice ${editableTask.invoiceNumber || editableTask.generatedInvoiceId}`, `مرتبطة بالفاتورة ${editableTask.invoiceNumber || editableTask.generatedInvoiceId}`)
                              : canCreateFinanceInvoice
                                ? tr('Create a finance invoice so accountants can track it without opening the task.', 'أنشئ فاتورة مالية ليتمكن المحاسبون من متابعتها دون فتح المهمة.')
                                : tr('Invoice creation is available to managers, accountants, and admins.', 'إنشاء الفواتير متاح للمدراء والمحاسبين والمشرفين.')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {editableTask.generatedInvoiceId && (
                            <Badge variant="outline" className="gap-1">
                              <ExternalLink className="h-3 w-3" />
                              {tr('In Finance', 'في المالية')}
                            </Badge>
                          )}
                          {canCreateFinanceInvoice && (
                            <Button
                              size="sm"
                              onClick={handleCreateFinanceInvoice}
                              disabled={creatingInvoice}
                              variant={editableTask.generatedInvoiceId ? 'secondary' : 'default'}
                            >
                              {creatingInvoice
                                ? tr('Creating...', 'جارٍ الإنشاء...')
                                : editableTask.generatedInvoiceId
                                  ? tr('Refresh link', 'تحديث الرابط')
                                  : tr('Create invoice', 'إنشاء فاتورة')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                </div>

                <Separator />

                {editableTask?.id ? <TaskTimePanel taskId={editableTask.id} /> : null}

                <Separator />

                <div>
                    <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        {tr('Activity', 'النشاط')}
                    </h4>
                    <div className="space-y-6">
                        {currentUser && <div className="flex items-start gap-3">
                            <Avatar className="h-9 w-9">
                                <AvatarImage src={currentUser.avatar} />
                                <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 space-y-2">
                                <Textarea
                                    placeholder={tr('Write a comment...', 'اكتب تعليقاً...')}
                                    className="text-sm"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                />
                                <div className="flex justify-end gap-2">
                                    <Button size="sm" onClick={handlePostComment} disabled={!newComment.trim()}>{tr('Post Comment', 'نشر التعليق')}</Button>
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
                                            <AvatarImage src={commentUser.avatar ?? undefined} />
                                            <AvatarFallback>{commentUser.name.charAt(0)}</AvatarFallback>
                                           </>
                                       ) : (
                                            <UserIcon className="h-5 w-5 text-muted-foreground" />
                                       )}
                                    </Avatar>
                                    <div className='flex-1'>
                                        <div className="flex items-baseline gap-2">
                                            <p className="font-semibold text-sm">{commentUser?.name || tr('Unknown User', 'مستخدم غير معروف')}</p>
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
            {task?.id && task?.companyId && (
              <div className="rounded-lg border bg-muted/10 p-3 mt-3">
                <ContributorsPanel
                  companyId={task.companyId}
                  sourceType="task"
                  sourceId={task.id}
                  compact
                />
              </div>
            )}
            <SheetFooter>
            <Button variant="outline" className="me-auto text-destructive hover:text-destructive" onClick={handleDeleteTask}>
                <Trash2 className="me-2 h-4 w-4" />
                {tr('Delete', 'حذف')}
            </Button>
            <SheetClose asChild>
                <Button variant="outline">{tr('Cancel', 'إلغاء')}</Button>
            </SheetClose>
            <Button onClick={handleSaveChanges}>{tr('Save Changes', 'حفظ التغييرات')}</Button>
            </SheetFooter>
        </>
        )}
      </SheetContent>
    </Sheet>
  );
}
