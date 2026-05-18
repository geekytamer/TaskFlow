'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import {
  getFollowups,
  markFollowupDone,
  rescheduleFollowup,
  type Followup,
} from '@/services/crmService';
import { LogActivityDialog } from './log-activity-dialog';
import {
  Phone, MessageCircle, Mail, Users, FileText, Clock, StickyNote, Zap,
  CheckCircle2, CalendarClock, Search, ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';

const CATEGORY_ICON: Record<string, React.ElementType> = {
  'Call': Phone, 'WhatsApp': MessageCircle, 'Email': Mail,
  'Meeting': Users, 'Proposal Sent': FileText, 'Follow-up': Clock,
  'Note': StickyNote, 'Other': Zap,
};

function isOverdue(date: Date) {
  return date < new Date();
}

function isDueToday(date: Date) {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function dueBadge(date: Date) {
  if (isOverdue(date)) return 'bg-red-100 text-red-700';
  if (isDueToday(date)) return 'bg-orange-100 text-orange-700';
  return 'bg-slate-100 text-slate-600';
}

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FollowupsPage() {
  const { selectedCompany } = useCompany();
  const { t } = useI18n();
  const { toast } = useToast();

  const [followups, setFollowups] = React.useState<Followup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<'all' | 'overdue' | 'upcoming'>('all');
  const [search, setSearch] = React.useState('');
  const [logDialogOpen, setLogDialogOpen] = React.useState(false);
  const [activeContactId, setActiveContactId] = React.useState<string | null>(null);
  const [activeContactName, setActiveContactName] = React.useState<string | undefined>();

  const load = React.useCallback(async () => {
    if (!selectedCompany) { setFollowups([]); setLoading(false); return; }
    setLoading(true);
    try {
      const overdue = filter === 'overdue' ? true : filter === 'upcoming' ? false : undefined;
      const data = await getFollowups(selectedCompany.id, { overdue });
      setFollowups(data);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, filter]);

  React.useEffect(() => { load(); }, [load]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return followups;
    const q = search.toLowerCase();
    return followups.filter(
      f => f.summary.toLowerCase().includes(q)
        || f.contact?.name.toLowerCase().includes(q)
        || f.nextAction?.toLowerCase().includes(q),
    );
  }, [followups, search]);

  const handleMarkDone = async (f: Followup) => {
    try {
      await markFollowupDone(f.id);
      setFollowups(prev => prev.filter(x => x.id !== f.id));
      toast({ title: t('crm.followupDone') });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error?.message,
        variant: 'destructive',
      });
    }
  };

  const handleReschedule = async (f: Followup, daysAhead: number) => {
    const next = new Date();
    next.setDate(next.getDate() + daysAhead);
    next.setHours(9, 0, 0, 0);
    try {
      await rescheduleFollowup(f.id, next);
      await load();
      toast({ title: t('crm.followupRescheduled') });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error?.message,
        variant: 'destructive',
      });
    }
  };

  const handleLogFollowup = (f: Followup) => {
    setActiveContactId(f.entityId);
    setActiveContactName(f.contact?.name);
    setLogDialogOpen(true);
  };

  const overdueCt = followups.filter(f => f.nextActionDueDate && isOverdue(f.nextActionDueDate)).length;
  const todayCt = followups.filter(f => f.nextActionDueDate && isDueToday(f.nextActionDueDate)).length;

  return (
    <SectionPageShell
      title={t('crm.followupsTitle')}
      description={t('crm.followupsDescription')}
    >
      {/* Stats strip */}
      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200">
          <span className="text-sm font-semibold text-red-700">{overdueCt}</span>
          <span className="text-xs text-red-600">{t('crm.overdue')}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200">
          <span className="text-sm font-semibold text-orange-700">{todayCt}</span>
          <span className="text-xs text-orange-600">{t('crm.dueToday')}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-sm font-semibold text-slate-700">{followups.length}</span>
          <span className="text-xs text-slate-600">{t('crm.totalFollowups')}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center" data-tutorial="followups-filters">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t('crm.searchFollowups')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'overdue', 'upcoming'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                filter === f
                  ? 'bg-primary text-primary-foreground border-transparent'
                  : 'bg-transparent border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              {t(`crm.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <SectionEmptyState
          title={t('crm.followupsEmptyTitle')}
          description={t('crm.followupsEmptyDescription')}
        />
      ) : (
        <Table data-tutorial="followups-list">
          <TableHeader>
            <TableRow>
              <TableHead>{t('crm.contact')}</TableHead>
              <TableHead>{t('crm.activitySummary')}</TableHead>
              <TableHead>{t('crm.nextAction')}</TableHead>
              <TableHead>{t('crm.dueDate')}</TableHead>
              <TableHead>{t('crm.assignedTo')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(f => {
              const Icon = CATEGORY_ICON[f.category ?? 'Other'] ?? Zap;
              const due = f.nextActionDueDate;
              return (
                <TableRow key={f.id} className={due && isOverdue(due) ? 'bg-red-50/30' : ''}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/contacts/${f.entityId}`}
                      className="hover:text-primary hover:underline"
                    >
                      {f.contact?.name ?? f.entityId}
                    </Link>
                    {f.contact?.roles && (
                      <div className="flex gap-1 mt-0.5">
                        {f.contact.roles.slice(0, 2).map(r => (
                          <span key={r} className="text-xs text-muted-foreground">{r}</span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm line-clamp-1">{f.summary}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{f.nextAction ?? '—'}</TableCell>
                  <TableCell>
                    {due ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${dueBadge(due)}`}>
                        {fmtDate(due)}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{f.actorName ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleLogFollowup(f)}
                      >
                        <Phone className="h-3 w-3" />{t('crm.logActivity')}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                          >
                            <CalendarClock className="h-3 w-3" />{t('crm.reschedule')}
                            <ChevronDown className="h-3 w-3 opacity-70" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleReschedule(f, 1)}>{t('crm.tomorrow')}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleReschedule(f, 3)}>{t('crm.inThreeDays')}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleReschedule(f, 7)}>{t('crm.nextWeek')}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleReschedule(f, 14)}>{t('crm.inTwoWeeks')}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleReschedule(f, 30)}>{t('crm.nextMonth')}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 text-green-700 hover:text-green-800 hover:bg-green-50"
                        onClick={() => handleMarkDone(f)}
                      >
                        <CheckCircle2 className="h-3 w-3" />{t('crm.markDone')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <LogActivityDialog
        open={logDialogOpen}
        onOpenChange={setLogDialogOpen}
        contactId={activeContactId ?? ''}
        contactName={activeContactName}
        onLogged={() => load()}
      />
    </SectionPageShell>
  );
}
