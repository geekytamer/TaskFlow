'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { ContributorsPanel } from './contributors-panel';
import { createContact, getContacts, type Contact, type ContactRoleType } from '@/services/contactService';
import {
  createOpportunity,
  deleteOpportunity,
  getCrmDashboard,
  getOpportunities,
  leadSources,
  leadStatuses,
  opportunityStages,
  updateOpportunity,
  updateOpportunityStage,
  type CrmDashboardSummary,
  type Opportunity,
} from '@/services/crmService';
import {
  CheckCircle2,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  DollarSign,
  Target,
  BadgeDollarSign,
  Calendar,
  ChevronRight,
  AlertCircle,
  User,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

type OpportunityForm = {
  contactId: string;
  title: string;
  serviceType: string;
  expectedRevenue: string;
  probability: string;
  expectedCloseDate: string;
  notes: string;
};

type QuickEntryForm = {
  type: ContactRoleType;
  name: string;
  phone: string;
  email: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'New' | 'Qualified' | 'Follow-up' | 'Proposal' | 'Won' | 'Lost' | 'Archived';
  source: 'Instagram' | 'TikTok' | 'WhatsApp' | 'Referral' | 'Website' | 'Campaign' | 'Former Client' | 'Other';
  nextFollowupDate: string;
  notes: string;
};

const emptyOpportunityForm = (): OpportunityForm => ({
  contactId: '', title: '', serviceType: '',
  expectedRevenue: '', probability: '50',
  expectedCloseDate: '', notes: '',
});

const emptyQuickEntryForm = (): QuickEntryForm => ({
  type: 'Lead', name: '', phone: '', email: '',
  priority: 'Medium', status: 'New', source: 'Referral',
  nextFollowupDate: '', notes: '',
});

const inputDate = (value?: Date) => value ? new Date(value).toISOString().slice(0, 10) : '';

// ─── stage config ─────────────────────────────────────────────────────────────

const stageConfig: Record<string, { color: string; bg: string; border: string; topBorder: string }> = {
  New:         { color: 'text-sky-700',    bg: 'bg-sky-50',    border: 'border-sky-200',    topBorder: 'border-t-sky-400' },
  Qualified:   { color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   topBorder: 'border-t-blue-500' },
  Proposal:    { color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', topBorder: 'border-t-violet-500' },
  Negotiation: { color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  topBorder: 'border-t-amber-500' },
  Won:         { color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200',  topBorder: 'border-t-green-500' },
};

const listStageBadge: Record<string, string> = {
  New: 'bg-sky-50 text-sky-700 border-sky-200',
  Qualified: 'bg-blue-50 text-blue-700 border-blue-200',
  Proposal: 'bg-violet-50 text-violet-700 border-violet-200',
  Negotiation: 'bg-amber-50 text-amber-700 border-amber-200',
  Won: 'bg-green-50 text-green-700 border-green-200',
  Lost: 'bg-red-50 text-red-700 border-red-200',
  Cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
};

function StageBadge({ stage, label }: { stage: string; label?: string }) {
  const cls = listStageBadge[stage] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label ?? stage}</span>;
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-foreground' }: {
  icon: React.ElementType; label: string; value: React.ReactNode; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
      <div className="rounded-lg bg-muted p-2 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-xl font-bold leading-none ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── PipelinePage ─────────────────────────────────────────────────────────────

export function PipelinePage() {
  const { selectedCompany } = useCompany();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { amount } = useCompanyCurrency();
  const { t } = useI18n();
  const stageLabel = React.useCallback(
    (stage: string) => t(`pipelinePage.stage${stage.replace(/\s/g, '')}`, stage),
    [t],
  );

  const [loading, setLoading] = React.useState(true);
  const [dashboard, setDashboard] = React.useState<CrmDashboardSummary | null>(null);
  const [myDashboard, setMyDashboard] = React.useState<CrmDashboardSummary | null>(null);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [opportunities, setOpportunities] = React.useState<Opportunity[]>([]);
  const [view, setView] = React.useState<'kanban' | 'list'>('kanban');

  // dialogs
  const [oppDialogOpen, setOppDialogOpen] = React.useState(false);
  const [quickDialogOpen, setQuickDialogOpen] = React.useState(false);
  const [editingOpportunity, setEditingOpportunity] = React.useState<Opportunity | null>(null);
  const [oppForm, setOppForm] = React.useState<OpportunityForm>(emptyOpportunityForm());
  const [quickForm, setQuickForm] = React.useState<QuickEntryForm>(emptyQuickEntryForm());
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setDashboard(null); setMyDashboard(null);
      setContacts([]); setOpportunities([]);
      setLoading(false); return;
    }
    setLoading(true);
    try {
      const [dashData, myDashData, contactData, oppData] = await Promise.all([
        getCrmDashboard(selectedCompany.id),
        user ? getCrmDashboard(selectedCompany.id, 'me') : Promise.resolve(null),
        getContacts(selectedCompany.id),
        getOpportunities(selectedCompany.id),
      ]);
      setDashboard(dashData);
      setMyDashboard(myDashData);
      setContacts(contactData);
      setOpportunities(oppData);
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('crm.toastUnavailableTitle'), description: error?.message });
    } finally { setLoading(false); }
  }, [selectedCompany, toast, user]);

  React.useEffect(() => { load(); }, [load]);

  const contactName = React.useCallback(
    (id: string) => contacts.find((c) => c.id === id)?.name ?? id,
    [contacts],
  );

  const nextStage = (stage: Opportunity['stage']): Opportunity['stage'] | null => {
    const flow: Opportunity['stage'][] = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won'];
    const i = flow.indexOf(stage);
    return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
  };

  const openNewOpp = () => {
    setEditingOpportunity(null);
    setOppForm(emptyOpportunityForm());
    setOppDialogOpen(true);
  };

  const openEditOpp = (item: Opportunity) => {
    setEditingOpportunity(item);
    setOppForm({
      contactId: item.contactId,
      title: item.title,
      serviceType: item.serviceType,
      expectedRevenue: String(item.expectedRevenue || ''),
      probability: String(item.probability || 0),
      expectedCloseDate: inputDate(item.expectedCloseDate),
      notes: item.notes || '',
    });
    setOppDialogOpen(true);
  };

  const saveOpp = async () => {
    if (!selectedCompany || !oppForm.contactId || !oppForm.title.trim() || !oppForm.serviceType.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        contactId: oppForm.contactId,
        title: oppForm.title.trim(),
        serviceType: oppForm.serviceType.trim(),
        expectedRevenue: Number(oppForm.expectedRevenue || 0),
        probability: Number(oppForm.probability || 0),
        expectedCloseDate: oppForm.expectedCloseDate ? new Date(oppForm.expectedCloseDate) : undefined,
        notes: oppForm.notes.trim() || undefined,
      };
      if (editingOpportunity) {
        await updateOpportunity(editingOpportunity.id, payload);
        toast({ title: t('pipelinePage.toastOpportunityUpdated') });
      } else {
        await createOpportunity(selectedCompany.id, payload);
        toast({ title: t('pipelinePage.toastOpportunityCreated') });
      }
      setOppDialogOpen(false);
      setEditingOpportunity(null);
      setOppForm(emptyOpportunityForm());
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('pipelinePage.toastSaveFailed'), description: error?.message });
    } finally { setSubmitting(false); }
  };

  const saveQuickEntry = async () => {
    if (!selectedCompany || !quickForm.name.trim()) return;
    setSubmitting(true);
    try {
      await createContact({
        companyId: selectedCompany.id,
        kind: quickForm.type === 'Influencer' ? 'Person' : 'Organization',
        name: quickForm.name.trim(),
        phone: quickForm.phone.trim() || undefined,
        email: quickForm.email.trim() || undefined,
        roles: [quickForm.type],
        leadStatus: quickForm.type === 'Client' ? 'Won' : quickForm.status,
        leadSource: quickForm.source,
        priority: quickForm.priority,
        ownerUserId: user?.id,
        ownerName: user?.name,
        nextFollowupDate: quickForm.nextFollowupDate ? new Date(quickForm.nextFollowupDate) : undefined,
        nextFollowupNote: quickForm.notes.trim() || undefined,
        notes: quickForm.notes.trim() || undefined,
      });
      setQuickForm(emptyQuickEntryForm());
      setQuickDialogOpen(false);
      toast({ title: t('pipelinePage.toastLeadAdded') });
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('pipelinePage.toastLeadFailed'), description: error?.message });
    } finally { setSubmitting(false); }
  };

  if (!selectedCompany) return (
    <SectionPageShell title={t('pipelinePage.title')} description={t('pipelinePage.shortDescription')}>
      <SectionEmptyState title={t('pipelinePage.chooseCompanyTitle')} description={t('pipelinePage.chooseCompanyDesc')} />
    </SectionPageShell>
  );

  const openPipeline = opportunities.filter((o) => !['Won', 'Lost', 'Cancelled'].includes(o.stage));
  const wonRevenue = opportunities.filter((o) => o.stage === 'Won').reduce((s, o) => s + o.expectedRevenue, 0);
  const forecast = dashboard?.forecastValue ?? openPipeline.reduce((s, o) => s + (o.expectedRevenue * (o.probability / 100)), 0);

  return (
    <SectionPageShell title={t('pipelinePage.title')} description={t('pipelinePage.description')}>

      {/* ── Summary stats ─────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Target}
          label={t('pipelinePage.statOpenDeals')}
          value={loading ? <Skeleton className="h-6 w-8" /> : dashboard?.openOpportunities ?? openPipeline.length}
          sub={t('pipelinePage.statActiveLeads').replace('{count}', String(dashboard?.openLeads ?? '–'))}
          color="text-blue-600"
        />
        <StatCard
          icon={DollarSign}
          label={t('pipelinePage.statPipelineValue')}
          value={loading ? <Skeleton className="h-6 w-20" /> : amount(dashboard?.openOpportunityValue ?? openPipeline.reduce((s, o) => s + o.expectedRevenue, 0))}
          color="text-violet-600"
        />
        <StatCard
          icon={TrendingUp}
          label={t('pipelinePage.statForecast')}
          value={loading ? <Skeleton className="h-6 w-20" /> : amount(forecast)}
          sub={t('pipelinePage.statForecastSub')}
          color="text-amber-600"
        />
        <StatCard
          icon={CheckCircle2}
          label={t('pipelinePage.statWonRevenue')}
          value={loading ? <Skeleton className="h-6 w-20" /> : amount(dashboard?.wonRevenue ?? wonRevenue)}
          sub={t('pipelinePage.statClosedDeals').replace('{count}', String(opportunities.filter((o) => o.stage === 'Won').length))}
          color="text-green-600"
        />
      </div>

      {/* ── Personal home + follow-ups ──────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">{t('pipelinePage.myWorkload')}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t('pipelinePage.myWorkloadSub')}</p>
            </div>
            {myDashboard?.openTasks !== undefined && (
              <span className="text-xs rounded-full bg-primary/10 text-primary px-2.5 py-1 font-medium">
                {(myDashboard.openTasks !== 1 ? t('pipelinePage.openTasks') : t('pipelinePage.openTask')).replace('{count}', String(myDashboard.openTasks))}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: t('pipelinePage.myContacts'), value: myDashboard?.activeContacts ?? 0 },
              { label: t('pipelinePage.wonDeals'), value: myDashboard?.wonDeals ?? 0 },
              { label: t('pipelinePage.followupsDue'), value: myDashboard?.openFollowups ?? 0 },
              { label: t('pipelinePage.myCommission'), value: loading ? '–' : amount(myDashboard?.commissionApproved ?? 0) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-bold">{loading ? <Skeleton className="h-5 w-8" /> : value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-3">{t('pipelinePage.upcomingFollowups')}</h2>
          <div className="space-y-2">
            {loading && [...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            {!loading && (dashboard?.upcomingFollowups ?? []).slice(0, 4).map((item) => (
              <div key={item.id} className="flex items-start gap-2 rounded-lg border p-2.5">
                <div className="rounded-full bg-primary/10 p-1.5 shrink-0 mt-0.5">
                  <User className="h-3 w-3 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.contactName}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.nextFollowupDate).toLocaleDateString()}
                    {item.nextFollowupNote ? ` · ${item.nextFollowupNote}` : ''}
                  </p>
                </div>
              </div>
            ))}
            {!loading && !dashboard?.upcomingFollowups?.length && (
              <p className="text-sm text-muted-foreground text-center py-4">{t('pipelinePage.noFollowups')}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
          <button
            onClick={() => setView('kanban')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              view === 'kanban' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            data-tutorial="opportunities-view-toggle"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> {t('pipelinePage.viewKanban')}
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              view === 'list' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <List className="h-3.5 w-3.5" /> {t('pipelinePage.viewList')}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setQuickDialogOpen(true)}>
            <Plus className="me-1.5 h-3.5 w-3.5" /> {t('pipelinePage.addLead')}
          </Button>
          <Button size="sm" onClick={openNewOpp} data-tutorial="pipeline-create-opp">
            <Plus className="me-1.5 h-3.5 w-3.5" /> {t('pipelinePage.newOpportunity')}
          </Button>
        </div>
      </div>

      {/* ── Kanban board ────────────────────────────────────────────────── */}
      {view === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-2" data-tutorial="opportunities-kanban">
          {(opportunityStages.filter((s) => !['Cancelled', 'Lost'].includes(s)) as Opportunity['stage'][]).map((stage) => {
            const items = opportunities.filter((o) => o.stage === stage);
            const stageValue = items.reduce((s, o) => s + o.expectedRevenue, 0);
            const cfg = stageConfig[stage] ?? { color: '', bg: '', border: '', topBorder: '' };

            return (
              <div key={stage} className={`rounded-xl border border-t-4 bg-card shrink-0 w-64 flex flex-col ${cfg.topBorder}`}>
                <div className="px-3 pt-3 pb-2 border-b">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-semibold ${cfg.color}`}>{stageLabel(stage)}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                      {items.length}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{amount(stageValue)}</p>
                </div>

                <div className="flex flex-col gap-2 p-2 flex-1 min-h-[120px]">
                  {loading && <Skeleton className="h-20 w-full" />}
                  {!loading && items.map((item) => {
                    const moveTo = nextStage(item.stage);
                    const isOverdue = item.expectedCloseDate
                      && new Date(item.expectedCloseDate) < new Date()
                      && !['Won', 'Lost', 'Cancelled'].includes(item.stage);

                    return (
                      <div key={item.id}
                        className="rounded-lg border bg-background p-3 hover:shadow-md transition-all cursor-default group"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-semibold leading-snug">{item.title}</p>
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                            onClick={() => openEditOpp(item)}
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{contactName(item.contactId)}</p>
                        <p className="text-xs text-muted-foreground">{item.serviceType}</p>

                        <div className="mt-2.5 flex items-center justify-between gap-1">
                          <span className="text-sm font-bold text-green-700">{amount(item.expectedRevenue)}</span>
                          {item.probability > 0 && (
                            <span className="text-xs text-muted-foreground">{item.probability}%</span>
                          )}
                        </div>

                        {item.expectedCloseDate && (
                          <div className={`mt-1.5 flex items-center gap-1 text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                            {isOverdue && <AlertCircle className="h-3 w-3 shrink-0" />}
                            <Calendar className="h-3 w-3 shrink-0" />
                            {new Date(item.expectedCloseDate).toLocaleDateString()}
                          </div>
                        )}

                        {moveTo && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-6 w-full text-xs gap-1"
                            onClick={async () => { await updateOpportunityStage(item.id, moveTo); await load(); }}
                          >
                            {t('pipelinePage.moveTo').replace('{stage}', stageLabel(moveTo))} <ChevronRight className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {!loading && items.length === 0 && (
                    <div className="flex-1 rounded-lg border border-dashed flex items-center justify-center p-4">
                      <p className="text-xs text-muted-foreground text-center">{t('pipelinePage.dropHere')}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── List view ───────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="">
                <TableHead>{t('pipelinePage.colDeal')}</TableHead>
                <TableHead>{t('pipelinePage.colContact')}</TableHead>
                <TableHead>{t('pipelinePage.colStage')}</TableHead>
                <TableHead className="text-right">{t('pipelinePage.colRevenue')}</TableHead>
                <TableHead>{t('pipelinePage.colProbability')}</TableHead>
                <TableHead>{t('pipelinePage.colCloseDate')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && [...Array(4)].map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))}
              {!loading && opportunities.map((item) => {
                const moveTo = nextStage(item.stage);
                const isOverdue = item.expectedCloseDate
                  && new Date(item.expectedCloseDate) < new Date()
                  && !['Won', 'Lost', 'Cancelled'].includes(item.stage);

                return (
                  <TableRow key={item.id} className={`hover:bg-muted/30 transition-colors ${isOverdue ? 'bg-red-50/30' : ''}`}>
                    <TableCell>
                      <div className="font-semibold text-sm">{item.title}</div>
                      <div className="text-xs text-muted-foreground">{item.serviceType}</div>
                    </TableCell>
                    <TableCell className="text-sm">{contactName(item.contactId)}</TableCell>
                    <TableCell><StageBadge stage={item.stage} label={stageLabel(item.stage)} /></TableCell>
                    <TableCell className="text-right font-semibold text-sm">{amount(item.expectedRevenue)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${item.probability}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{item.probability}%</span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-sm ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                      {item.expectedCloseDate
                        ? <span className="flex items-center gap-1">
                            {isOverdue && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                            {new Date(item.expectedCloseDate).toLocaleDateString()}
                          </span>
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditOpp(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {moveTo && (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            onClick={async () => { await updateOpportunityStage(item.id, moveTo); await load(); }}>
                            {stageLabel(moveTo)} <ChevronRight className="h-3 w-3" />
                          </Button>
                        )}
                        {item.stage !== 'Won' && (
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                            onClick={async () => { await updateOpportunityStage(item.id, 'Won'); await load(); }}>
                            <CheckCircle2 className="h-3 w-3" /> {t('pipelinePage.markWon')}
                          </Button>
                        )}
                        {!['Won', 'Lost', 'Cancelled'].includes(item.stage) && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={async () => { await deleteOpportunity(item.id); await load(); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && opportunities.length === 0 && (
                <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {t('pipelinePage.emptyList')}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── New / Edit Opportunity dialog ────────────────────────────────── */}
      <Dialog open={oppDialogOpen} onOpenChange={(v) => {
        if (!v) { setEditingOpportunity(null); setOppForm(emptyOpportunityForm()); }
        setOppDialogOpen(v);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              {editingOpportunity ? t('pipelinePage.editOpportunity') : t('pipelinePage.newOpportunity')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('pipelinePage.fieldContact')} <span className="text-destructive">*</span></Label>
              <Select value={oppForm.contactId} onValueChange={(v) => setOppForm((p) => ({ ...p, contactId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('pipelinePage.fieldSelectContact')} /></SelectTrigger>
                <SelectContent>{contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('pipelinePage.fieldTitle')} <span className="text-destructive">*</span></Label>
              <Input placeholder={t('pipelinePage.fieldTitlePh')} value={oppForm.title} onChange={(e) => setOppForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('pipelinePage.fieldServiceType')} <span className="text-destructive">*</span></Label>
              <Input placeholder={t('pipelinePage.fieldServiceTypePh')} value={oppForm.serviceType} onChange={(e) => setOppForm((p) => ({ ...p, serviceType: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>{t('pipelinePage.fieldExpectedRevenue')}</Label>
                <Input type="number" placeholder="0.00" value={oppForm.expectedRevenue} onChange={(e) => setOppForm((p) => ({ ...p, expectedRevenue: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('pipelinePage.fieldProbability')}</Label>
                <Input type="number" min="0" max="100" placeholder="50" value={oppForm.probability} onChange={(e) => setOppForm((p) => ({ ...p, probability: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('pipelinePage.fieldExpectedCloseDate')}</Label>
              <Input type="date" value={oppForm.expectedCloseDate} onChange={(e) => setOppForm((p) => ({ ...p, expectedCloseDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('pipelinePage.fieldNotes')}</Label>
              <Textarea placeholder={t('pipelinePage.fieldNotesPh')} rows={2} value={oppForm.notes} onChange={(e) => setOppForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            {editingOpportunity && selectedCompany && (
              <div className="pt-2 border-t">
                <ContributorsPanel
                  companyId={selectedCompany.id}
                  sourceType="opportunity"
                  sourceId={editingOpportunity.id}
                  compact
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOppDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={saveOpp} disabled={submitting || !oppForm.contactId || !oppForm.title.trim() || !oppForm.serviceType.trim()}>
              {submitting ? t('pipelinePage.saving') : editingOpportunity ? t('pipelinePage.saveChanges') : t('pipelinePage.createOpportunity')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quick Entry (add lead/contact) dialog ───────────────────────── */}
      <Dialog open={quickDialogOpen} onOpenChange={(v) => { if (!v) setQuickForm(emptyQuickEntryForm()); setQuickDialogOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> {t('pipelinePage.quickEntryTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('pipelinePage.fieldType')}</Label>
                <Select value={quickForm.type} onValueChange={(v: ContactRoleType) => setQuickForm((p) => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lead">{t('pipelinePage.typeLead')}</SelectItem>
                    <SelectItem value="Client">{t('pipelinePage.typeClient')}</SelectItem>
                    <SelectItem value="Vendor">{t('pipelinePage.typeVendor')}</SelectItem>
                    <SelectItem value="Influencer">{t('pipelinePage.typeInfluencer')}</SelectItem>
                    <SelectItem value="Partner">{t('pipelinePage.typePartner')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('pipelinePage.fieldPriority')}</Label>
                <Select value={quickForm.priority} onValueChange={(v: QuickEntryForm['priority']) => setQuickForm((p) => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High">{t('pipelinePage.priorityHigh')}</SelectItem>
                    <SelectItem value="Medium">{t('pipelinePage.priorityMedium')}</SelectItem>
                    <SelectItem value="Low">{t('pipelinePage.priorityLow')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('pipelinePage.fieldName')} <span className="text-destructive">*</span></Label>
              <Input placeholder={t('pipelinePage.fieldNamePh')} value={quickForm.name} onChange={(e) => setQuickForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('pipelinePage.fieldPhone')}</Label>
                <Input placeholder="+1 234 567 8900" value={quickForm.phone} onChange={(e) => setQuickForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('pipelinePage.fieldEmail')}</Label>
                <Input placeholder={t('pipelinePage.fieldEmailPh')} value={quickForm.email} onChange={(e) => setQuickForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('pipelinePage.fieldLeadStatus')}</Label>
                <Select value={quickForm.status} onValueChange={(v: QuickEntryForm['status']) => setQuickForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{leadStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('pipelinePage.fieldLeadSource')}</Label>
                <Select value={quickForm.source} onValueChange={(v: QuickEntryForm['source']) => setQuickForm((p) => ({ ...p, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{leadSources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('pipelinePage.fieldNextFollowup')}</Label>
              <Input type="date" value={quickForm.nextFollowupDate} onChange={(e) => setQuickForm((p) => ({ ...p, nextFollowupDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('pipelinePage.fieldNotes')}</Label>
              <Textarea placeholder={t('pipelinePage.fieldQuickNotesPh')} rows={2} value={quickForm.notes} onChange={(e) => setQuickForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={saveQuickEntry} disabled={submitting || !quickForm.name.trim()}>
              {submitting ? t('pipelinePage.adding') : t('pipelinePage.addLead')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionPageShell>
  );
}
