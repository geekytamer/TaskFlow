'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { getContacts, type Contact, type ContactRoleType } from '@/services/contactService';
import {
  createCampaign,
  createCampaignAssignment,
  createCampaignDeliverable,
  createCampaignExpense,
  createProposal,
  createVendorRequest,
  deleteCampaign,
  deleteCampaignAssignment,
  deleteCampaignDeliverable,
  deleteCampaignExpense,
  deleteProposal,
  deleteVendorRequest,
  getCampaignAssignments,
  getCampaignDeliverables,
  getCampaignExpenses,
  getCampaigns,
  getCommissions,
  getOpportunities,
  getProposals,
  getVendorRequests,
  generateCampaignInvoice,
  generateCampaignVendorBills,
  updateCampaign,
  updateCampaignAssignment,
  updateCampaignDeliverable,
  updateCampaignExpense,
  updateCommissionStatus,
  updateProposalStatus,
  updateVendorRequestStatus,
  type CampaignAssignment,
  type CampaignDeliverable,
  type CampaignExpense,
  type CrmCampaign,
  type CrmProposal,
  type Opportunity,
  type VendorRequest,
  type Commission,
} from '@/services/crmService';
import {
  CheckCircle2,
  Plus,
  Trash2,
  FileText,
  Megaphone,
  Receipt,
  UserRoundSearch,
  BadgeDollarSign,
  Send,
  XCircle,
  ChevronRight,
  Calendar,
  DollarSign,
  Users,
  ClipboardList,
  TrendingUp,
  Clock,
  AlertCircle,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

const proposalStatusColor: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700 border-gray-200',
  Sent: 'bg-blue-50 text-blue-700 border-blue-200',
  Accepted: 'bg-green-50 text-green-700 border-green-200',
  Declined: 'bg-red-50 text-red-700 border-red-200',
  Expired: 'bg-orange-50 text-orange-700 border-orange-200',
};

const campaignStatusColor: Record<string, string> = {
  Planned: 'bg-purple-50 text-purple-700 border-purple-200',
  Active: 'bg-green-50 text-green-700 border-green-200',
  'On Hold': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Completed: 'bg-blue-50 text-blue-700 border-blue-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
  Archived: 'bg-gray-100 text-gray-600 border-gray-200',
};

const vendorStatusColor: Record<string, string> = {
  New: 'bg-blue-50 text-blue-700 border-blue-200',
  'Under Review': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Approved: 'bg-green-50 text-green-700 border-green-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  Converted: 'bg-purple-50 text-purple-700 border-purple-200',
  Archived: 'bg-gray-100 text-gray-600 border-gray-200',
};

const commissionStatusColor: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700 border-gray-200',
  Approved: 'bg-blue-50 text-blue-700 border-blue-200',
  Paid: 'bg-green-50 text-green-700 border-green-200',
};

