'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { projectVisibilities, type ProjectVisibility } from '@/modules/projects/types';
import { PlusCircle, User } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MultiSelect, type MultiSelectItem } from '@/components/ui/multi-select';
import { getUsersByCompany } from '@/services/userService';
import { useCompany } from '@/context/company-context';
import type { User as UserType } from '@/lib/types';
import { createProject } from '@/services/projectService';
import { useToast } from '@/hooks/use-toast';

export function CreateProjectSheet() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [color, setColor] = React.useState('#4A90E2');
  const [visibility, setVisibility] = React.useState<ProjectVisibility>('Public');
  const [selectedMembers, setSelectedMembers] = React.useState<string[]>([]);
  const { selectedCompany } = useCompany();
  const [companyUsers, setCompanyUsers] = React.useState<MultiSelectItem[]>([]);
  const { toast } = useToast();

  React.useEffect(() => {
    async function loadUsers() {
      if (selectedCompany) {
        const users = await getUsersByCompany(selectedCompany.id);
        const userItems = users.map(user => ({
          value: user.id,
          label: user.name,
          icon: User,
        }));
        setCompanyUsers(userItems);
      }
    }
    if (open) {
        loadUsers();
    }
  }, [selectedCompany, open]);

  const defaultColors = [
    '#4A90E2', '#F5A623', '#7ED321', '#B452E5',
    '#50E3C2', '#E94A6E', '#03A9F4', '#FFC107'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !selectedCompany) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Project Name and Company are required.',
      });
      return;
    }

    try {
      await createProject({
        name,
        description,
        color,
        companyId: selectedCompany.id,
        visibility,
        memberIds: visibility === 'Private' ? selectedMembers : [],
      });
      toast({
        title: 'Project Created',
        description: `Project "${name}" has been successfully created.`,
      });
      // Reset form and close sheet
      setName('');
      setDescription('');
      setColor('#4A90E2');
      setVisibility('Public');
      setSelectedMembers([]);
      setOpen(false);
      router.refresh(); 
    } catch (error) {
       toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create project.',
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline"><PlusCircle className="mr-2 h-4 w-4" />New Project</Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-lg sm:max-w-lg flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <SheetHeader>
            <SheetTitle>Create New Project</SheetTitle>
            <SheetDescription>
                Fill in the details below to create a new project.
            </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto pr-6 -mr-6">
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                    Project Name
                </Label>
                <Input id="name" placeholder="e.g. Q4 Marketing Campaign" className="col-span-3" value={name} onChange={e => setName(e.target.value)} />
                </div>

                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="description" className="text-right">
                        Description
                    </Label>
                    <Input id="description" placeholder="A brief description of the project." className="col-span-3" value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                
                <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right pt-2">
                    Visibility
                </Label>
                <div className="col-span-3">
                    <Select value={visibility} onValueChange={(v: ProjectVisibility) => setVisibility(v)}>
                        <SelectTrigger>
                        <SelectValue placeholder="Select visibility" />
                        </SelectTrigger>
                        <SelectContent>
                        {projectVisibilities.map((vis) => (
                            <SelectItem key={vis} value={vis}>
                            {vis}
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-2">
                        Public projects are visible to everyone in the company. Private projects are only visible to selected members.
                    </p>
                </div>
                </div>
                
                {visibility === 'Private' && (
                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label className="text-right pt-2">
                            Members
                        </Label>
                        <div className="col-span-3">
                            <MultiSelect
                                items={companyUsers}
                                selected={selectedMembers}
                                onChange={setSelectedMembers}
                                placeholder="Select members..."
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                                Select which members have access to this private project.
                            </p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="color" className="text-right pt-2">
                        Project Color
                    </Label>
                    <div className="col-span-3">
                        <RadioGroup
                            value={color}
                            onValueChange={setColor}
                            className="grid grid-cols-8 gap-2"
                        >
                            {defaultColors.map(c => (
                                <Label key={c} htmlFor={c} className="cursor-pointer">
                                    <RadioGroupItem value={c} id={c} className="sr-only" />
                                    <div 
                                        className="w-8 h-8 rounded-full border-2 border-transparent"
                                        style={{ 
                                            backgroundColor: c,
                                            borderColor: color === c ? 'hsl(var(--primary))' : 'transparent',
                                        }}
                                    />
                                </Label>
                            ))}
                        </RadioGroup>
                        <div className="flex items-center gap-2 mt-2">
                        <Input 
                            id="color-input" 
                            type="color" 
                            className="p-1 h-10 w-16" 
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                        />
                        <Label htmlFor="color-input" className="text-sm font-normal">Custom Color</Label>
                        </div>
                    </div>
                </div>
            </div>
            </div>
            <SheetFooter>
            <SheetClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
            </SheetClose>
            <Button type="submit">Create Project</Button>
            </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
