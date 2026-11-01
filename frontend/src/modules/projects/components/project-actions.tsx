'use client';

import * as React from 'react';
import { Archive, ArchiveRestore, BookmarkPlus, CalendarClock, CheckCircle2, MoreHorizontal, RotateCcw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getCurrentLocale } from '@/lib/locale';
import { completeProject, postponeProject, saveProjectAsTemplate, updateProject } from '@/services/projectService';
import type { Project } from '../types';

const fmt = (d: Date | string) => new Date(d).toLocaleDateString(getCurrentLocale(), { day: 'numeric', month: 'long' });
const dayDiff = (a: Date, b: Date) => {
  const x = new Date(a);
  const y = new Date(b);
  x.setHours(0, 0, 0, 0);
  y.setHours(0, 0, 0, 0);
  return Math.round((y.getTime() - x.getTime()) / 86_400_000);
};

/**
 * One-tap project moves for admins and managers: move it to another start
 * (everything unfinished moves with it), mark it done, archive or bring it
 * back, and save it as a template.
 */
export function ProjectActions({ project, openTasks, onChanged }: { project: Project; openTasks: number; onChanged: (p: Project) => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [newStart, setNewStart] = React.useState<Date | undefined>();
  const [doneAsk, setDoneAsk] = React.useState(false);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [templateName, setTemplateName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const currentStart = project.startDate ? new Date(project.startDate) : null;
  const shift = currentStart && newStart ? dayDiff(currentStart, newStart) : null;
  const status = project.status ?? 'Active';

  const act = async <T,>(fn: () => Promise<T>, ok: (r: T) => string) => {
    setBusy(true);
    try {
      const r = await fn();
      toast({ title: ok(r) });
      return r;
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: e instanceof Error ? e.message : undefined });
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const move = async () => {
    if (!newStart) return;
    const r = await act(() => postponeProject(project.id, newStart.toISOString()), (res) =>
      tr(`Moved to ${fmt(newStart)}; ${res.moved} open task(s) moved with it`, `تم الترحيل إلى ${fmt(newStart)}، وتحركت معه ${res.moved} مهمة مفتوحة`),
    );
    if (r) {
      onChanged(r.project);
      setMoveOpen(false);
      setNewStart(undefined);
    }
  };

  const complete = async (closeOpenTasks: boolean) => {
    setDoneAsk(false);
    const r = await act(() => completeProject(project.id, closeOpenTasks), (res) =>
      res.closed ? tr(`Project done; ${res.closed} task(s) closed`, `اكتمل المشروع، وأُقفلت ${res.closed} مهمة`) : tr('Project done', 'اكتمل المشروع'),
    );
    if (r) onChanged(r.project);
  };

  const setStatus = async (next: Project['status'], ok: string) => {
    const r = await act(() => updateProject(project.id, { status: next }), () => ok);
    if (r) onChanged(r);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== 'Done' && status !== 'Archived' && (
        <>
          <Popover open={moveOpen} onOpenChange={setMoveOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy}>
                <CalendarClock className="me-1 h-4 w-4" />{tr('Move', 'ترحيل')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="border-b p-3 text-sm">
                <p className="font-medium">{tr('New start date', 'تاريخ البداية الجديد')}</p>
                <p className="text-xs text-muted-foreground">
                  {currentStart
                    ? tr(`Now starts ${fmt(currentStart)}.`, `يبدأ حالياً ${fmt(currentStart)}.`)
                    : tr('No start date yet.', 'لا يوجد تاريخ بداية بعد.')}{' '}
                  {tr('Unfinished tasks and stages move with it.', 'المهام غير المنجزة والمراحل تتحرك معه.')}
                </p>
              </div>
              <Calendar mode="single" selected={newStart} onSelect={setNewStart} defaultMonth={currentStart ?? undefined} initialFocus />
              <div className="flex items-center justify-between gap-2 border-t p-3">
                <span className="text-xs text-muted-foreground">
                  {shift !== null && shift !== 0 && (shift > 0 ? tr(`${shift} day(s) later`, `بعد ${shift} يوم`) : tr(`${-shift} day(s) earlier`, `قبل ${-shift} يوم`))}
                </span>
                <Button size="sm" onClick={move} disabled={!newStart || busy}>{tr('Move', 'ترحيل')}</Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
            onClick={() => (openTasks > 0 ? setDoneAsk(true) : void complete(false))}
          >
            <CheckCircle2 className="me-1 h-4 w-4" />{tr('Mark done', 'تم الإنجاز')}
          </Button>
        </>
      )}
      {status === 'Done' && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void setStatus('Active', tr('Project reopened', 'أُعيد فتح المشروع'))}>
          <RotateCcw className="me-1 h-4 w-4" />{tr('Reopen', 'إعادة فتح')}
        </Button>
      )}
      {status === 'Archived' && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void setStatus('Active', tr('Brought back from the archive', 'أُرجع من الأرشيف'))}>
          <ArchiveRestore className="me-1 h-4 w-4" />{tr('Bring back', 'إرجاع من الأرشيف')}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={tr('More', 'المزيد')}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setTemplateName(project.name); setTemplateOpen(true); }}>
            <BookmarkPlus className="me-2 h-4 w-4" />{tr('Save as template', 'حفظ كقالب')}
          </DropdownMenuItem>
          {status !== 'Archived' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void setStatus('Archived', tr('Archived — its tasks left everyone’s lists', 'أُرشف المشروع، واختفت مهامه من القوائم'))}>
                <Archive className="me-2 h-4 w-4" />{tr('Archive', 'أرشفة')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr('Save as template', 'حفظ كقالب')}</DialogTitle>
            <DialogDescription>
              {tr('Keeps the stages, tasks, people and checklist steps, with dates counted from the start.', 'يحفظ المراحل والمهام والأشخاص وقوائم التحقق، والتواريخ محسوبة من بداية المشروع.')}
            </DialogDescription>
          </DialogHeader>
          <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder={tr('Template name', 'اسم القالب')} />
          <DialogFooter>
            <Button
              disabled={!templateName.trim() || busy}
              onClick={async () => {
                setTemplateOpen(false);
                await act(() => saveProjectAsTemplate(project.id, templateName.trim()), () => tr('Template saved', 'تم حفظ القالب'));
              }}
            >
              {tr('Save', 'حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={doneAsk} onOpenChange={setDoneAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('Mark the project done?', 'إنهاء المشروع؟')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr(`${openTasks} task(s) in it are still open. Close them too?`, `فيه ${openTasks} مهمة لسه مفتوحة. تقفلها كلها معه؟`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{tr('Cancel', 'إلغاء')}</AlertDialogCancel>
            <Button variant="outline" onClick={() => void complete(false)}>{tr('Keep them open', 'أبقها مفتوحة')}</Button>
            <AlertDialogAction onClick={() => void complete(true)}>{tr('Close them all', 'أقفلها كلها')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
