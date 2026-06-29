'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { getCompanyMembers, type CompanyMember } from '@/services/userService';
import { getContacts, type Contact } from '@/services/contactService';
import {
  getFollowups, createFollowup, completeFollowup, snoozeFollowup, rescheduleFollowup,
  addFollowupAssignee, removeFollowupAssignee, markFollowupDone,
  getFollowupWorkload, getFollowupCoverageGaps, bulkReassignFollowups,
  followUpChannels, followUpPriorities,
  type Followup, type FollowUpChannel, type FollowUpPriority, type FollowUpOutcome,
  type FollowupWorkload, type FollowupWorkloadRow, type CoverageGap,
} from '@/services/crmService';
import { LogActivityDialog } from './log-activity-dialog';
import Link from 'next/link';
import {
  Phone, MessageCircle, Mail, Users as UsersIcon, CalendarClock, CheckCircle2, Clock, Zap,
  Search, Plus, MoreHorizontal, UserPlus, Pencil, ListTodo, LayoutList, X,
  LayoutGrid, AlertTriangle, Shuffle, TrendingDown,
} from 'lucide-react';

type View = 'today' | 'list' | 'team';

const CHANNEL_ICON: Record<string, React.ElementType> = {
  Call: Phone, WhatsApp: MessageCircle, Email: Mail, Meeting: UsersIcon, Task: ListTodo, Follow: Clock,
};
const CHANNEL_COLOR: Record<string, string> = {
  Call: 'bg-blue-100 text-blue-700', WhatsApp: 'bg-green-100 text-green-700',
  Email: 'bg-violet-100 text-violet-700', Meeting: 'bg-amber-100 text-amber-700', Task: 'bg-slate-100 text-slate-700',
};
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-500', normal: 'bg-slate-300', low: 'bg-slate-200',
};
// Outcome → default next-touch (days). Absent ⇒ thread ends (no next step).
const NEXT_DAYS: Record<string, number> = {
  no_answer: 1, left_voicemail: 2, busy: 1, connected: 3, sent: 2, held: 7, no_show: 1, rescheduled: 0, bounced: 0,
};
const OUTCOMES_BY_CHANNEL: Record<string, FollowUpOutcome[]> = {
  Call: ['connected', 'no_answer', 'left_voicemail', 'busy', 'wrong_number', 'booked_meeting', 'not_interested'],
  WhatsApp: ['sent', 'replied', 'bounced', 'opted_out', 'booked_meeting', 'not_interested'],
  Email: ['sent', 'replied', 'bounced', 'opted_out', 'booked_meeting', 'not_interested'],
  Meeting: ['held', 'no_show', 'rescheduled', 'booked_meeting', 'not_interested'],
  Task: ['done', 'rescheduled'],
};

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const isOverdue = (d?: Date) => !!d && d < new Date();
const isToday = (d?: Date) => !!d && startOfDay(d).getTime() === startOfDay(new Date()).getTime();
const fmt = (d?: Date) => (d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');
const fmtTime = (d?: Date) => (d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
const atNineAm = (days: number) => { const x = new Date(); x.setDate(x.getDate() + days); x.setHours(9, 0, 0, 0); return x; };

export function FollowupsPage() {
  const { selectedCompany, currentRole, currentUser } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const canManage = currentRole === 'Admin' || currentRole === 'Manager';

  const [followups, setFollowups] = React.useState<Followup[]>([]);
  const [members, setMembers] = React.useState<CompanyMember[]>([]);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [view, setView] = React.useState<View>('today');
  const [search, setSearch] = React.useState('');
  const [ownerFilter, setOwnerFilter] = React.useState<'all' | 'mine'>(canManage ? 'all' : 'mine');
  const [channelFilter, setChannelFilter] = React.useState<'all' | FollowUpChannel>('all');

  const [createOpen, setCreateOpen] = React.useState(false);
  const [completeFor, setCompleteFor] = React.useState<Followup | null>(null);
  const [logFor, setLogFor] = React.useState<Followup | null>(null);
  const [shareFor, setShareFor] = React.useState<Followup | null>(null);

  const load = React.useCallback(async () => {
    if (!selectedCompany) { setFollowups([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [fu, mem, cts] = await Promise.all([
        getFollowups(selectedCompany.id, ownerFilter === 'mine' && currentUser ? { ownerUserId: currentUser.id } : undefined),
        getCompanyMembers(selectedCompany.id),
        getContacts(selectedCompany.id),
      ]);
      setFollowups(fu);
      setMembers(mem);
      setContacts(cts);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not load follow-ups', 'تعذر تحميل المتابعات'), description: error?.message });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, ownerFilter, currentUser, toast, tr]);

  React.useEffect(() => { load(); }, [load]);

  const memberName = React.useCallback((id?: string) => members.find((m) => m.id === id)?.name, [members]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return followups.filter((f) => {
      if (channelFilter !== 'all' && f.channel !== channelFilter) return false;
      if (!q) return true;
      return (f.summary || '').toLowerCase().includes(q)
        || (f.contact?.name || '').toLowerCase().includes(q)
        || (f.nextAction || '').toLowerCase().includes(q);
    });
  }, [followups, search, channelFilter]);

  const groups = React.useMemo(() => {
    const g: { overdue: Followup[]; today: Followup[]; upcoming: Followup[] } = { overdue: [], today: [], upcoming: [] };
    for (const f of filtered) {
      const d = f.dueAt ?? f.nextActionDueDate;
      if (isOverdue(d) && !isToday(d)) g.overdue.push(f);
      else if (isToday(d)) g.today.push(f);
      else g.upcoming.push(f);
    }
    return g;
  }, [filtered]);

  const overdueCt = groups.overdue.length;
  const todayCt = groups.today.length;

  const optimisticRemove = (id: string) => setFollowups((prev) => prev.filter((x) => x.id !== id));

  const doSnooze = async (f: Followup, days: number, hours = 0) => {
    const until = hours ? new Date(Date.now() + hours * 3600000) : atNineAm(days);
    try { await snoozeFollowup(f.id, until); optimisticRemove(f.id); toast({ title: tr('Snoozed', 'تأجيل') }); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Could not snooze', 'تعذر التأجيل'), description: e?.message }); }
  };
  const doReschedule = async (f: Followup, days: number) => {
    try { await rescheduleFollowup(f.id, atNineAm(days), f.nextAction); await load(); toast({ title: tr('Rescheduled', 'إعادة جدولة') }); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Could not reschedule', 'تعذر إعادة الجدولة'), description: e?.message }); }
  };
  const doQuickDone = async (f: Followup) => {
    try { await markFollowupDone(f.id); optimisticRemove(f.id); toast({ title: tr('Done', 'تم') }); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Could not complete', 'تعذر الإكمال'), description: e?.message }); }
  };
  const doAddAssignee = async (f: Followup, userId: string) => {
    try { return await addFollowupAssignee(f.id, userId); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Could not add teammate', 'تعذر إضافة الزميل'), description: e?.message }); throw e; }
  };
  const doRemoveAssignee = async (f: Followup, userId: string) => {
    try { return await removeFollowupAssignee(f.id, userId); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Could not remove teammate', 'تعذر إزالة الزميل'), description: e?.message }); throw e; }
  };

  return (
    <SectionPageShell title={tr('Follow-ups', 'المتابعات')} description={tr('Your relationship workqueue — never let a thread go cold.', 'قائمة عمل علاقاتك — لا تدع أي خيط يبرد.')}>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5">
            {(canManage ? (['today', 'list', 'team'] as const) : (['today', 'list'] as const)).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                {v === 'today' ? <Clock className="h-3.5 w-3.5" /> : v === 'list' ? <LayoutList className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
                {v === 'today' ? tr('Today', 'اليوم') : v === 'list' ? tr('List', 'قائمة') : tr('Team', 'الفريق')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border bg-red-50 px-2.5 py-1 text-xs">
            <span className="font-semibold text-red-700">{overdueCt}</span><span className="text-red-600">{tr('overdue', 'متأخر')}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border bg-orange-50 px-2.5 py-1 text-xs">
            <span className="font-semibold text-orange-700">{todayCt}</span><span className="text-orange-600">{tr('today', 'اليوم')}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view !== 'team' && (
            <>
              <div className="relative">
                <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="ps-8 w-44" placeholder={tr('Search…', 'بحث…')} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as any)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr('All channels', 'كل القنوات')}</SelectItem>
                  {followUpChannels.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {canManage && (
                <Select value={ownerFilter} onValueChange={(v) => setOwnerFilter(v as any)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr('All owners', 'كل المالكين')}</SelectItem>
                    <SelectItem value="mine">{tr('Mine', 'لي')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="me-1.5 h-4 w-4" />{tr('New follow-up', 'متابعة جديدة')}</Button>
        </div>
      </div>

      {view === 'team' && selectedCompany ? (
        <TeamView companyId={selectedCompany.id} tr={tr} members={members} meId={currentUser?.id} />
      ) : loading ? (
        <div className="mt-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState tr={tr} onNew={() => setCreateOpen(true)} />
      ) : view === 'today' ? (
        <div className="mt-4 space-y-5">
          {([['overdue', tr('Overdue', 'متأخرة'), 'text-red-600'], ['today', tr('Today', 'اليوم'), 'text-orange-600'], ['upcoming', tr('Upcoming', 'القادمة'), 'text-muted-foreground']] as const).map(([key, label, color]) =>
            groups[key].length === 0 ? null : (
              <section key={key}>
                <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${color}`}>{label} · {groups[key].length}</h3>
                <div className="space-y-2">
                  {groups[key].map((f) => (
                    <FollowupCard key={f.id} f={f} tr={tr} meId={currentUser?.id}
                      memberName={memberName}
                      onComplete={() => setCompleteFor(f)} onLog={() => setLogFor(f)}
                      onSnooze={(d, h) => doSnooze(f, d, h)} onReschedule={(d) => doReschedule(f, d)}
                      onQuickDone={() => doQuickDone(f)} onShareOpen={() => setShareFor(f)} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{tr('Contact', 'جهة الاتصال')}</TableHead>
              <TableHead>{tr('Next action', 'الإجراء التالي')}</TableHead>
              <TableHead>{tr('Channel', 'القناة')}</TableHead>
              <TableHead>{tr('Due', 'الاستحقاق')}</TableHead>
              <TableHead>{tr('Owner', 'المالك')}</TableHead>
              <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((f) => {
                const due = f.dueAt ?? f.nextActionDueDate;
                return (
                  <TableRow key={f.id} className={isOverdue(due) ? 'bg-red-50/30' : ''}>
                    <TableCell className="font-medium">
                      {f.contact ? <Link href={`/contacts/${f.contact.id}`} className="hover:underline">{f.contact.name}</Link> : <span className="italic text-muted-foreground">{tr('Deleted contact', 'جهة اتصال محذوفة')}</span>}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-sm">{f.nextAction || f.summary}</TableCell>
                    <TableCell><ChannelPill channel={f.channel} isAuto={f.isAuto} tr={tr} /></TableCell>
                    <TableCell><DueBadge due={due} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{memberName(f.ownerUserId) || f.ownerName || '—'}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCompleteFor(f)}>
                          <CheckCircle2 className="me-1 h-3 w-3" />{tr('Complete', 'إكمال')}
                        </Button>
                        <RowMenu tr={tr}
                          onReschedule={(d) => doReschedule(f, d)}
                          onShareOpen={() => setShareFor(f)} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {createOpen && selectedCompany && (
        <NewFollowupDialog open={createOpen} onOpenChange={setCreateOpen} tr={tr}
          companyId={selectedCompany.id} members={members} contacts={contacts} meId={currentUser?.id}
          onCreated={() => { setCreateOpen(false); load(); }} />
      )}
      {completeFor && (
        <CompleteDialog f={completeFor} tr={tr} onOpenChange={(o) => !o && setCompleteFor(null)}
          onDone={() => { setCompleteFor(null); load(); }} />
      )}
      {shareFor && (
        <ShareDialog f={shareFor} tr={tr} members={members} meId={currentUser?.id}
          onClose={() => { setShareFor(null); load(); }} onChanged={() => { /* refresh on close */ }}
          onAdd={(uid) => doAddAssignee(shareFor, uid)} onRemove={(uid) => doRemoveAssignee(shareFor, uid)} />
      )}
      <LogActivityDialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}
        contactId={logFor?.contact?.id ?? ''} contactName={logFor?.contact?.name} onLogged={() => { setLogFor(null); load(); }} />
    </SectionPageShell>
  );
}

function ChannelPill({ channel, isAuto, tr }: { channel?: string; isAuto?: boolean; tr: (e: string, a: string) => string }) {
  const Icon = CHANNEL_ICON[channel ?? 'Follow'] ?? Clock;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${CHANNEL_COLOR[channel ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
        <Icon className="h-3 w-3" />{channel ?? tr('Follow-up', 'متابعة')}
      </span>
      {isAuto && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">{tr('Auto', 'تلقائي')}</span>}
    </span>
  );
}

function DueBadge({ due }: { due?: Date }) {
  if (!due) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = isOverdue(due) && !isToday(due) ? 'bg-red-100 text-red-700' : isToday(due) ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600';
  const t = fmtTime(due);
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{fmt(due)}{t && t !== '12:00 AM' ? ` · ${t}` : ''}</span>;
}

function channelHref(channel?: string, contact?: Followup['contact']): string | null {
  if (!contact) return null;
  const phone = (contact.phone || '').replace(/[^0-9]/g, '');
  if (channel === 'Call' && contact.phone) return `tel:${contact.phone}`;
  if (channel === 'WhatsApp' && phone) return `https://wa.me/${phone}`;
  if (channel === 'Email' && contact.email) return `mailto:${contact.email}`;
  return null;
}

function FollowupCard({
  f, tr, meId, memberName, onComplete, onLog, onSnooze, onReschedule, onQuickDone, onShareOpen,
}: {
  f: Followup; tr: (e: string, a: string) => string; meId?: string;
  memberName: (id?: string) => string | undefined;
  onComplete: () => void; onLog: () => void; onSnooze: (d: number, h?: number) => void; onReschedule: (d: number) => void;
  onQuickDone: () => void; onShareOpen: () => void;
}) {
  const due = f.dueAt ?? f.nextActionDueDate;
  const href = channelHref(f.channel, f.contact);
  const ChIcon = CHANNEL_ICON[f.channel ?? 'Follow'] ?? Clock;
  const ownerIsOther = f.ownerUserId && f.ownerUserId !== meId;
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CHANNEL_COLOR[f.channel ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
          <ChIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[f.priority ?? 'normal']}`} title={f.priority} />
            {f.contact ? (
              <Link href={`/contacts/${f.contact.id}`} className="font-medium hover:underline">{f.contact.name}</Link>
            ) : <span className="font-medium italic text-muted-foreground">{tr('Deleted contact', 'جهة اتصال محذوفة')}</span>}
            <DueBadge due={due} />
            {f.status === 'snoozed' && <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-700">{tr('Snoozed', 'مؤجل')}</span>}
            {f.isAuto && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700" title={f.trigger}>{tr('Auto', 'تلقائي')}</span>}
            {ownerIsOther && <span className="text-xs text-muted-foreground">· {memberName(f.ownerUserId) || f.ownerName}</span>}
            {f.assignees && f.assignees.length > 0 && (
              <span className="flex items-center -space-x-1.5" title={f.assignees.map((a) => a.name || memberName(a.userId)).filter(Boolean).join(', ')}>
                {f.assignees.slice(0, 3).map((a) => (
                  <span key={a.userId} className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-emerald-100 text-[9px] font-semibold text-emerald-700">
                    {initials(a.name || memberName(a.userId))}
                  </span>
                ))}
                {f.assignees.length > 3 && <span className="inline-flex h-5 items-center rounded-full bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-700">+{f.assignees.length - 3}</span>}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{f.nextAction || f.summary}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {href && (
          <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs">
            <a href={href} target={f.channel === 'WhatsApp' ? '_blank' : undefined} rel="noreferrer">
              <ChIcon className="h-3.5 w-3.5" />{f.channel === 'Call' ? tr('Call', 'اتصال') : f.channel === 'WhatsApp' ? tr('WhatsApp', 'واتساب') : tr('Email', 'بريد')}
            </a>
          </Button>
        )}
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={onComplete}>
          <CheckCircle2 className="h-3.5 w-3.5" />{tr('Complete', 'إكمال')}
        </Button>
        {/* Snooze */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="h-8 gap-1 text-xs"><Clock className="h-3.5 w-3.5" />{tr('Snooze', 'تأجيل')}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSnooze(0, 3)}>{tr('Later today', 'لاحقًا اليوم')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(1)}>{tr('Tomorrow 9am', 'غدًا 9ص')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(3)}>{tr('In 3 days', 'خلال 3 أيام')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(7)}>{tr('Next week', 'الأسبوع القادم')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <RowMenu tr={tr} onReschedule={onReschedule} onShareOpen={onShareOpen} onLog={onLog} onQuickDone={onQuickDone} />
      </div>
    </div>
  );
}

function RowMenu({
  tr, onReschedule, onShareOpen, onLog, onQuickDone,
}: {
  tr: (e: string, a: string) => string;
  onReschedule: (d: number) => void; onShareOpen: () => void;
  onLog?: () => void; onQuickDone?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {onQuickDone && <DropdownMenuItem onClick={onQuickDone}><CheckCircle2 className="me-2 h-4 w-4" />{tr('Mark done', 'تحديد كمنجز')}</DropdownMenuItem>}
        <DropdownMenuItem onClick={onShareOpen}><UserPlus className="me-2 h-4 w-4" />{tr('Add teammate…', 'إضافة زميل…')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">{tr('Reschedule', 'إعادة جدولة')}</div>
        <DropdownMenuItem onClick={() => onReschedule(1)}>{tr('Tomorrow', 'غدًا')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onReschedule(3)}>{tr('In 3 days', 'خلال 3 أيام')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onReschedule(7)}>{tr('Next week', 'الأسبوع القادم')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onReschedule(30)}>{tr('Next month', 'الشهر القادم')}</DropdownMenuItem>
        {onLog && (<><DropdownMenuSeparator /><DropdownMenuItem onClick={onLog}><Pencil className="me-2 h-4 w-4" />{tr('Log activity', 'تسجيل نشاط')}</DropdownMenuItem></>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function ShareDialog({
  f, tr, members, meId, onClose, onChanged, onAdd, onRemove,
}: {
  f: Followup; tr: (e: string, a: string) => string; members: CompanyMember[]; meId?: string;
  onClose: () => void; onChanged: () => void;
  onAdd: (uid: string) => Promise<Followup>; onRemove: (uid: string) => Promise<Followup>;
}) {
  const memberName = (id?: string) => members.find((m) => m.id === id)?.name;
  const [assignees, setAssignees] = React.useState(f.assignees ?? []);
  const [pick, setPick] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const ownerName = memberName(f.ownerUserId) || f.ownerName;
  const onIds = new Set([f.ownerUserId, ...assignees.map((a) => a.userId)].filter(Boolean) as string[]);
  const addable = members.filter((m) => !onIds.has(m.id));

  const add = async (uid: string) => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      const updated = await onAdd(uid);
      setAssignees(updated.assignees ?? [...assignees, { userId: uid, name: memberName(uid) }]);
      setPick('');
      onChanged();
    } finally { setBusy(false); }
  };
  const remove = async (uid: string) => {
    setBusy(true);
    try {
      const updated = await onRemove(uid);
      setAssignees(updated.assignees ?? assignees.filter((a) => a.userId !== uid));
      onChanged();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr('Share follow-up', 'مشاركة المتابعة')}</DialogTitle>
          <DialogDescription>
            {f.contact?.name ? `${f.contact.name} · ` : ''}{tr('Add teammates to collaborate — the owner stays the same.', 'أضف زملاء للتعاون — يبقى المالك كما هو.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs text-muted-foreground">{tr('On this follow-up', 'في هذه المتابعة')}</Label>
            <div className="mt-1.5 space-y-1.5">
              {/* Owner */}
              <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{initials(ownerName)}</span>
                <span className="flex-1 truncate text-sm">{ownerName || tr('Unassigned', 'غير مُسند')}{f.ownerUserId === meId ? ` (${tr('me', 'أنا')})` : ''}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{tr('Owner', 'المالك')}</span>
              </div>
              {/* Collaborators */}
              {assignees.map((a) => (
                <div key={a.userId} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">{initials(a.name || memberName(a.userId))}</span>
                  <span className="flex-1 truncate text-sm">{a.name || memberName(a.userId) || a.userId}{a.userId === meId ? ` (${tr('me', 'أنا')})` : ''}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => remove(a.userId)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{tr('Add teammate', 'إضافة زميل')}</Label>
            <div className="mt-1.5">
              <Combobox
                options={addable.map((m) => ({ value: m.id, label: m.id === meId ? `${m.name} (${tr('me', 'أنا')})` : m.name }))}
                value={pick} onValueChange={(v) => { setPick(v); if (v) add(v); }}
                placeholder={addable.length ? tr('Search teammate…', 'ابحث عن زميل…') : tr('Everyone is added', 'تمت إضافة الجميع')}
                searchPlaceholder={tr('Search…', 'بحث…')} clearLabel="—" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{tr('Done', 'تم')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ageDays(d?: Date): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function TeamView({ companyId, tr, members, meId }: {
  companyId: string; tr: (e: string, a: string) => string; members: CompanyMember[]; meId?: string;
}) {
  const { toast } = useToast();
  const [workload, setWorkload] = React.useState<FollowupWorkload | null>(null);
  const [gaps, setGaps] = React.useState<CoverageGap[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reassignFrom, setReassignFrom] = React.useState<FollowupWorkloadRow | null>(null);
  const [scheduling, setScheduling] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [w, g] = await Promise.all([getFollowupWorkload(companyId), getFollowupCoverageGaps(companyId)]);
      setWorkload(w); setGaps(g);
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Could not load team view', 'تعذر تحميل عرض الفريق'), description: e?.message });
    } finally { setLoading(false); }
  }, [companyId, toast, tr]);
  React.useEffect(() => { load(); }, [load]);

  const scheduleForGap = async (g: CoverageGap) => {
    setScheduling(g.opportunityId);
    try {
      await createFollowup(companyId, {
        entityType: 'opportunity', entityId: g.opportunityId,
        title: tr('Next step on ', 'الخطوة التالية في ') + g.title,
        type: 'Follow-up', channel: 'Call', priority: 'normal',
        ownerUserId: g.ownerUserId, dueAt: atNineAm(1),
      });
      toast({ title: tr('Follow-up scheduled', 'تمت جدولة المتابعة') });
      await load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Could not schedule', 'تعذر الجدولة'), description: e?.message });
    } finally { setScheduling(null); }
  };

  if (loading) return <div className="mt-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!workload) return null;

  const maxOpen = Math.max(1, ...workload.byUser.map((u) => u.open));
  const t = workload.totals;

  return (
    <div className="mt-4 space-y-6">
      {/* Totals strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {([
          [tr('Active', 'نشطة'), t.active, 'text-foreground'],
          [tr('Overdue', 'متأخرة'), t.overdue, 'text-red-600'],
          [tr('Due today', 'مستحقة اليوم'), t.dueToday, 'text-orange-600'],
          [tr('Snoozed', 'مؤجلة'), t.snoozed, 'text-purple-600'],
          [tr('Unassigned', 'غير مُسندة'), t.unassigned, 'text-amber-600'],
        ] as const).map(([label, val, color]) => (
          <div key={label} className="rounded-xl border bg-card p-3">
            <div className={`text-2xl font-bold ${color}`}>{val}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {/* Workload heatmap */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <LayoutGrid className="h-3.5 w-3.5" />{tr('Workload by rep', 'العبء حسب المندوب')}
        </h3>
        <div className="space-y-1.5">
          {workload.byUser.map((u) => {
            const upcoming = Math.max(0, u.open - u.overdue - u.dueToday - u.snoozed);
            const seg = (n: number, cls: string) => n > 0 ? <div className={cls} style={{ width: `${(n / maxOpen) * 100}%` }} title={`${n}`} /> : null;
            const oldest = ageDays(u.oldestOverdueAt);
            return (
              <div key={u.userId ?? 'unassigned'} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                <div className="w-32 shrink-0 truncate text-sm font-medium">
                  {u.userId === null ? <span className="text-amber-700">{tr('Unassigned', 'غير مُسندة')}</span> : u.name}{u.userId === meId ? ` (${tr('me', 'أنا')})` : ''}
                </div>
                <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  {seg(u.overdue, 'bg-red-500')}
                  {seg(u.dueToday, 'bg-orange-400')}
                  {seg(upcoming, 'bg-slate-300')}
                  {seg(u.snoozed, 'bg-purple-300')}
                </div>
                <div className="flex w-44 shrink-0 items-center justify-end gap-2 text-xs">
                  {u.overdue > 0 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">{u.overdue} {tr('overdue', 'متأخر')}</span>}
                  {oldest !== null && oldest > 0 && <span className="text-muted-foreground" title={tr('Oldest overdue', 'أقدم متأخر')}>{oldest}{tr('d', 'ي')}</span>}
                  <span className="font-semibold">{u.open}</span>
                  {u.open > 0 && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title={tr('Reassign load', 'إعادة توزيع العبء')} onClick={() => setReassignFrom(u)}>
                      <Shuffle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Coverage gaps */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <TrendingDown className="h-3.5 w-3.5" />{tr('Going cold — open deals with no next step', 'تبرد — صفقات مفتوحة بلا خطوة تالية')} · {gaps.length}
        </h3>
        {gaps.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {tr('Every open deal has a scheduled follow-up. ', 'كل صفقة مفتوحة لها متابعة مجدولة. ')}🎯
          </div>
        ) : (
          <div className="space-y-1.5">
            {gaps.map((g) => (
              <div key={g.opportunityId} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{g.title}</span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{g.stage}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {g.contactName ? `${g.contactName} · ` : ''}{g.ownerName || tr('Unassigned', 'غير مُسندة')}
                    {g.expectedRevenue ? ` · ${g.expectedRevenue.toLocaleString()}` : ''}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={scheduling === g.opportunityId} onClick={() => scheduleForGap(g)}>
                  <Plus className="me-1 h-3 w-3" />{tr('Schedule', 'جدولة')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {reassignFrom && (
        <BulkReassignDialog from={reassignFrom} tr={tr} companyId={companyId} members={members}
          onClose={() => setReassignFrom(null)} onDone={() => { setReassignFrom(null); load(); }} />
      )}
    </div>
  );
}

function BulkReassignDialog({ from, tr, companyId, members, onClose, onDone }: {
  from: FollowupWorkloadRow; tr: (e: string, a: string) => string; companyId: string;
  members: CompanyMember[]; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [onlyOverdue, setOnlyOverdue] = React.useState(from.overdue > 0);
  const [roundRobin, setRoundRobin] = React.useState(false);
  const [toUserId, setToUserId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const others = members.filter((m) => m.id !== from.userId);
  const count = onlyOverdue ? from.overdue : from.open;

  const submit = async () => {
    setBusy(true);
    try {
      const input: any = { fromUserId: from.userId ?? undefined, onlyOverdue };
      if (roundRobin) input.toUserIds = others.map((m) => m.id);
      else input.toUserId = toUserId;
      const res = await bulkReassignFollowups(companyId, input);
      toast({ title: tr('Reassigned', 'تمت إعادة الإسناد'), description: `${res.reassigned} ${tr('follow-ups moved', 'متابعة نُقلت')}` });
      onDone();
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Could not reassign', 'تعذر إعادة الإسناد'), description: e?.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr('Reassign load', 'إعادة توزيع العبء')}</DialogTitle>
          <DialogDescription>
            {tr('Move follow-ups off ', 'نقل المتابعات من ')}<b>{from.userId === null ? tr('Unassigned', 'غير مُسندة') : from.name}</b>{tr(' to balance the team.', ' لموازنة الفريق.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {from.overdue > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
              {tr('Only overdue', 'المتأخرة فقط')} ({from.overdue})
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={roundRobin} onChange={(e) => setRoundRobin(e.target.checked)} />
            {tr('Round-robin across team', 'توزيع بالتناوب على الفريق')}
          </label>
          {!roundRobin && (
            <div className="space-y-1">
              <Label>{tr('Assign to', 'إسناد إلى')}</Label>
              <Combobox options={others.map((m) => ({ value: m.id, label: m.name }))} value={toUserId} onValueChange={setToUserId}
                placeholder={tr('Search teammate…', 'ابحث عن زميل…')} searchPlaceholder={tr('Search…', 'بحث…')} clearLabel="—" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {tr('Will move ', 'سيتم نقل ')}<b>{count}</b>{tr(' follow-up(s).', ' متابعة.')}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={submit} disabled={busy || count === 0 || (!roundRobin && !toUserId)}>{tr('Reassign', 'إعادة إسناد')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ tr, onNew }: { tr: (e: string, a: string) => string; onNew: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700"><CheckCircle2 className="h-6 w-6" /></div>
      <h3 className="text-lg font-semibold">{tr('Inbox zero — nice.', 'لا متابعات معلّقة — رائع.')}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{tr('No open follow-ups match your filters. Every thread is handled.', 'لا توجد متابعات مفتوحة تطابق عوامل التصفية. كل خيط تمت معالجته.')}</p>
      <Button className="mt-4" size="sm" onClick={onNew}><Plus className="me-1.5 h-4 w-4" />{tr('New follow-up', 'متابعة جديدة')}</Button>
    </div>
  );
}

const TYPE_OPTIONS = ['Follow-up', 'Call', 'Email', 'Meeting', 'Task'];

function NewFollowupDialog({
  open, onOpenChange, tr, companyId, members, contacts, meId, onCreated,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; tr: (e: string, a: string) => string;
  companyId: string; members: CompanyMember[]; contacts: Contact[]; meId?: string; onCreated: () => void;
}) {
  const { toast } = useToast();
  const [contactId, setContactId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState('Follow-up');
  const [channel, setChannel] = React.useState<FollowUpChannel | 'none'>('Call');
  const [priority, setPriority] = React.useState<FollowUpPriority>('normal');
  const [ownerUserId, setOwnerUserId] = React.useState(meId ?? '');
  const [dueAt, setDueAt] = React.useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return toLocalInput(d); });
  const [notes, setNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const isMeeting = type === 'Meeting' || channel === 'Meeting';

  const submit = async () => {
    if (!contactId || !title.trim()) {
      toast({ variant: 'destructive', title: tr('Pick a contact and add a next action', 'اختر جهة اتصال وأضف الإجراء التالي') });
      return;
    }
    setSaving(true);
    try {
      await createFollowup(companyId, {
        entityType: 'contact', entityId: contactId, title: title.trim(), type,
        channel: channel === 'none' ? undefined : channel, priority,
        ownerUserId: ownerUserId || undefined, dueAt: dueAt ? new Date(dueAt) : undefined, notes: notes.trim() || undefined,
      });
      onCreated();
      toast({ title: tr('Follow-up scheduled', 'تمت جدولة المتابعة') });
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Could not create', 'تعذر الإنشاء'), description: e?.message });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr('New follow-up', 'متابعة جديدة')}</DialogTitle>
          <DialogDescription>{tr('Schedule the next touch. Assign it to a teammate to share the work.', 'جدوِل اللمسة التالية. أسندها إلى زميل لمشاركة العمل.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>{tr('Contact', 'جهة الاتصال')} *</Label>
            <Combobox options={contacts.map((c) => ({ value: c.id, label: c.name }))} value={contactId} onValueChange={setContactId}
              placeholder={tr('Select a contact', 'اختر جهة اتصال')} searchPlaceholder={tr('Search…', 'بحث…')} clearLabel="—" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{tr('Next action', 'الإجراء التالي')} *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('e.g. Call about renewal', 'مثال: اتصل بخصوص التجديد')} />
          </div>
          <div className="space-y-1">
            <Label>{tr('Type', 'النوع')}</Label>
            <Select value={type} onValueChange={(v) => { setType(v); if (followUpChannels.includes(v as FollowUpChannel)) setChannel(v as FollowUpChannel); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{tr('Channel', 'القناة')}</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {followUpChannels.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{isMeeting ? tr('Meeting time', 'وقت الاجتماع') : tr('Due', 'الاستحقاق')}</Label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{tr('Priority', 'الأولوية')}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as FollowUpPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{followUpPriorities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{tr('Assign to', 'إسناد إلى')}</Label>
            <Combobox
              options={members.map((m) => ({ value: m.id, label: m.id === meId ? `${m.name} (${tr('me', 'أنا')})` : m.name }))}
              value={ownerUserId} onValueChange={setOwnerUserId}
              placeholder={tr('Search teammate…', 'ابحث عن زميل…')} searchPlaceholder={tr('Search…', 'بحث…')} clearLabel="—" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{tr('Notes', 'ملاحظات')}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={submit} disabled={saving || !contactId || !title.trim()}>{tr('Schedule', 'جدولة')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const OUTCOME_LABEL: Record<string, [string, string]> = {
  connected: ['Connected', 'تم التواصل'], no_answer: ['No answer', 'لا إجابة'], left_voicemail: ['Left voicemail', 'تركت رسالة'],
  busy: ['Busy', 'مشغول'], wrong_number: ['Wrong number', 'رقم خاطئ'], booked_meeting: ['Booked meeting', 'حجز اجتماع'],
  not_interested: ['Not interested', 'غير مهتم'], sent: ['Sent', 'أُرسل'], replied: ['Replied', 'رد'], bounced: ['Bounced', 'ارتد'],
  opted_out: ['Opted out', 'إلغاء الاشتراك'], held: ['Held', 'انعقد'], no_show: ['No-show', 'لم يحضر'], rescheduled: ['Rescheduled', 'أعيد جدولته'], done: ['Done', 'تم'],
};

function CompleteDialog({ f, tr, onOpenChange, onDone }: { f: Followup; tr: (e: string, a: string) => string; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { toast } = useToast();
  const outcomes = OUTCOMES_BY_CHANNEL[f.channel ?? ''] ?? ['done', 'connected', 'no_answer', 'not_interested'];
  const [outcome, setOutcome] = React.useState<FollowUpOutcome | null>(null);
  const [note, setNote] = React.useState('');
  const [scheduleNext, setScheduleNext] = React.useState(false);
  const [nextDate, setNextDate] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const pick = (o: FollowUpOutcome) => {
    setOutcome(o);
    const days = NEXT_DAYS[o];
    if (days !== undefined) {
      setScheduleNext(true);
      const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0);
      setNextDate(toLocalInput(d));
    } else {
      setScheduleNext(false); setNextDate('');
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await completeFollowup(f.id, {
        outcome: outcome ?? undefined,
        outcomeNote: note.trim() || undefined,
        next: scheduleNext && nextDate ? { dueAt: new Date(nextDate), channel: f.channel, title: f.nextAction || f.summary, priority: f.priority } : undefined,
      });
      onDone();
      toast({ title: tr('Logged', 'تم التسجيل'), description: scheduleNext && nextDate ? tr('Next touch scheduled.', 'تمت جدولة اللمسة التالية.') : undefined });
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Could not complete', 'تعذر الإكمال'), description: e?.message });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('Log outcome', 'تسجيل النتيجة')}</DialogTitle>
          <DialogDescription>{f.contact?.name} · {f.nextAction || f.summary}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="flex flex-wrap gap-2">
            {outcomes.map((o) => (
              <button key={o} onClick={() => pick(o)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${outcome === o ? 'border-transparent bg-primary text-primary-foreground' : 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'}`}>
                {tr(OUTCOME_LABEL[o]?.[0] ?? o, OUTCOME_LABEL[o]?.[1] ?? o)}
              </button>
            ))}
          </div>
          <Textarea placeholder={tr('Notes (optional)', 'ملاحظات (اختياري)')} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={scheduleNext} onChange={(e) => setScheduleNext(e.target.checked)} />
            {tr('Schedule next follow-up', 'جدولة المتابعة التالية')}
          </label>
          {scheduleNext && (
            <Input type="datetime-local" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={submit} disabled={saving}>{tr('Complete', 'إكمال')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
