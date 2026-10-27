'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarIcon, LayoutTemplate, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getCurrentLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';
import { createProjectFromTemplate, deleteProjectTemplate, getProjectTemplates } from '@/services/projectService';
import type { ProjectTemplateSummary } from '../types';

/** Start a project from a saved template: pick it, name the new project and its first day. */
export function ProjectFromTemplateSheet() {
  const { selectedCompany, refreshProjects } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [templates, setTemplates] = React.useState<ProjectTemplateSummary[] | null>(null);
  const [chosen, setChosen] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [start, setStart] = React.useState<Date>(() => new Date());
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!selectedCompany) return;
    setTemplates(await getProjectTemplates(selectedCompany.id).catch(() => []));
  }, [selectedCompany]);
  React.useEffect(() => { if (open) void load(); }, [open, load]);

  const pick = (t: ProjectTemplateSummary) => {
    setChosen(t.id);
    if (!name.trim()) setName(t.name);
  };

  const create = async () => {
    if (!chosen || !name.trim()) return;
    setBusy(true);
    try {
      const project = await createProjectFromTemplate(chosen, { name: name.trim(), startDate: start.toISOString() });
      toast({ title: tr('Project created', 'تم إنشاء المشروع') });
      refreshProjects();
      setOpen(false);
      setChosen(null);
      setName('');
      router.push(`/projects/${project.id}`);
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Could not create the project', 'تعذّر إنشاء المشروع'), description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline"><LayoutTemplate className="me-2 h-4 w-4" />{tr('From template', 'من قالب')}</Button>
      </SheetTrigger>
      <SheetContent className="flex w-full max-w-lg flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{tr('New project from a template', 'مشروع جديد من قالب')}</SheetTitle>
          <SheetDescription>
            {tr('Stages, tasks, people and checklists are copied; every date moves with the start you pick.', 'تُنسخ المراحل والمهام والأشخاص وقوائم التحقق، وكل التواريخ تتحرك مع البداية التي تختارها.')}
          </SheetDescription>
        </SheetHeader>
        <div className="-me-6 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4 pe-6">
          {templates === null ? null : templates.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {tr('No templates yet. Open a project and choose "Save as template".', 'لا توجد قوالب بعد. افتح مشروعاً واختر "حفظ كقالب".')}
            </p>
          ) : (
            <ul className="space-y-2" role="listbox" aria-label={tr('Templates', 'القوالب')}>
              {templates.map((t) => (
                <li key={t.id} className="group flex items-center gap-2">
                  <button
                    type="button"
                    role="option"
                    aria-selected={chosen === t.id}
                    onClick={() => pick(t)}
                    className={cn('flex-1 rounded-lg border p-3 text-start transition-colors hover:border-primary', chosen === t.id && 'border-primary bg-primary/5')}
                  >
                    <p className="font-medium"><bdi>{t.name}</bdi></p>
                    <p className="text-xs text-muted-foreground">
                      {tr(`${t.tasks} tasks · ${t.milestones} stages`, `${t.tasks} مهمة · ${t.milestones} مراحل`)}
                      {t.lengthDays !== null && ` · ${tr(`${t.lengthDays + 1} days`, `${t.lengthDays + 1} يوم`)}`}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(tr('Delete this template?', 'حذف هذا القالب؟'))) return;
                      await deleteProjectTemplate(t.id).catch(() => undefined);
                      if (chosen === t.id) setChosen(null);
                      void load();
                    }}
                    className="rounded p-2 text-muted-foreground opacity-60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                    aria-label={tr('Delete template', 'حذف القالب')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {chosen && (
            <div className="grid gap-3 rounded-lg border p-3">
              <div className="space-y-2">
                <Label htmlFor="tpl-name">{tr('Project name', 'اسم المشروع')}</Label>
                <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{tr('Starts on', 'يبدأ في')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="me-2 h-4 w-4" />
                      {start.toLocaleDateString(getCurrentLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={start} onSelect={(d) => d && setStart(d)} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
        </div>
        <SheetFooter className="shrink-0 border-t pt-4">
          <Button onClick={create} disabled={!chosen || !name.trim() || busy}>{tr('Create project', 'إنشاء المشروع')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
