'use client';

import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { placeholderUsers } from '@/modules/users/data';
import { taskPriorities, type TaskPriority } from '@/modules/tasks/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Sparkles, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { suggestTaskTags } from '@/ai/flows/suggest-task-tags';

export function CreateTaskSheet() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const { toast } = useToast();

  const handleSuggestTags = async () => {
    if (!description) {
      toast({
        variant: 'destructive',
        title: 'Description needed',
        description: 'Please enter a description to suggest tags.',
      });
      return;
    }
    setIsSuggesting(true);
    try {
      const result = await suggestTaskTags({ taskDescription: description });
      setSuggestedTags(result.tags.filter(t => !tags.includes(t)));
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
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setSuggestedTags(suggestedTags.filter(t => t !== newTag));
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };


  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button><PlusCircle className="mr-2 h-4 w-4" />New Task</Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-2xl sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Create New Task</SheetTitle>
          <SheetDescription>
            Fill in the details below to add a new task to the board.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pr-6 -mr-6">
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="title" className="text-right">
                Title
              </Label>
              <Input id="title" placeholder="e.g. Design homepage mockups" className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="description" className="text-right pt-2">
                Description
              </Label>
              <div className="col-span-3">
                <Textarea
                    id="description"
                    placeholder="Add a detailed description for the task..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[120px]"
                />
              </div>
            </div>
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
                     <Button variant="outline" size="sm" onClick={handleSuggestTags} disabled={isSuggesting}>
                        <Sparkles className={cn("mr-2 h-4 w-4", isSuggesting && "animate-spin")} />
                        {isSuggesting ? 'Thinking...' : 'Suggest'}
                    </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="default">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="ml-2">
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
                            <Button key={tag} size="xs" variant="outline" onClick={() => addTag(tag)}>
                                <PlusCircle className="h-3 w-3 mr-1" />
                                {tag}
                            </Button>
                        ))}
                        </div>
                    </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="assignee" className="text-right">
                Assignee
              </Label>
              <Select>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {placeholderUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="priority" className="text-right">
                Priority
              </Label>
              <Select>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {taskPriorities.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="due-date" className="text-right">
                Due Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={'outline'}
                    className={cn(
                      'col-span-3 justify-start text-left font-normal',
                      !description && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {description ? format(new Date(), 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button type="submit">Create Task</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
