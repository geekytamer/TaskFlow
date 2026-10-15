'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarClock, CheckCircle2, Download, FileText, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useToast } from '@/hooks/use-toast';
import { NewFollowupDialog } from '@/modules/crm/components/followups-page';
import {
  downloadThreadFile,
  getContactConversation,
  updateThread,
  type ConvFile,
  type ThreadDetail,
  type ThreadSummary,
} from '@/services/conversationService';
import { getCompanyMembers, type CompanyMember } from '@/services/userService';
import { nextWeekAt8, tomorrowAt8 } from '../lib/inbox';
import { stateLabel } from './thread-list';

interface Props {
  thread: ThreadSummary;
  detail: ThreadDetail | null;
  /** Optional; list and counts refresh themselves on the app-wide data-changed event. */
  onChanged?: () => void;
}

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fmtSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Who and what this conversation is about, plus the actions staff take on it. */
export function ContextPanel({ thread, detail, onChanged }: Props) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? '';
  const [members, setMembers] = React.useState<CompanyMember[]>([]);
  const [owner, setOwner] = React.useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pickDate, setPickDate] = React.useState(false);
  const [custom, setCustom] = React.useState('');
  const [followupOpen, setFollowupOpen] = React.useState(false);
  const { user } = useAuthGuard();

  React.useEffect(() => {
    if (!companyId) return;
    getCompanyMembers(companyId).then(setMembers).catch(() => setMembers([]));
  }, [companyId]);

  React.useEffect(() => {
    let live = true;
    setOwner(null);
    if (companyId) {
      getContactConversation(companyId, thread.contact.id)
        .then((r) => { if (live) setOwner(r.conversation.owner); })
        .catch(() => undefined);
    }
    return () => { live = false; };
  }, [companyId, thread.contact.id]);

  React.useEffect(() => { setPickDate(false); setCustom(''); }, [thread.id]);

  const run = async (fn: () => Promise<unknown>, fail: string): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      onChanged?.();
      return true;
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : fail, variant: 'destructive' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const snooze = (until: Date) => {
    if (until.getTime() <= Date.now()) {
      toast({ title: tr('Pick a time in the future', 'اختر وقتًا في المستقبل'), variant: 'destructive' });
      return;
    }
    void run(() => updateThread(thread.id, { snoozedUntil: until.toISOString() }), tr('Could not snooze', 'تعذّر التأجيل'))
      .then((ok) => { if (ok) setPickDate(false); });
  };

  const files = (detail?.messages ?? []).flatMap((m) => m.files);
  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString(language === 'ar' ? 'ar-u-nu-latn' : 'en', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  const download = (f: ConvFile) =>
    downloadThreadFile(f).catch((error) =>
      toast({ title: error instanceof Error ? error.message : tr('Download failed', 'فشل التنزيل'), variant: 'destructive' }));

  const section = 'space-y-2 border-b px-4 py-3 last:border-b-0';
  const heading = 'text-xs font-medium text-muted-foreground';

  return (
    <div className="flex flex-col">
      <section className={section} aria-label={tr('Contact', 'جهة الاتصال')}>
        <h3 className={heading}>{tr('Contact', 'جهة الاتصال')}</h3>
        <Link href={`/contacts/${thread.contact.id}`} className="block text-sm font-semibold underline-offset-4 hover:underline">
          <bdi>{thread.contact.name}</bdi>
        </Link>
        <p className="text-xs text-muted-foreground">
          {tr('Owner', 'المسؤول')}: {owner ? <bdi>{owner.name}</bdi> : '—'}
        </p>
        <p className="text-xs text-muted-foreground">
          {stateLabel(thread.state, tr)}
          {thread.state === 'snoozed' && thread.snoozedUntil ? ` · ${tr('until', 'حتى')} ${fmtWhen(thread.snoozedUntil)}` : ''}
        </p>
      </section>

      <section className={section} aria-label={tr('Assigned to', 'مُسندة إلى')}>
        <Label className={heading}>{tr('Assigned to', 'مُسندة إلى')}</Label>
        <Combobox
          options={members.map((m) => ({ value: m.id, label: m.name }))}
          value={thread.assignee?.id ?? ''}
          disabled={busy}
          onValueChange={(id) => void run(() => updateThread(thread.id, { assigneeUserId: id || null }), tr('Could not assign', 'تعذّر الإسناد'))}
          placeholder={tr('Unassigned', 'غير مُسندة')}
          searchPlaceholder={tr('Search teammate…', 'ابحث عن زميل…')}
          clearLabel={tr('Unassigned', 'غير مُسندة')}
        />
      </section>

      <section className={section} aria-label={tr('Actions', 'إجراءات')}>
        <div className="flex flex-wrap gap-2">
          {thread.state === 'done' ? (
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => void run(() => updateThread(thread.id, { state: 'waiting_us' }), tr('Could not reopen', 'تعذّرت إعادة الفتح'))}>
              <RotateCcw className="me-1.5 h-3.5 w-3.5" />{tr('Reopen', 'إعادة فتح')}
            </Button>
          ) : (
            <Button size="sm" disabled={busy}
              onClick={() => void run(() => updateThread(thread.id, { state: 'done' }), tr('Could not mark done', 'تعذّر الإنهاء'))}>
              <CheckCircle2 className="me-1.5 h-3.5 w-3.5" />{tr('Mark done', 'إنهاء')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setFollowupOpen(true)}>
            <CalendarClock className="me-1.5 h-3.5 w-3.5" />{tr('Create follow-up', 'إنشاء متابعة')}
          </Button>
        </div>

        {thread.state !== 'done' && (
          <div className="space-y-2 pt-1">
            <p className={heading}>{tr('Snooze until', 'تأجيل حتى')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => snooze(tomorrowAt8(new Date()))}>
                {tr('Tomorrow 08:00', 'غدًا 08:00')}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => snooze(nextWeekAt8(new Date()))}>
                {tr('Next week', 'الأسبوع القادم')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setPickDate((v) => !v); if (!custom) setCustom(toLocalInput(tomorrowAt8(new Date()))); }}>
                {tr('Pick date…', 'اختر تاريخًا…')}
              </Button>
            </div>
            {pickDate && (
              <div className="flex items-center gap-2">
                <Input type="datetime-local" value={custom} min={toLocalInput(new Date())} onChange={(e) => setCustom(e.target.value)} className="h-8 min-w-0 flex-1 text-xs" />
                <Button size="sm" disabled={busy || !custom} onClick={() => snooze(new Date(custom))}>{tr('Snooze', 'تأجيل')}</Button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className={section} aria-label={tr('Files', 'الملفات')}>
        <h3 className={heading}>{tr('Files in this conversation', 'ملفات هذه المحادثة')}</h3>
        {files.length === 0 ? (
          <p className="text-xs text-muted-foreground">{tr('No files shared yet.', 'لم تُشارَك ملفات بعد.')}</p>
        ) : (
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => void download(f)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-start text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <bdi className="min-w-0 flex-1 truncate">{f.fileName}</bdi>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{fmtSize(f.sizeBytes)}</span>
                  <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {followupOpen && companyId && (
        <NewFollowupDialog
          open={followupOpen}
          onOpenChange={setFollowupOpen}
          tr={tr}
          companyId={companyId}
          members={members}
          contacts={[{ id: thread.contact.id, name: thread.contact.name }]}
          defaultContactId={thread.contact.id}
          meId={user?.id}
          onCreated={() => setFollowupOpen(false)}
        />
      )}
    </div>
  );
}