function ColorBadge({ status, map, label }: { status: string; map: Record<string, string>; label?: string }) {
  const cls = map[status] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label ?? status}</span>;
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
        <p className={`mt-0.5 text-xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── shared data hook ─────────────────────────────────────────────────────────

function useCrmBaseData() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = React.useState(false);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [opportunities, setOpportunities] = React.useState<Opportunity[]>([]);

  const loadBase = React.useCallback(async () => {
    if (!selectedCompany) { setContacts([]); setOpportunities([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [contactData, opportunityData] = await Promise.allSettled([
        getContacts(selectedCompany.id),
        getOpportunities(selectedCompany.id),
      ]);
      if (contactData.status === 'fulfilled') setContacts(contactData.value);
      if (opportunityData.status === 'fulfilled') setOpportunities(opportunityData.value);
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('crm.toastUnavailableTitle'), description: error?.message });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { loadBase(); }, [loadBase]);

  const contactName = React.useCallback(
    (id?: string) => id ? (contacts.find((c) => c.id === id)?.name ?? id) : '-',
    [contacts],
  );

  return { selectedCompany, loading, contacts, opportunities, contactName, loadBase };
}

// Social platforms used by campaign deliverables and vendor/influencer requests.
const CAMPAIGN_PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Snapchat', 'Twitter/X', 'Facebook', 'Other'] as const;

// ─── Proposals Page ──────────────────────────────────────────────────────────

export function ProposalsPage() {
  const { selectedCompany, loading, opportunities, contactName } = useCrmBaseData();
  const { amount } = useCompanyCurrency();
  const { toast } = useToast();
  const { t } = useI18n();
  const proposalStatusLabel = (s: string) => t(`proposalsPage.status${s}`, s);
  const [proposals, setProposals] = React.useState<CrmProposal[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    opportunityId: '', title: '', description: '', quantity: '1', unitPrice: '', validUntil: '', notes: '',
  });

  const load = React.useCallback(async () => {
    if (!selectedCompany) return setProposals([]);
    try { setProposals(await getProposals(selectedCompany.id)); }
    catch (error: any) { toast({ variant: 'destructive', title: t('proposalsPage.toastLoadFailed'), description: error?.message }); }
  }, [selectedCompany, toast, t]);

  React.useEffect(() => { load(); }, [load]);

  const resetForm = () => setForm({ opportunityId: '', title: '', description: '', quantity: '1', unitPrice: '', validUntil: '', notes: '' });

  const submit = async () => {
    if (!selectedCompany || !form.opportunityId || !form.title.trim() || !form.description.trim()) return;
    setSubmitting(true);
    try {
      await createProposal(selectedCompany.id, {
        opportunityId: form.opportunityId,
        title: form.title.trim(),
        validUntil: form.validUntil ? new Date(form.validUntil) : undefined,
        items: [{
          description: form.description.trim(),
          quantity: Number(form.quantity || 1),
          unitPrice: Number(form.unitPrice || 0),
          lineTotal: Number(form.quantity || 1) * Number(form.unitPrice || 0),
        }],
        notes: form.notes.trim() || undefined,
      });
      resetForm();
      setDialogOpen(false);
      await load();
      toast({ title: t('proposalsPage.toastCreated') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('proposalsPage.toastCreateFailed'), description: error?.message });
    } finally { setSubmitting(false); }
  };

  if (!selectedCompany) return (
    <SectionPageShell title={t('proposalsPage.title')} description={t('proposalsPage.shortDescription')}>
      <SectionEmptyState title={t('crm.chooseCompany')} description={t('proposalsPage.chooseCompanyDesc')} />
    </SectionPageShell>
  );

  const total = proposals.reduce((s, p) => s + (p.totalAmount ?? 0), 0);
  const byStatus = (s: string) => proposals.filter((p) => p.status === s).length;

  return (
    <SectionPageShell
      title={t('proposalsPage.title')}
      description={t('proposalsPage.description')}
    >
      {/* Stats strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label={t('proposalsPage.statTotal')} value={proposals.length} />
        <StatCard icon={Clock} label={t('proposalsPage.statDrafts')} value={byStatus('Draft')} color="text-gray-600" />
        <StatCard icon={Send} label={t('proposalsPage.statSent')} value={byStatus('Sent')} color="text-blue-600" />
        <StatCard icon={TrendingUp} label={t('proposalsPage.statTotalValue')} value={amount(total)} color="text-green-600" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{(proposals.length !== 1 ? t('proposalsPage.countPlural') : t('proposalsPage.countSingular')).replace('{count}', String(proposals.length))}</p>
        <Button onClick={() => setDialogOpen(true)} data-tutorial="proposals-create">
          <Plus className="me-2 h-4 w-4" /> {t('proposalsPage.newProposal')}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="">
              <TableHead>{t('proposalsPage.colProposal')}</TableHead>
              <TableHead>{t('proposalsPage.colClient')}</TableHead>
              <TableHead>{t('proposalsPage.colValidUntil')}</TableHead>
              <TableHead>{t('proposalsPage.colTotal')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && [...Array(3)].map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ))}
            {!loading && proposals.map((item) => (
              <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div className="font-semibold text-sm">{item.proposalNumber}</div>
                  <div className="text-xs text-muted-foreground">{item.title}</div>
                </TableCell>
                <TableCell className="text-sm">{contactName(item.contactId)}</TableCell>
                <TableCell className="text-sm">
                  {item.validUntil ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(item.validUntil).toLocaleDateString()}
                    </span>
                  ) : '-'}
                </TableCell>
                <TableCell className="font-medium text-sm">{amount(item.totalAmount)}</TableCell>
                <TableCell><ColorBadge status={item.status} map={proposalStatusColor} label={proposalStatusLabel(item.status)} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {item.status === 'Draft' && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                        onClick={async () => { await updateProposalStatus(item.id, 'Sent'); await load(); }}>
                        <Send className="h-3 w-3" /> {t('proposalsPage.actionSend')}
                      </Button>
                    )}
                    {item.status === 'Sent' && (
                      <Button size="sm" className="h-7 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={async () => { await updateProposalStatus(item.id, 'Accepted'); await load(); }}>
                        <CheckCircle2 className="h-3 w-3" /> {t('proposalsPage.actionAccept')}
                      </Button>
                    )}
                    {item.status === 'Sent' && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={async () => { await updateProposalStatus(item.id, 'Declined'); await load(); }}>
                        <XCircle className="h-3 w-3" /> {t('proposalsPage.actionDecline')}
                      </Button>
                    )}
                    {item.status !== 'Expired' && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={async () => { await deleteProposal(item.id); await load(); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && proposals.length === 0 && (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                {t('proposalsPage.emptyState')}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setDialogOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> {t('proposalsPage.newProposal')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('proposalsPage.fieldOpportunity')} <span className="text-destructive">*</span></Label>
              <Select value={form.opportunityId} onValueChange={(v) => setForm((p) => ({ ...p, opportunityId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('proposalsPage.fieldSelectOpportunity')} /></SelectTrigger>
                <SelectContent>
                  {opportunities.filter((o) => !['Won', 'Lost', 'Cancelled'].includes(o.stage)).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('proposalsPage.fieldTitle')} <span className="text-destructive">*</span></Label>
              <Input placeholder={t('proposalsPage.fieldTitlePh')} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('proposalsPage.fieldValidUntil')}</Label>
                <Input type="date" value={form.validUntil} onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))} />
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('proposalsPage.lineItem')}</p>
              <div className="space-y-1.5">
                <Label>{t('proposalsPage.fieldDescription')} <span className="text-destructive">*</span></Label>
                <Input placeholder={t('proposalsPage.fieldDescriptionPh')} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('proposalsPage.fieldQuantity')}</Label>
                  <Input type="number" min="1" placeholder="1" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('proposalsPage.fieldUnitPrice')}</Label>
                  <Input type="number" min="0" placeholder="0.00" value={form.unitPrice} onChange={(e) => setForm((p) => ({ ...p, unitPrice: e.target.value }))} />
                </div>
              </div>
              {form.quantity && form.unitPrice && (
                <p className="text-sm font-medium">
                  {t('proposalsPage.totalLabel')} {amount(Number(form.quantity) * Number(form.unitPrice))}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t('proposalsPage.fieldNotes')}</Label>
              <Textarea placeholder={t('proposalsPage.fieldNotesPh')} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>{t('common.cancel')}</Button>
            <Button onClick={submit} disabled={submitting || !form.opportunityId || !form.title.trim() || !form.description.trim()}>
              {submitting ? t('proposalsPage.creating') : t('proposalsPage.createProposal')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionPageShell>
  );
}

// ─── Campaigns Page ───────────────────────────────────────────────────────────

export function CampaignsPage() {
  const { selectedCompany, loading, contacts, opportunities, contactName } = useCrmBaseData();
  const { currentRole } = useCompany();
  const canManageFinance = currentRole !== 'Employee';
  const { amount } = useCompanyCurrency();
  const { toast } = useToast();
  const { t } = useI18n();
  const campaignStatusLabel = (s: string) => t(`campaignsPage.status${s.replace(/\s/g, '')}`, s);
  const [campaigns, setCampaigns] = React.useState<CrmCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = React.useState<CrmCampaign | null>(null);
  const [deliverables, setDeliverables] = React.useState<CampaignDeliverable[]>([]);
  const [assignments, setAssignments] = React.useState<CampaignAssignment[]>([]);
  const [expenses, setExpenses] = React.useState<CampaignExpense[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [campaignForm, setCampaignForm] = React.useState({
    name: '', contactId: '', opportunityId: '', startDate: '', endDate: '', budget: '',
  });
  const [deliverableForm, setDeliverableForm] = React.useState({ title: '', platform: '', dueDate: '', price: '', cost: '', vendorContactId: '', fulfillment: 'Internal' as 'Internal' | 'External' });
  const [addingDeliverable, setAddingDeliverable] = React.useState(false);
  const [deliverableDialogOpen, setDeliverableDialogOpen] = React.useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = React.useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = React.useState(false);
  const confirm = useConfirm();
  const [generatingInvoice, setGeneratingInvoice] = React.useState(false);
  const [generatingVendorBills, setGeneratingVendorBills] = React.useState(false);
  const [assignmentForm, setAssignmentForm] = React.useState({ contactId: '', role: 'Influencer' as ContactRoleType, agreedRate: '' });
  const [expenseForm, setExpenseForm] = React.useState({ description: '', amount: '', expenseDate: '', billable: false });

  const [campaignsLoading, setCampaignsLoading] = React.useState(false);

  const loadCampaigns = React.useCallback(async () => {
    if (!selectedCompany) { setCampaigns([]); return; }
    setCampaignsLoading(true);
    try {
      const data = await getCampaigns(selectedCompany.id);
      setCampaigns(data);
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('campaignsPage.toastLoadFailed'), description: error?.message });
    } finally {
      setCampaignsLoading(false);
    }
  }, [selectedCompany, toast]);

  const loadExecution = React.useCallback(async (id: string) => {
    const [d, a, e] = await Promise.allSettled([
      getCampaignDeliverables(id),
      getCampaignAssignments(id),
      getCampaignExpenses(id),
    ]);
    if (d.status === 'fulfilled') setDeliverables(d.value);
    if (a.status === 'fulfilled') setAssignments(a.value);
    if (e.status === 'fulfilled') setExpenses(e.value);
  }, []);

  React.useEffect(() => { loadCampaigns(); }, [loadCampaigns]);
  React.useEffect(() => {
    if (selectedCampaign) loadExecution(selectedCampaign.id);
    else { setDeliverables([]); setAssignments([]); setExpenses([]); }
  }, [selectedCampaign, loadExecution]);

  const submitCampaign = async () => {
    if (!selectedCompany || !campaignForm.name.trim()) return;
    setSubmitting(true);
    try {
      await createCampaign(selectedCompany.id, {
        name: campaignForm.name.trim(),
        contactId: campaignForm.contactId || undefined,
        opportunityId: campaignForm.opportunityId || undefined,
        startDate: campaignForm.startDate ? new Date(campaignForm.startDate) : undefined,
        endDate: campaignForm.endDate ? new Date(campaignForm.endDate) : undefined,
        budget: campaignForm.budget ? Number(campaignForm.budget) : undefined,
        status: 'Planned',
        visibility: 'Public',
      });
      setCampaignForm({ name: '', contactId: '', opportunityId: '', startDate: '', endDate: '', budget: '' });
      setDialogOpen(false);
      await loadCampaigns();
      toast({ title: t('campaignsPage.toastCreated') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('campaignsPage.toastCreateFailed'), description: error?.message });
    } finally { setSubmitting(false); }
  };

  if (!selectedCompany) return (
    <SectionPageShell title={t('campaignsPage.title')} description={t('campaignsPage.shortDescription')}>
      <SectionEmptyState title={t('crm.chooseCompany')} description={t('campaignsPage.chooseCompanyDesc')} />
    </SectionPageShell>
  );

  const active = campaigns.filter((c) => c.status === 'Active').length;
  const planned = campaigns.filter((c) => c.status === 'Planned').length;
  const totalBudget = campaigns.reduce((s, c) => s + (c.budget ?? 0), 0);
  const invoiceableDeliverables = deliverables.filter((item) => (item.price ?? 0) > 0);
  const payableDeliverables = deliverables.filter((item) => item.fulfillment === 'External' && (item.cost ?? 0) > 0 && item.vendorContactId && !item.vendorBillId);
  const missingPayableSetup = deliverables.filter((item) => item.fulfillment === 'External' && (item.cost ?? 0) > 0 && !item.vendorContactId && !item.vendorBillId).length;
  const internalCost = deliverables.filter((item) => item.fulfillment !== 'External').reduce((s, item) => s + (item.cost ?? 0), 0);
  const invoiceDisabledReason = !selectedCampaign?.contactId
    ? t('campaignsPage.invoiceDisabledNoClient')
    : invoiceableDeliverables.length === 0
      ? t('campaignsPage.invoiceDisabledNoDeliverables')
      : '';
  const vendorBillsDisabledReason = payableDeliverables.length === 0
    ? missingPayableSetup > 0
      ? t('campaignsPage.vendorBillsDisabledMissingVendor')
      : t('campaignsPage.vendorBillsDisabledNoPayable')
    : '';

  return (
    <SectionPageShell title={t('campaignsPage.title')} description={t('campaignsPage.description')}>
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Megaphone} label={t('campaignsPage.statTotal')} value={campaigns.length} />
        <StatCard icon={TrendingUp} label={t('campaignsPage.statActive')} value={active} color="text-green-600" />
        <StatCard icon={Clock} label={t('campaignsPage.statPlanned')} value={planned} color="text-purple-600" />
        <StatCard icon={DollarSign} label={t('campaignsPage.statBudget')} value={amount(totalBudget)} color="text-blue-600" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{(campaigns.length !== 1 ? t('campaignsPage.countPlural') : t('campaignsPage.countSingular')).replace('{count}', String(campaigns.length))}</p>
        <Button onClick={() => setDialogOpen(true)} data-tutorial="campaigns-create">
          <Plus className="me-2 h-4 w-4" /> {t('campaignsPage.newCampaign')}
        </Button>
      </div>

      {/* Campaign table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="">
              <TableHead>{t('campaignsPage.colCampaign')}</TableHead>
              <TableHead>{t('campaignsPage.colClient')}</TableHead>
              <TableHead>{t('campaignsPage.colDates')}</TableHead>
              <TableHead>{t('campaignsPage.colBudget')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaignsLoading && [...Array(3)].map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ))}
            {!campaignsLoading && campaigns.map((item) => (
              <TableRow
                key={item.id}
                className={`hover:bg-muted/30 transition-colors cursor-pointer ${selectedCampaign?.id === item.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                onClick={() => setSelectedCampaign(selectedCampaign?.id === item.id ? null : item)}
              >
                <TableCell>
                  <div className="font-semibold text-sm">{item.name}</div>
                  {item.opportunityId && <div className="text-xs text-muted-foreground">{t('campaignsPage.linkedToOpp')}</div>}
                </TableCell>
                <TableCell className="text-sm">{contactName(item.contactId)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.startDate ? new Date(item.startDate).toLocaleDateString() : '—'}
                  {item.endDate ? ` → ${new Date(item.endDate).toLocaleDateString()}` : ''}
                </TableCell>
                <TableCell className="text-sm font-medium">{item.budget ? amount(item.budget) : '—'}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <ColorBadge status={item.status} map={campaignStatusColor} label={campaignStatusLabel(item.status)} />
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    {item.status === 'Planned' && (
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={async (e) => { e.stopPropagation(); await updateCampaign(item.id, { status: 'Active' }); await loadCampaigns(); }}>
                        {t('campaignsPage.actionStart')}
                      </Button>
                    )}
                    {item.status === 'Active' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={async (e) => { e.stopPropagation(); await updateCampaign(item.id, { status: 'Completed' }); await loadCampaigns(); }}>
                        {t('campaignsPage.actionComplete')}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!(await confirm({ title: t('campaignsPage.deleteCampaignTitle'), description: t('campaignsPage.deleteCampaignDesc').replace('{name}', item.name), confirmText: t('common.delete'), cancelText: t('common.cancel'), destructive: true }))) return;
                        await deleteCampaign(item.id); setSelectedCampaign(null); await loadCampaigns();
                      }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!campaignsLoading && campaigns.length === 0 && (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                {t('campaignsPage.emptyState')}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Campaign detail panel */}
      {selectedCampaign && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
            <div>
              <h3 className="font-semibold">{selectedCampaign.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{t('campaignsPage.execution')}</p>
            </div>
            <div className="flex items-center gap-2">
              {canManageFinance && (selectedCampaign.invoiceId ? (
                <Badge variant="outline" className="gap-1 text-xs text-green-700 border-green-300 bg-green-50">
                  <Receipt className="h-3 w-3" /> {t('campaignsPage.invoiceGenerated')}
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  disabled={generatingInvoice || Boolean(invoiceDisabledReason)}
                  title={invoiceDisabledReason || t('campaignsPage.invoiceTitleHint')}
                  onClick={async () => {
                    if (!selectedCompany) return;
                    setGeneratingInvoice(true);
                    try {
                      const invoice = await generateCampaignInvoice(selectedCompany.id, selectedCampaign.id);
                      await loadCampaigns();
                      setSelectedCampaign((prev) => prev ? { ...prev, invoiceId: invoice?.id ?? prev.invoiceId } : prev);
                      toast({ title: t('campaignsPage.toastInvoiceGenerated'), description: t('campaignsPage.toastInvoiceGeneratedDesc') });
                    } catch (error: any) {
                      toast({ variant: 'destructive', title: t('campaignsPage.toastInvoiceFailed'), description: error?.message });
                    } finally {
                      setGeneratingInvoice(false);
                    }
                  }}
                >
                  <Receipt className="h-3 w-3" /> {t('campaignsPage.generateInvoice')}
                </Button>
              ))}
              {canManageFinance && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                disabled={generatingVendorBills || Boolean(vendorBillsDisabledReason)}
                title={vendorBillsDisabledReason || t('campaignsPage.vendorBillsTitleHint')}
                onClick={async () => {
                  if (!selectedCompany) return;
                  setGeneratingVendorBills(true);
                  try {
                    const bills = await generateCampaignVendorBills(selectedCompany.id, selectedCampaign.id);
                    await loadExecution(selectedCampaign.id);
                    if (bills.length === 0) {
                      toast({ title: t('campaignsPage.toastBillsNone'), description: t('campaignsPage.toastBillsNoneDesc') });
                    } else {
                      toast({ title: (bills.length > 1 ? t('campaignsPage.toastBillsGenerated') : t('campaignsPage.toastBillGenerated')).replace('{count}', String(bills.length)), description: t('campaignsPage.toastBillsGeneratedDesc') });
                    }
                  } catch (error: any) {
                    toast({ variant: 'destructive', title: t('campaignsPage.toastBillsFailed'), description: error?.message });
                  } finally {
                    setGeneratingVendorBills(false);
                  }
                }}
              >
                <BadgeDollarSign className="h-3 w-3" /> {t('campaignsPage.generateVendorBills')}
              </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setSelectedCampaign(null)}>
                {t('campaignsPage.close')}
              </Button>
            </div>
          </div>
          {canManageFinance && (
            <div className="border-b bg-background px-5 py-3">
              <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <span className="font-medium text-foreground">{invoiceableDeliverables.length}</span> {invoiceableDeliverables.length === 1 ? t('campaignsPage.invoiceableLabelOne') : t('campaignsPage.invoiceableLabelMany')}
                  <div>{t('campaignsPage.invoiceableSub')}</div>
                </div>
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <span className="font-medium text-foreground">{payableDeliverables.length}</span> {payableDeliverables.length === 1 ? t('campaignsPage.payableLabelOne') : t('campaignsPage.payableLabelMany')}
                  <div>{t('campaignsPage.payableSub')}</div>
                  {internalCost > 0 && (
                    <div className="mt-1 text-[11px]">+ {amount(internalCost)} {t('campaignsPage.internalCostNote')}</div>
                  )}
                </div>
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <span className="font-medium text-foreground">{t('campaignsPage.draftFinance')}</span> {t('campaignsPage.draftFinanceLabel')}
                  <div>{t('campaignsPage.draftFinanceSub')}</div>
                </div>
              </div>
              {(invoiceDisabledReason || vendorBillsDisabledReason) && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    {invoiceDisabledReason && <div>{t('campaignsPage.invoicePrefix')} {invoiceDisabledReason}</div>}
                    {vendorBillsDisabledReason && <div>{t('campaignsPage.vendorBillsPrefix')} {vendorBillsDisabledReason}</div>}
                  </div>
                </div>
              )}
            </div>
          )}
          <Tabs defaultValue="deliverables" className="p-5">
            <TabsList className="mb-4">
              <TabsTrigger value="deliverables" className="gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" /> {t('campaignsPage.tabDeliverables')}
                {deliverables.length > 0 && <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">{deliverables.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="assignments" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> {t('campaignsPage.tabAssignments')}
                {assignments.length > 0 && <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">{assignments.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="expenses" className="gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> {t('campaignsPage.tabExpenses')}
                {expenses.length > 0 && <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">{expenses.length}</span>}
              </TabsTrigger>
            </TabsList>

            {/* Deliverables */}
            <TabsContent value="deliverables">
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setDeliverableDialogOpen(true)}>
                    <Plus className="me-1.5 h-3.5 w-3.5" /> {t('campaignsPage.addDeliverable')}
                  </Button>
                </div>
                <div className="space-y-2">
                  {deliverables.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">{t('campaignsPage.noDeliverables')}</p>}
                  {deliverables.map((item) => (
                    <div key={item.id} className="rounded-lg border bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.platform || t('campaignsPage.noPlatform')}
                            {item.dueDate && ` · ${t('campaignsPage.dueLabel')} ${new Date(item.dueDate).toLocaleDateString()}`}
                            {item.price != null && item.price > 0 && ` · ${t('campaignsPage.clientLabel')}: ${amount(item.price)}`}
                            {item.cost != null && item.cost > 0 && ` · ${t('campaignsPage.costLabel')}: ${amount(item.cost)}`}
                            {item.fulfillment === 'External'
                              ? (item.vendorContactId ? ` · ${t('campaignsPage.vendorLabel')}: ${contactName(item.vendorContactId)}` : '')
                              : ` · ${t('campaignsPage.fulfillmentInternalShort')}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.vendorBillId && (
                            <Badge variant="outline" className="gap-1 text-[10px] h-5 text-blue-700 border-blue-300 bg-blue-50">
                              <BadgeDollarSign className="h-2.5 w-2.5" /> {t('campaignsPage.billBadge')}
                            </Badge>
                          )}
                          {item.status !== 'Published' && (
                            <Button size="sm" variant="outline" className="h-6 text-xs"
                              onClick={async () => { await updateCampaignDeliverable(item.id, { status: 'Published', publishedAt: new Date() }); await loadExecution(selectedCampaign.id); }}>
                              {t('campaignsPage.actionPublish')}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              if (!(await confirm({ title: t('campaignsPage.deleteDeliverableTitle'), description: t('campaignsPage.deleteDeliverableDesc'), confirmText: t('common.delete'), cancelText: t('common.cancel'), destructive: true }))) return;
                              await deleteCampaignDeliverable(item.id); await loadExecution(selectedCampaign.id);
                            }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <ColorBadge status={item.status} map={{ Planned: 'bg-slate-50 text-slate-700 border-slate-200', 'In Progress': 'bg-blue-50 text-blue-700 border-blue-200', Submitted: 'bg-yellow-50 text-yellow-700 border-yellow-200', Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200', Published: 'bg-green-50 text-green-700 border-green-200', Cancelled: 'bg-red-50 text-red-700 border-red-200' }} label={campaignStatusLabel(item.status)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Assignments */}
            <TabsContent value="assignments">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{t('campaignsPage.assignmentsPlanningHint')}</p>
                  <Button size="sm" onClick={() => setAssignmentDialogOpen(true)}>
                    <Plus className="me-1.5 h-3.5 w-3.5" /> {t('campaignsPage.addAssignment')}
                  </Button>
                </div>
                <div className="space-y-2">
                  {assignments.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">{t('campaignsPage.noAssignments')}</p>}
                  {assignments.map((item) => (
                    <div key={item.id} className="rounded-lg border bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{contactName(item.contactId)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.role}{item.agreedRate ? ` · ${amount(item.agreedRate)}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.status !== 'Completed' && (
                            <Button size="sm" variant="outline" className="h-6 text-xs"
                              onClick={async () => { await updateCampaignAssignment(item.id, { status: 'Completed' }); await loadExecution(selectedCampaign.id); }}>
                              {t('campaignsPage.actionDone')}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              if (!(await confirm({ title: t('campaignsPage.deleteAssignmentTitle'), description: t('campaignsPage.deleteAssignmentDesc'), confirmText: t('common.delete'), cancelText: t('common.cancel'), destructive: true }))) return;
                              await deleteCampaignAssignment(item.id); await loadExecution(selectedCampaign.id);
                            }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <ColorBadge status={item.status} map={{ Planned: 'bg-slate-50 text-slate-700 border-slate-200', Contacted: 'bg-yellow-50 text-yellow-700 border-yellow-200', Confirmed: 'bg-green-50 text-green-700 border-green-200', Completed: 'bg-blue-50 text-blue-700 border-blue-200', Cancelled: 'bg-red-50 text-red-700 border-red-200' }} label={campaignStatusLabel(item.status)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Expenses */}
            <TabsContent value="expenses">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  {expenses.length > 0 ? (
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t('campaignsPage.totalExpenses')} </span>
                      <span className="font-semibold">{amount(expenses.reduce((s, e) => s + e.amount, 0))}</span>
                    </div>
                  ) : <span />}
                  <Button size="sm" onClick={() => setExpenseDialogOpen(true)}>
                    <Plus className="me-1.5 h-3.5 w-3.5" /> {t('campaignsPage.addExpense')}
                  </Button>
                </div>
                <div className="space-y-2">
                  {expenses.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">{t('campaignsPage.noExpenses')}</p>}
                  {expenses.map((item) => (
                    <div key={item.id} className="rounded-lg border bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{item.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {amount(item.amount)}{item.billable ? ` · ${t('campaignsPage.billable')}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.status !== 'Approved' && (
                            <Button size="sm" variant="outline" className="h-6 text-xs"
                              onClick={async () => { await updateCampaignExpense(item.id, { status: 'Approved' }); await loadExecution(selectedCampaign.id); }}>
                              {t('campaignsPage.actionApprove')}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              if (!(await confirm({ title: t('campaignsPage.deleteExpenseTitle'), description: t('campaignsPage.deleteExpenseDesc'), confirmText: t('common.delete'), cancelText: t('common.cancel'), destructive: true }))) return;
                              await deleteCampaignExpense(item.id); await loadExecution(selectedCampaign.id);
                            }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <ColorBadge status={item.status} map={{ Draft: 'bg-slate-50 text-slate-700 border-slate-200', Submitted: 'bg-yellow-50 text-yellow-700 border-yellow-200', Approved: 'bg-green-50 text-green-700 border-green-200', Rejected: 'bg-red-50 text-red-700 border-red-200', Paid: 'bg-blue-50 text-blue-700 border-blue-200' }} label={campaignStatusLabel(item.status)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Create campaign dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setCampaignForm({ name: '', contactId: '', opportunityId: '', startDate: '', endDate: '', budget: '' }); setDialogOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" /> {t('campaignsPage.newCampaign')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('campaignsPage.fieldName')} <span className="text-destructive">*</span></Label>
              <Input placeholder={t('campaignsPage.fieldNamePh')} value={campaignForm.name} onChange={(e) => setCampaignForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('campaignsPage.fieldClient')}</Label>
                <Combobox
                  options={contacts.map((c) => ({ value: c.id, label: c.name }))}
                  value={campaignForm.contactId}
                  onValueChange={(v) => setCampaignForm((p) => ({ ...p, contactId: v }))}
                  placeholder={t('campaignsPage.selectPlaceholder')}
                  searchPlaceholder={t('campaignsPage.selectPlaceholder')}
                  clearLabel="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('campaignsPage.fieldOpportunity')}</Label>
                <Combobox
                  options={opportunities.map((o) => ({ value: o.id, label: o.title }))}
                  value={campaignForm.opportunityId}
                  onValueChange={(v) => setCampaignForm((p) => ({ ...p, opportunityId: v }))}
                  placeholder={t('campaignsPage.selectPlaceholder')}
                  searchPlaceholder={t('campaignsPage.selectPlaceholder')}
                  clearLabel="—"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('campaignsPage.fieldStartDate')}</Label>
                <Input type="date" value={campaignForm.startDate} onChange={(e) => setCampaignForm((p) => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('campaignsPage.fieldEndDate')}</Label>
                <Input type="date" value={campaignForm.endDate} onChange={(e) => setCampaignForm((p) => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('campaignsPage.fieldBudget')}</Label>
              <Input type="number" placeholder="0.00" value={campaignForm.budget} onChange={(e) => setCampaignForm((p) => ({ ...p, budget: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={submitCampaign} disabled={submitting || !campaignForm.name.trim()}>
              {submitting ? t('campaignsPage.creating') : t('campaignsPage.createCampaign')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add deliverable dialog */}
      <Dialog open={deliverableDialogOpen} onOpenChange={setDeliverableDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> {t('campaignsPage.addDeliverable')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>{t('campaignsPage.fieldName')} <span className="text-destructive">*</span></Label>
              <Input placeholder={t('campaignsPage.deliverableTitlePh')} value={deliverableForm.title} onChange={(e) => setDeliverableForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <Select value={deliverableForm.platform || '__none__'} onValueChange={(v) => setDeliverableForm((p) => ({ ...p, platform: v === '__none__' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder={t('campaignsPage.deliverablePlatformPh')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {CAMPAIGN_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={deliverableForm.dueDate} onChange={(e) => setDeliverableForm((p) => ({ ...p, dueDate: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('campaignsPage.deliverablePriceLabel')}</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={deliverableForm.price} onChange={(e) => setDeliverableForm((p) => ({ ...p, price: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('campaignsPage.deliverableCostLabel')}</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={deliverableForm.cost} onChange={(e) => setDeliverableForm((p) => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('campaignsPage.fulfilledByLabel')}</Label>
              <Select value={deliverableForm.fulfillment} onValueChange={(v: 'Internal' | 'External') => setDeliverableForm((p) => ({ ...p, fulfillment: v, vendorContactId: v === 'Internal' ? '' : p.vendorContactId }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Internal">{t('campaignsPage.fulfillmentInternal')}</SelectItem>
                  <SelectItem value="External">{t('campaignsPage.fulfillmentExternal')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {deliverableForm.fulfillment === 'External' && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('campaignsPage.deliverableVendorPh')}</Label>
                <Combobox
                  options={contacts.map((c) => ({ value: c.id, label: c.name }))}
                  value={deliverableForm.vendorContactId}
                  onValueChange={(v) => setDeliverableForm((p) => ({ ...p, vendorContactId: v }))}
                  placeholder={t('campaignsPage.deliverableVendorPh')}
                  searchPlaceholder={t('campaignsPage.deliverableVendorPh')}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverableDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={addingDeliverable || !deliverableForm.title.trim() || (deliverableForm.fulfillment === 'External' && !deliverableForm.vendorContactId)} onClick={async () => {
              if (!selectedCampaign || !deliverableForm.title.trim()) return;
              if (deliverableForm.fulfillment === 'External' && !deliverableForm.vendorContactId) {
                toast({ variant: 'destructive', title: t('campaignsPage.vendorRequiredTitle'), description: t('campaignsPage.vendorRequiredDesc') });
                return;
              }
              setAddingDeliverable(true);
              try {
                await createCampaignDeliverable(selectedCampaign.id, {
                  title: deliverableForm.title.trim(),
                  platform: deliverableForm.platform || undefined,
                  dueDate: deliverableForm.dueDate ? new Date(deliverableForm.dueDate) : undefined,
                  price: deliverableForm.price ? Number(deliverableForm.price) : undefined,
                  cost: deliverableForm.cost ? Number(deliverableForm.cost) : undefined,
                  fulfillment: deliverableForm.fulfillment,
                  vendorContactId: deliverableForm.fulfillment === 'External' ? (deliverableForm.vendorContactId || undefined) : undefined,
                });
                setDeliverableForm({ title: '', platform: '', dueDate: '', price: '', cost: '', vendorContactId: '', fulfillment: 'Internal' });
                setDeliverableDialogOpen(false);
                await loadExecution(selectedCampaign.id);
              } catch (error: any) {
                toast({ variant: 'destructive', title: t('campaignsPage.toastCreateFailed'), description: error?.message });
              } finally {
                setAddingDeliverable(false);
              }
            }}>
              <Plus className="me-1.5 h-3.5 w-3.5" /> {t('campaignsPage.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add assignment dialog */}
      <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> {t('campaignsPage.addAssignment')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>{t('campaignsPage.selectContact')} <span className="text-destructive">*</span></Label>
              <Combobox
                options={contacts.map((c) => ({ value: c.id, label: c.name }))}
                value={assignmentForm.contactId}
                onValueChange={(v) => setAssignmentForm((p) => ({ ...p, contactId: v }))}
                placeholder={t('campaignsPage.selectContact')}
                searchPlaceholder={t('campaignsPage.selectContact')}
              />
            </div>
            <Select value={assignmentForm.role} onValueChange={(v: ContactRoleType) => setAssignmentForm((p) => ({ ...p, role: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Influencer">{t('campaignsPage.roleInfluencer')}</SelectItem>
                <SelectItem value="Vendor">{t('campaignsPage.roleVendor')}</SelectItem>
                <SelectItem value="Partner">{t('campaignsPage.rolePartner')}</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" placeholder={t('campaignsPage.agreedRatePh')} value={assignmentForm.agreedRate} onChange={(e) => setAssignmentForm((p) => ({ ...p, agreedRate: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignmentDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={!assignmentForm.contactId} onClick={async () => {
              if (!selectedCampaign || !assignmentForm.contactId) return;
              await createCampaignAssignment(selectedCampaign.id, {
                contactId: assignmentForm.contactId,
                role: assignmentForm.role,
                agreedRate: assignmentForm.agreedRate ? Number(assignmentForm.agreedRate) : undefined,
                status: 'Confirmed',
              });
              setAssignmentForm({ contactId: '', role: 'Influencer', agreedRate: '' });
              setAssignmentDialogOpen(false);
              await loadExecution(selectedCampaign.id);
            }}>
              <Plus className="me-1.5 h-3.5 w-3.5" /> {t('campaignsPage.assign')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add expense dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" /> {t('campaignsPage.addExpense')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>{t('campaignsPage.expenseDescPh')} <span className="text-destructive">*</span></Label>
              <Input placeholder={t('campaignsPage.expenseDescPh')} value={expenseForm.description} onChange={(e) => setExpenseForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <Input type="number" placeholder={t('campaignsPage.expenseAmountPh')} value={expenseForm.amount} onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))} />
            <Input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm((p) => ({ ...p, expenseDate: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={expenseForm.billable} className="rounded" onChange={(e) => setExpenseForm((p) => ({ ...p, billable: e.target.checked }))} />
              <span className="text-muted-foreground">{t('campaignsPage.billableLabel')}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={!expenseForm.description.trim()} onClick={async () => {
              if (!selectedCampaign || !expenseForm.description.trim()) return;
              await createCampaignExpense(selectedCampaign.id, {
                description: expenseForm.description.trim(),
                amount: Number(expenseForm.amount || 0),
                expenseDate: expenseForm.expenseDate ? new Date(expenseForm.expenseDate) : undefined,
                billable: expenseForm.billable,
                status: 'Submitted',
              });
              setExpenseForm({ description: '', amount: '', expenseDate: '', billable: false });
              setExpenseDialogOpen(false);
              await loadExecution(selectedCampaign.id);
            }}>
              <Plus className="me-1.5 h-3.5 w-3.5" /> {t('campaignsPage.addExpense')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionPageShell>
  );
}

// ─── Vendor Requests Page ─────────────────────────────────────────────────────

export function VendorRequestsPage() {
  const { selectedCompany, loading } = useCrmBaseData();
  const { amount } = useCompanyCurrency();
  const { toast } = useToast();
  const { t } = useI18n();
  const vendorStatusLabel = (s: string) => t(`vendorRequestsPage.status${s.replace(/\s/g, '')}`, s);
  const [requests, setRequests] = React.useState<VendorRequest[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [rejectDialogItem, setRejectDialogItem] = React.useState<VendorRequest | null>(null);
  const [rejectNote, setRejectNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '', role: 'Influencer' as 'Influencer' | 'Vendor', requestType: '',
    platform: '', handle: '', dueDate: '', cost: '', details: '',
  });

  const load = React.useCallback(async () => {
    if (!selectedCompany) return setRequests([]);
    try { setRequests(await getVendorRequests(selectedCompany.id)); }
    catch (error: any) { toast({ variant: 'destructive', title: t('vendorRequestsPage.toastLoadFailed'), description: error?.message }); }
  }, [selectedCompany, toast, t]);

  React.useEffect(() => { load(); }, [load]);

  const resetForm = () => setForm({ name: '', role: 'Influencer', requestType: '', platform: '', handle: '', dueDate: '', cost: '', details: '' });

  const submit = async () => {
    if (!selectedCompany || !form.name.trim()) return;
    setSubmitting(true);
    try {
      await createVendorRequest(selectedCompany.id, {
        name: form.name.trim(),
        role: form.role,
        requestType: form.requestType || undefined,
        platform: form.platform || undefined,
        handle: form.handle || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
        cost: form.cost ? Number(form.cost) : undefined,
        details: form.details || undefined,
      });
      resetForm();
      setDialogOpen(false);
      await load();
      toast({ title: t('vendorRequestsPage.toastSubmitted') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('vendorRequestsPage.toastSubmitFailed'), description: error?.message });
    } finally { setSubmitting(false); }
  };

  const handleReject = async () => {
    if (!rejectDialogItem) return;
    await updateVendorRequestStatus(rejectDialogItem.id, 'Rejected', rejectNote || undefined);
    setRejectDialogItem(null);
    setRejectNote('');
    await load();
  };

  if (!selectedCompany) return (
    <SectionPageShell title={t('vendorRequestsPage.title')} description={t('vendorRequestsPage.shortDescription')}>
      <SectionEmptyState title={t('crm.chooseCompany')} description={t('vendorRequestsPage.chooseCompanyDesc')} />
    </SectionPageShell>
  );

  const pending = requests.filter((r) => ['New', 'Under Review'].includes(r.status)).length;
  const approved = requests.filter((r) => r.status === 'Approved').length;
  const rejected = requests.filter((r) => r.status === 'Rejected').length;

  return (
    <SectionPageShell title={t('vendorRequestsPage.title')} description={t('vendorRequestsPage.description')}>
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={AlertCircle} label={t('vendorRequestsPage.statPending')} value={pending} color={pending > 0 ? 'text-yellow-600' : 'text-foreground'} />
        <StatCard icon={CheckCircle2} label={t('vendorRequestsPage.statApproved')} value={approved} color="text-green-600" />
        <StatCard icon={XCircle} label={t('vendorRequestsPage.statRejected')} value={rejected} color="text-red-600" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{(requests.length !== 1 ? t('vendorRequestsPage.countPlural') : t('vendorRequestsPage.countSingular')).replace('{count}', String(requests.length))}</p>
        <Button onClick={() => setDialogOpen(true)} data-tutorial="vendor-requests-create">
          <Plus className="me-2 h-4 w-4" /> {t('vendorRequestsPage.newRequest')}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="">
              <TableHead>{t('vendorRequestsPage.colRequest')}</TableHead>
              <TableHead>{t('vendorRequestsPage.colType')}</TableHead>
              <TableHead>{t('vendorRequestsPage.colPlatformHandle')}</TableHead>
              <TableHead>{t('vendorRequestsPage.colDue')}</TableHead>
              <TableHead>{t('vendorRequestsPage.colEstCost')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && [...Array(3)].map((_, i) => (
              <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ))}
            {!loading && requests.map((item) => (
              <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div className="font-semibold text-sm">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.role}{item.requestedByName ? ` · ${t('vendorRequestsPage.requestedBy').replace('{name}', item.requestedByName)}` : ''}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{item.requestType || '—'}</TableCell>
                <TableCell className="text-sm">
                  {item.platform && <span className="font-medium">{item.platform}</span>}
                  {item.handle && <span className="text-muted-foreground"> @{item.handle}</span>}
                  {!item.platform && !item.handle && '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell className="text-sm font-medium">{item.cost ? amount(item.cost) : '—'}</TableCell>
                <TableCell><ColorBadge status={item.status} map={vendorStatusColor} label={vendorStatusLabel(item.status)} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {['New', 'Under Review'].includes(item.status) && (
                      <>
                        <Button size="sm" className="h-7 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
                          onClick={async () => { await updateVendorRequestStatus(item.id, 'Approved'); await load(); }}>
                          <CheckCircle2 className="h-3 w-3" /> {t('vendorRequestsPage.actionApprove')}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => { setRejectDialogItem(item); setRejectNote(''); }}>
                          <XCircle className="h-3 w-3" /> {t('vendorRequestsPage.actionReject')}
                        </Button>
                      </>
                    )}
                    {item.status !== 'Archived' && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={async () => { await deleteVendorRequest(item.id); await load(); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && requests.length === 0 && (
              <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                {t('vendorRequestsPage.emptyState')}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setDialogOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRoundSearch className="h-5 w-5 text-primary" /> {t('vendorRequestsPage.dialogNewTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('vendorRequestsPage.fieldName')} <span className="text-destructive">*</span></Label>
                <Input placeholder={t('vendorRequestsPage.fieldNamePh')} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('vendorRequestsPage.fieldRole')}</Label>
                <Select value={form.role} onValueChange={(v: 'Influencer' | 'Vendor') => setForm((p) => ({ ...p, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Influencer">{t('vendorRequestsPage.roleInfluencer')}</SelectItem>
                    <SelectItem value="Vendor">{t('vendorRequestsPage.roleVendor')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('vendorRequestsPage.fieldPlatform')}</Label>
                <Select value={form.platform || '__none__'} onValueChange={(v) => setForm((p) => ({ ...p, platform: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder={t('vendorRequestsPage.fieldPlatformPh')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {CAMPAIGN_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('vendorRequestsPage.fieldHandle')}</Label>
                <Input placeholder={t('vendorRequestsPage.fieldHandlePh')} value={form.handle} onChange={(e) => setForm((p) => ({ ...p, handle: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('vendorRequestsPage.fieldType')}</Label>
                <Input placeholder={t('vendorRequestsPage.fieldTypePh')} value={form.requestType} onChange={(e) => setForm((p) => ({ ...p, requestType: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('vendorRequestsPage.fieldEstCost')}</Label>
                <Input type="number" placeholder="0.00" value={form.cost} onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('vendorRequestsPage.fieldDueDate')}</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('vendorRequestsPage.fieldDetails')}</Label>
              <Textarea placeholder={t('vendorRequestsPage.fieldDetailsPh')} value={form.details} onChange={(e) => setForm((p) => ({ ...p, details: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>{t('common.cancel')}</Button>
            <Button onClick={submit} disabled={submitting || !form.name.trim()}>
              {submitting ? t('vendorRequestsPage.submitting') : t('vendorRequestsPage.submitRequest')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject with reason dialog */}
      <Dialog open={!!rejectDialogItem} onOpenChange={(v) => { if (!v) { setRejectDialogItem(null); setRejectNote(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" /> {t('vendorRequestsPage.rejectTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t('vendorRequestsPage.rejectingFor')} <span className="font-medium text-foreground">{rejectDialogItem?.name}</span>.
            </p>
            <div className="space-y-1.5">
              <Label>{t('vendorRequestsPage.rejectReasonLabel')}</Label>
              <Textarea placeholder={t('vendorRequestsPage.rejectReasonPh')} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogItem(null); setRejectNote(''); }}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleReject}>{t('vendorRequestsPage.confirmRejection')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionPageShell>
  );
}

// ─── Commissions Page ─────────────────────────────────────────────────────────

export function CommissionsPage() {
  const { selectedCompany, loading } = useCrmBaseData();
  const { amount } = useCompanyCurrency();
  const { toast } = useToast();
  const [commissions, setCommissions] = React.useState<Commission[]>([]);

  const load = React.useCallback(async () => {
    if (!selectedCompany) return setCommissions([]);
    try { setCommissions(await getCommissions(selectedCompany.id)); }
    catch (error: any) { toast({ variant: 'destructive', title: 'Could not load commissions', description: error?.message }); }
  }, [selectedCompany, toast]);

  React.useEffect(() => { load(); }, [load]);

  if (!selectedCompany) return (
    <SectionPageShell title="Commissions" description="Review and pay team commissions.">
      <SectionEmptyState title="Choose a company" description="Commissions are company-specific." />
    </SectionPageShell>
  );

  const draftTotal = commissions.filter((c) => c.status === 'Draft').reduce((s, c) => s + c.amount, 0);
  const approvedTotal = commissions.filter((c) => c.status === 'Approved').reduce((s, c) => s + c.amount, 0);
  const paidTotal = commissions.filter((c) => c.status === 'Paid').reduce((s, c) => s + c.amount, 0);

  return (
    <SectionPageShell title="Commissions" description="Approve and pay commissions generated from won opportunities.">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={BadgeDollarSign} label="Draft" value={amount(draftTotal)} sub={`${commissions.filter((c) => c.status === 'Draft').length} entries`} color="text-gray-600" />
        <StatCard icon={CheckCircle2} label="Approved" value={amount(approvedTotal)} sub={`${commissions.filter((c) => c.status === 'Approved').length} entries`} color="text-blue-600" />
        <StatCard icon={TrendingUp} label="Paid Out" value={amount(paidTotal)} sub={`${commissions.filter((c) => c.status === 'Paid').length} entries`} color="text-green-600" />
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="">
              <TableHead>Service</TableHead>
              <TableHead>Team Member</TableHead>
              <TableHead>Basis</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && [...Array(3)].map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ))}
            {!loading && commissions.map((item) => (
              <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium text-sm">{item.serviceType}</TableCell>
                <TableCell className="text-sm">{item.userName || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{amount(item.basisAmount)}</TableCell>
                <TableCell className="font-semibold text-sm">{amount(item.amount)}</TableCell>
                <TableCell><ColorBadge status={item.status} map={commissionStatusColor} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {item.status === 'Draft' && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                        onClick={async () => { await updateCommissionStatus(item.id, 'Approved'); await load(); }}>
                        <CheckCircle2 className="h-3 w-3" /> Approve
                      </Button>
                    )}
                    {item.status === 'Approved' && (
                      <Button size="sm" className="h-7 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={async () => { await updateCommissionStatus(item.id, 'Paid'); await load(); }}>
                        <BadgeDollarSign className="h-3 w-3" /> Mark Paid
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && commissions.length === 0 && (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                No commissions yet. Commissions are generated from won opportunities.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </SectionPageShell>
  );
}
