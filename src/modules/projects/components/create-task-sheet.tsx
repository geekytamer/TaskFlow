'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getUsersByCompany, getCurrentUser } from '@/services/userService';
import { getProjects, createTask } from '@/services/projectService';
import type { Project, User as UserType } from '@/lib/types';
import { taskPriorities } from '@/modules/projects/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Sparkles, User, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { suggestTaskTags } from '@/ai/flows/suggest-task-tags';
import { useCompany } from '@/context/company-context';
import { MultiSelect, type MultiSelectItem } from '@/components/ui/multi-select';

const createTaskSchema = z.object({
  projectId: z.string({ required_error: 'Please select a project.' }),
  title: z.string().min(3, 'Title must be at least 3 characters.'),
  description: z.string().optional(),
  assignedUserIds: z.array(z.string()).optional(),
  priority: z.enum(taskPriorities),
  dueDate: z.date().optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional(),
});

type CreateTaskFormValues = z.infer<typeof createTaskSchema>;

export function CreateTaskSheet() {
  const [open, setOpen] = React.useState(false);
  const [tagInput, setTagInput] = React.useState('');
  const [suggestedTags, setSuggestedTags] = React.useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = React.useState(false);
  const { toast } = useToast();
  const { selectedCompany } = useCompany();

  const [currentUser, setCurrentUser] = React.useState<UserType | null>(null);
  const [visibleProjects, setVisibleProjects] = React.useState<Project[]>([]);
  const [companyUsers, setCompanyUsers] = React.useState<MultiSelectItem[]>([]);

  const form = useForm<CreateTaskFormValues>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      tags: [],
      assignedUserIds: [],
    }
  });

  React.useEffect(() => {
    async function loadData() {
        if (!selectedCompany) return;
        const [user, projects, users] = await Promise.all([
            getCurrentUser(),
            getProjects(),
            getUsersByCompany(selectedCompany.id),
        ]);
        
        setCurrentUser(user);

        const filteredProjects = projects.filter(p => 
            p.companyId === selectedCompany?.id &&
            (p.visibility === 'Public' || p.memberIds?.includes(user.id) || user.role === 'Admin')
        );
        setVisibleProjects(filteredProjects);
        
        const userItems = users.map(u => ({
            value: u.id,
            label: u.name,
            icon: User,
        }));
        setCompanyUsers(userItems);
    }
    loadData();
  }, [selectedCompany]);

  const descriptionValue = form.watch('description') || '';
  const tagsValue = form.watch('tags') || [];

  const handleSuggestTags = async () => {
    if (!descriptionValue) {
      toast({
        variant: 'destructive',
        title: 'Description needed',
        description: 'Please enter a description to suggest tags.',
      });
      return;
    }
    setIsSuggesting(true);
    try {
      const result = await suggestTaskTags({ taskDescription: descriptionValue });
      setSuggestedTags(result.tags.filter(t => !tagsValue.includes(t)));
    } catch (error) {
      console.error('Failed to suggest tags:', error);
      toast({
        variant: 'destructive',
        title: 'Suggestion Failed',
        description: 'Could not get AI-powered tag suggestions.',
      });
    } finally {
      setIsSuggesting(false);
    }
  };

  const addTag = (tag: string) => {
    const newTag = tag.trim();
    const currentTags = form.getValues('tags') || [];
    if (newTag && !currentTags.includes(newTag)) {
      form.setValue('tags', [...currentTags, newTag]);
      setSuggestedTags(suggestedTags.filter(t => t !== newTag));
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    const currentTags = form.getValues('tags') || [];
    form.setValue('tags', currentTags.filter((tag) => tag !== tagToRemove));
  };
  
  const onSubmit = async (data: CreateTaskFormValues) => {
    if (!selectedCompany) return;
    try {
        await createTask({
            ...data,
            companyId: selectedCompany.id,
            tags: data.tags || [],
        });
        toast({
        title: 'Task Created',
        description: `Task "${data.title}" has been added to the project.`,
        });
        form.reset();
        setOpen(false);
    } catch (error) {
         toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to create task.',
        });
    }
  }


  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button><PlusCircle className="mr-2 h-4 w-4" />New Task</Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-2xl sm:max-w-2xl flex flex-col">
       <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
            <SheetHeader>
              <SheetTitle>Create New Task</SheetTitle>
              <SheetDescription>
                Fill in the details below to add a new task to a project.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto pr-6 -mr-6">
              <div className="grid gap-4 py-4">
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">Project</FormLabel>
                      <div className="col-span-3">
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
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
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">Title</FormLabel>
                      <div className="col-span-3">
                         <FormControl>
                            <Input placeholder="e.g. Design homepage mockups" {...field} />
                        </FormControl>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                     <FormItem className="grid grid-cols-4 items-start gap-4">
                      <FormLabel className="text-right pt-2">Description</FormLabel>
                      <div className="col-span-3">
                        <FormControl>
                          <Textarea
                            placeholder="Add a detailed description for the task..."
                            className="min-h-[120px]"
                            {...field}
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label className="text-right pt-2">Tags</Label>
                  <div className="col-span-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Input
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addTag(tagInput);
                                }
                            }}
                            placeholder="Add a tag and press Enter"
                        />
                         <Button type="button" variant="outline" size="sm" onClick={handleSuggestTags} disabled={isSuggesting}>
                            <Sparkles className={cn("mr-2 h-4 w-4", isSuggesting && "animate-spin")} />
                            {isSuggesting ? 'Thinking...' : 'Suggest'}
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tagsValue.map((tag) => (
                        <Badge key={tag} variant="default">
                          {tag}
                          <button type="button" onClick={() => removeTag(tag)} className="ml-2">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                     {suggestedTags.length > 0 && (
                        <div className="mt-2">
                            <p className="text-xs text-muted-foreground mb-1">Suggestions:</p>
                            <div className="flex flex-wrap gap-1">
                            {suggestedTags.map(tag => (
                                <Button key={tag} type="button" size="xs" variant="outline" onClick={() => addTag(tag)}>
                                    <PlusCircle className="h-3 w-3 mr-1" />
                                    {tag}
                                </Button>
                            ))}
                            </div>
                        </div>
                    )}
                  </div>
                </div>
                 <FormField
                  control={form.control}
                  name="assignedUserIds"
                  render={({ field }) => (
                     <FormItem className="grid grid-cols-4 items-start gap-4">
                        <FormLabel className="text-right pt-2">Assignees</FormLabel>
                        <div className="col-span-3">
                          <MultiSelect
                              items={companyUsers}
                              selected={field.value || []}
                              onChange={field.onChange}
                              placeholder="Select assignees..."
                          />
                        </div>
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                     <FormItem className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">Priority</FormLabel>
                       <div className="col-span-3">
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {taskPriorities.map((priority) => (
                                <SelectItem key={priority} value={priority}>
                                  {priority}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                     <FormItem className="grid grid-cols-4 items-center gap-4">
                        <FormLabel className="text-right">Due Date</FormLabel>
                        <div className="col-span-3">
                        <Popover>
                            <PopoverTrigger asChild>
                               <FormControl>
                                <Button
                                    variant={'outline'}
                                    className={cn(
                                    'w-full justify-start text-left font-normal',
                                    !field.value && 'text-muted-foreground'
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                                </Button>
                               </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                            </PopoverContent>
                        </Popover>
                        </div>
                    </FormItem>
                  )}
                />
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="color" className="text-right">
                        Task Color
                    </Label>
                    <Input id="color" type="color" className="col-span-3 p-1" defaultValue="#cccccc" />
                </div>
              </div>
            </div>
            <SheetFooter>
              <SheetClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </SheetClose>
              <Button type="submit">Create Task</Button>
            </SheetFooter>
         </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
