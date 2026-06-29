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
import { projectVisibilities, type ProjectVisibility, type Client } from '@/lib/types';
import { PlusCircle, User, Briefcase } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MultiSelect, type MultiSelectItem } from '@/components/ui/multi-select';
import { getUsersByCompany } from '@/services/userService';
import { getClients } from '@/services/financeService';
import { useCompany } from '@/context/company-context';
import { createProject } from '@/services/projectService';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/i18n-context';

export function CreateProjectSheet() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [color, setColor] = React.useState('#4A90E2');
  const [visibility, setVisibility] = React.useState<ProjectVisibility>('Public');
  const [selectedMembers, setSelectedMembers] = React.useState<string[]>([]);
  const { selectedCompany, refreshProjects } = useCompany();
  const [companyUsers, setCompanyUsers] = React.useState<MultiSelectItem[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = React.useState<string | undefined>();
  const { toast } = useToast();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  React.useEffect(() => {
    async function loadData() {
      if (selectedCompany) {
        const [users, clientData] = await Promise.all([
          getUsersByCompany(selectedCompany.id),
          getClients(selectedCompany.id)
        ]);

        const userItems = users.map(user => ({
          value: user.id,
          label: user.name,
          icon: User,
        }));
        setCompanyUsers(userItems);
        setClients(clientData);
      }
    }
    if (open) {
        loadData();
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
        title: tr('Validation Error', 'خطأ في التحقق'),
        description: tr('Project Name and Company are required.', 'اسم المشروع والشركة مطلوبان.'),
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
        clientId: selectedClient,
      });
      toast({
        title: tr('Project Created', 'تم إنشاء المشروع'),
        description: tr(`Project "${name}" has been successfully created.`, `تم إنشاء المشروع "${name}" بنجاح.`),
      });
      refreshProjects(); // Refresh the centralized project list
      // Reset form and close sheet
      setName('');
      setDescription('');
      setColor('#4A90E2');
      setVisibility('Public');
      setSelectedMembers([]);
      setSelectedClient(undefined);
      setOpen(false);
    } catch (error) {
       toast({
        variant: 'destructive',
        title: tr('Error', 'خطأ'),
        description: tr('Failed to create project.', 'تعذّر إنشاء المشروع.'),
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline"><PlusCircle className="me-2 h-4 w-4" />{tr('New Project', 'مشروع جديد')}</Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-lg sm:max-w-lg flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <SheetHeader>
            <SheetTitle>{tr('Create New Project', 'إنشاء مشروع جديد')}</SheetTitle>
            <SheetDescription>
                {tr('Fill in the details below to create a new project.', 'أدخل التفاصيل أدناه لإنشاء مشروع جديد.')}
            </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto pe-6 -me-6">
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-end">
                    {tr('Project Name', 'اسم المشروع')}
                </Label>
                <Input id="name" placeholder={tr('e.g. Q4 Marketing Campaign', 'مثال: حملة تسويق الربع الرابع')} className="col-span-3" value={name} onChange={e => setName(e.target.value)} />
                </div>

                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="description" className="text-end">
                        {tr('Description', 'الوصف')}
                    </Label>
                    <Input id="description" placeholder={tr('A brief description of the project.', 'وصف موجز للمشروع.')} className="col-span-3" value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-end">
                        {tr('Client', 'العميل')}
                    </Label>
                    <div className="col-span-3">
                        <Select value={selectedClient} onValueChange={setSelectedClient}>
                            <SelectTrigger>
                                <div className="flex items-center gap-2">
                                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                                    <SelectValue placeholder={tr('Link to a client (optional)', 'ربط بعميل (اختياري)')} />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                {clients.map((client) => (
                                    <SelectItem key={client.id} value={client.id}>
                                        {client.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-end pt-2">
                    {tr('Visibility', 'الظهور')}
                </Label>
                <div className="col-span-3">
                    <Select value={visibility} onValueChange={(v: ProjectVisibility) => setVisibility(v)}>
                        <SelectTrigger>
                        <SelectValue placeholder={tr('Select visibility', 'اختر مستوى الظهور')} />
                        </SelectTrigger>
                        <SelectContent>
                        {projectVisibilities.map((vis) => (
                            <SelectItem key={vis} value={vis}>
                            {vis === 'Private' ? tr('Private', 'خاص') : tr('Public', 'عام')}
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-2">
                        {tr('Public projects are visible to everyone in the company. Private projects are only visible to selected members.', 'المشاريع العامة مرئية لجميع أعضاء الشركة. المشاريع الخاصة مرئية فقط للأعضاء المحددين.')}
                    </p>
                </div>
                </div>
                
                {visibility === 'Private' && (
                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label className="text-end pt-2">
                            {tr('Members', 'الأعضاء')}
                        </Label>
                        <div className="col-span-3">
                            <MultiSelect
                                items={companyUsers}
                                selected={selectedMembers}
                                onChange={setSelectedMembers}
                                placeholder={tr('Select members...', 'اختر الأعضاء...')}
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                                {tr('Select which members have access to this private project.', 'حدّد الأعضاء الذين يمكنهم الوصول إلى هذا المشروع الخاص.')}
                            </p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="color" className="text-end pt-2">
                        {tr('Project Color', 'لون المشروع')}
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
                        <Label htmlFor="color-input" className="text-sm font-normal">{tr('Custom Color', 'لون مخصّص')}</Label>
                        </div>
                    </div>
                </div>
            </div>
            </div>
            <SheetFooter>
            <SheetClose asChild>
                <Button type="button" variant="outline">{tr('Cancel', 'إلغاء')}</Button>
            </SheetClose>
            <Button type="submit">{tr('Create Project', 'إنشاء المشروع')}</Button>
            </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
