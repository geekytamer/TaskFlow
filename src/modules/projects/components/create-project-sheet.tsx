'use client';

import * as React from 'react';
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
import { PlusCircle } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export function CreateProjectSheet() {
  const [open, setOpen] = React.useState(false);
  const [color, setColor] = React.useState('#4A90E2');

  const defaultColors = [
    '#4A90E2', '#F5A623', '#7ED321', '#B452E5',
    '#50E3C2', '#E94A6E', '#03A9F4', '#FFC107'
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline"><PlusCircle className="mr-2 h-4 w-4" />New Project</Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-lg sm:max-w-lg flex flex-col">
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
              <Input id="name" placeholder="e.g. Q4 Marketing Campaign" className="col-span-3" />
            </div>
            
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">
                Visibility
              </Label>
               <div className="col-span-3">
                <Select defaultValue='Public'>
                    <SelectTrigger>
                    <SelectValue placeholder="Select visibility" />
                    </SelectTrigger>
                    <SelectContent>
                    {projectVisibilities.map((visibility) => (
                        <SelectItem key={visibility} value={visibility}>
                        {visibility}
                        </SelectItem>
                    ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                    Public projects are visible to everyone. Private projects are only visible to assigned members.
                </p>
              </div>
            </div>

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
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button type="submit">Create Project</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
