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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompany } from '@/context/company-context';
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

function ColorBadge({ status, map }: { status: string; map: Record<string, string> }) {
  const cls = map[status] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
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
      toast({ variant: 'destructive', title: 'CRM unavailable', description: error?.message });
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

// ─── Proposals Page ──────────────────────────────────────────────────────────

export function ProposalsPage() {
  const { selectedCompany, loading, opportunities, contactName } = useCrmBaseData();
  const { amount } = useCompanyCurrency();
  const { toast } = useToast();
  const [proposals, setProposals] = React.useState<CrmProposal[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    opportunityId: '', title: '', description: '', quantity: '1', unitPrice: '', validUntil: '', notes: '',
  });

  const load = React.useCallback(async () => {
    if (!selectedCompany) return setProposals([]);
    try { setProposals(await getProposals(selectedCompany.id)); }
    catch (error: any) { toast({ variant: 'destructive', title: 'Could not load proposals', description: error?.message }); }
  }, [selectedCompany, toast]);

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
      toast({ title: 'Proposal created' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to create proposal', description: error?.message });
    } finally { setSubmitting(false); }
  };

  if (!selectedCompany) return (
    <SectionPageShell title="Proposals" description="Create and manage client proposals.">
      <SectionEmptyState title="Choose a company" description="Proposals are company-specific." />
    </SectionPageShell>
  );

  const total = proposals.reduce((s, p) => s + (p.totalAmount ?? 0), 0);
  const byStatus = (s: string) => proposals.filter((p) => p.status === s).length;

  return (
    <SectionPageShell
      title="Proposals"
      description="Create quotes from opportunities and move accepted proposals into delivery."
    >
      {/* Stats strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label="Total Proposals" value={proposals.length} />
        <StatCard icon={Clock} label="Drafts" value={byStatus('Draft')} color="text-gray-600" />
        <StatCard icon={Send} label="Sent" value={byStatus('Sent')} color="text-blue-600" />
        <StatCard icon={TrendingUp} label="Total Value" value={amount(total)} color="text-green-600" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{proposals.length} proposal{proposals.length !== 1 ? 's' : ''}</p>
        <Button onClick={() => setDialogOpen(true)} data-tutorial="proposals-create">
          <Plus className="me-2 h-4 w-4" /> New Proposal
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="">
              <TableHead>Proposal</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Valid Until</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                <TableCell><ColorBadge status={item.status} map={proposalStatusColor} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {item.status === 'Draft' && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                        onClick={async () => { await updateProposalStatus(item.id, 'Sent'); await load(); }}>
                        <Send className="h-3 w-3" /> Send
                      </Button>
                    )}
                    {item.status === 'Sent' && (
                      <Button size="sm" className="h-7 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={async () => { await updateProposalStatus(item.id, 'Accepted'); await load(); }}>
                        <CheckCircle2 className="h-3 w-3" /> Accept
                      </Button>
                    )}
                    {item.status === 'Sent' && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={async () => { await updateProposalStatus(item.id, 'Declined'); await load(); }}>
                        <XCircle className="h-3 w-3" /> Decline
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
                No proposals yet. Create your first one.
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
              <FileText className="h-5 w-5 text-primary" /> New Proposal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Opportunity <span className="text-destructive">*</span></Label>
              <Select value={form.opportunityId} onValueChange={(v) => setForm((p) => ({ ...p, opportunityId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select opportunity" /></SelectTrigger>
                <SelectContent>
                  {opportunities.filter((o) => !['Won', 'Lost', 'Cancelled'].includes(o.stage)).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Proposal Title <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Q3 Social Media Package" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valid Until</Label>
                <Input type="date" value={form.validUntil} onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))} />
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Line Item</p>
              <div className="space-y-1.5">
                <Label>Description <span className="text-destructive">*</span></Label>
                <Input placeholder="Service or product description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Quantity</Label>
                  <Input type="number" min="1" placeholder="1" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Unit Price</Label>
                  <Input type="number" min="0" placeholder="0.00" value={form.unitPrice} onChange={(e) => setForm((p) => ({ ...p, unitPrice: e.target.value }))} />
                </div>
              </div>
              {form.quantity && form.unitPrice && (
                <p className="text-sm font-medium">
                  Total: {amount(Number(form.quantity) * Number(form.unitPrice))}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes or terms..." value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || !form.opportunityId || !form.title.trim() || !form.description.trim()}>
              {submitting ? 'Creating…' : 'Create Proposal'}
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
  const [deliverableForm, setDeliverableForm] = React.useState({ title: '', platform: '', dueDate: '', price: '', cost: '', vendorContactId: '' });
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
      toast({ variant: 'destructive', title: 'Could not load campaigns', description: error?.message });
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
      toast({ title: 'Campaign created' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to create campaign', description: error?.message });
    } finally { setSubmitting(false); }
  };

  if (!selectedCompany) return (
    <SectionPageShell title="Campaigns" description="Plan and execute client campaigns.">
      <SectionEmptyState title="Choose a company" description="Campaigns are company-specific." />
    </SectionPageShell>
  );

  const active = campaigns.filter((c) => c.status === 'Active').length;
  const planned = campaigns.filter((c) => c.status === 'Planned').length;
  const totalBudget = campaigns.reduce((s, c) => s + (c.budget ?? 0), 0);
  const invoiceableDeliverables = deliverables.filter((item) => (item.price ?? 0) > 0);
  const payableDeliverables = deliverables.filter((item) => (item.cost ?? 0) > 0 && item.vendorContactId && !item.vendorBillId);
  const missingPayableSetup = deliverables.filter((item) => (item.cost ?? 0) > 0 && !item.vendorContactId && !item.vendorBillId).length;
  const invoiceDisabledReason = !selectedCampaign?.contactId
    ? 'Choose a campaign client before generating an invoice.'
    : invoiceableDeliverables.length === 0
      ? 'Add at least one deliverable with a Client Price.'
      : '';
  const vendorBillsDisabledReason = payableDeliverables.length === 0
    ? missingPayableSetup > 0
      ? 'Add a Vendor / Influencer to deliverables with Vendor Cost.'
      : 'Add at least one unbilled deliverable with Vendor Cost and Vendor / Influencer.'
    : '';

  return (
    <SectionPageShell title="Campaigns" description="Manage campaign delivery, influencers, vendors, and expenses.">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Megaphone} label="Total Campaigns" value={campaigns.length} />
        <StatCard icon={TrendingUp} label="Active" value={active} color="text-green-600" />
        <StatCard icon={Clock} label="Planned" value={planned} color="text-purple-600" />
        <StatCard icon={DollarSign} label="Total Budget" value={amount(totalBudget)} color="text-blue-600" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
        <Button onClick={() => setDialogOpen(true)} data-tutorial="campaigns-create">
          <Plus className="me-2 h-4 w-4" /> New Campaign
        </Button>
      </div>

      {/* Campaign table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="">
              <TableHead>Campaign</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                  {item.opportunityId && <div className="text-xs text-muted-foreground">Linked to opportunity</div>}
                </TableCell>
                <TableCell className="text-sm">{contactName(item.contactId)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.startDate ? new Date(item.startDate).toLocaleDateString() : '—'}
                  {item.endDate ? ` → ${new Date(item.endDate).toLocaleDateString()}` : ''}
                </TableCell>
                <TableCell className="text-sm font-medium">{item.budget ? amount(item.budget) : '—'}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <ColorBadge status={item.status} map={campaignStatusColor} />
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    {item.status === 'Planned' && (
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={async (e) => { e.stopPropagation(); await updateCampaign(item.id, { status: 'Active' }); await loadCampaigns(); }}>
                        Start
                      </Button>
                    )}
                    {item.status === 'Active' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={async (e) => { e.stopPropagation(); await updateCampaign(item.id, { status: 'Completed' }); await loadCampaigns(); }}>
                        Complete
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={async (e) => { e.stopPropagation(); await deleteCampaign(item.id); setSelectedCampaign(null); await loadCampaigns(); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!campaignsLoading && campaigns.length === 0 && (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                No campaigns yet. Create your first one.
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
              <p className="text-xs text-muted-foreground mt-0.5">Campaign Execution</p>
            </div>
            <div className="flex items-center gap-2">
              {canManageFinance && (selectedCampaign.invoiceId ? (
                <Badge variant="outline" className="gap-1 text-xs text-green-700 border-green-300 bg-green-50">
                  <Receipt className="h-3 w-3" /> Invoice Generated
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  disabled={generatingInvoice || Boolean(invoiceDisabledReason)}
                  title={invoiceDisabledReason || 'Generate a draft client invoice from deliverable Client Prices.'}
                  onClick={async () => {
                    if (!selectedCompany) return;
                    setGeneratingInvoice(true);
                    try {
                      const invoice = await generateCampaignInvoice(selectedCompany.id, selectedCampaign.id);
                      await loadCampaigns();
                      setSelectedCampaign((prev) => prev ? { ...prev, invoiceId: invoice?.id ?? prev.invoiceId } : prev);
                      toast({ title: 'Invoice generated', description: 'A draft invoice has been created from deliverable Client Prices.' });
                    } catch (error: any) {
                      toast({ variant: 'destructive', title: 'Failed to generate invoice', description: error?.message });
                    } finally {
                      setGeneratingInvoice(false);
                    }
                  }}
                >
                  <Receipt className="h-3 w-3" /> Generate Invoice
                </Button>
              ))}
              {canManageFinance && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                disabled={generatingVendorBills || Boolean(vendorBillsDisabledReason)}
                title={vendorBillsDisabledReason || 'Generate draft vendor bills from Vendor Costs.'}
                onClick={async () => {
                  if (!selectedCompany) return;
                  setGeneratingVendorBills(true);
                  try {
                    const bills = await generateCampaignVendorBills(selectedCompany.id, selectedCampaign.id);
                    await loadExecution(selectedCampaign.id);
                    if (bills.length === 0) {
                      toast({ title: 'No bills created', description: 'All deliverables are already billed or are missing Vendor Cost / Vendor.' });
                    } else {
                      toast({ title: `${bills.length} vendor bill${bills.length > 1 ? 's' : ''} generated`, description: 'Draft vendor bills were created. Approve them in Finance > Payables to affect Open Payables.' });
                    }
                  } catch (error: any) {
                    toast({ variant: 'destructive', title: 'Failed to generate vendor bills', description: error?.message });
                  } finally {
                    setGeneratingVendorBills(false);
                  }
                }}
              >
                <BadgeDollarSign className="h-3 w-3" /> Generate Vendor Bills
              </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setSelectedCampaign(null)}>
                Close
              </Button>
            </div>
          </div>
          {canManageFinance && (
            <div className="border-b bg-background px-5 py-3">
              <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <span className="font-medium text-foreground">{invoiceableDeliverables.length}</span> invoiceable deliverable{invoiceableDeliverables.length === 1 ? '' : 's'}
                  <div>Uses Client Price for draft invoices.</div>
                </div>
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <span className="font-medium text-foreground">{payableDeliverables.length}</span> payable deliverable{payableDeliverables.length === 1 ? '' : 's'}
                  <div>Uses Vendor Cost and Vendor / Influencer.</div>
                </div>
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <span className="font-medium text-foreground">Draft</span> finance records
                  <div>Generated vendor bills affect Open Payables after approval.</div>
                </div>
              </div>
              {(invoiceDisabledReason || vendorBillsDisabledReason) && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    {invoiceDisabledReason && <div>Invoice: {invoiceDisabledReason}</div>}
                    {vendorBillsDisabledReason && <div>Vendor bills: {vendorBillsDisabledReason}</div>}
                  </div>
                </div>
              )}
            </div>
          )}
          <Tabs defaultValue="deliverables" className="p-5">
            <TabsList className="mb-4">
              <TabsTrigger value="deliverables" className="gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" /> Deliverables
                {deliverables.length > 0 && <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">{deliverables.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="assignments" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Assignments
                {assignments.length > 0 && <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">{assignments.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="expenses" className="gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Expenses
                {expenses.length > 0 && <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">{expenses.length}</span>}
              </TabsTrigger>
            </TabsList>

            {/* Deliverables */}
            <TabsContent value="deliverables">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add Deliverable</p>
                    <Input placeholder="Title" value={deliverableForm.title} onChange={(e) => setDeliverableForm((p) => ({ ...p, title: e.target.value }))} />
                    <Input placeholder="Platform (Instagram, TikTok…)" value={deliverableForm.platform} onChange={(e) => setDeliverableForm((p) => ({ ...p, platform: e.target.value }))} />
                    <Input type="date" value={deliverableForm.dueDate} onChange={(e) => setDeliverableForm((p) => ({ ...p, dueDate: e.target.value }))} />
                    <Input type="number" min="0" step="0.01" placeholder="Client Price (optional)" value={deliverableForm.price} onChange={(e) => setDeliverableForm((p) => ({ ...p, price: e.target.value }))} />
                    <Input type="number" min="0" step="0.01" placeholder="Vendor Cost (optional)" value={deliverableForm.cost} onChange={(e) => setDeliverableForm((p) => ({ ...p, cost: e.target.value }))} />
                    <Select value={deliverableForm.vendorContactId || '__none__'} onValueChange={(v) => setDeliverableForm((p) => ({ ...p, vendorContactId: v === '__none__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Vendor / Influencer (optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="w-full" onClick={async () => {
                      if (!deliverableForm.title.trim()) return;
                      await createCampaignDeliverable(selectedCampaign.id, {
                        title: deliverableForm.title.trim(),
                        platform: deliverableForm.platform || undefined,
                        dueDate: deliverableForm.dueDate ? new Date(deliverableForm.dueDate) : undefined,
                        price: deliverableForm.price ? Number(deliverableForm.price) : undefined,
                        cost: deliverableForm.cost ? Number(deliverableForm.cost) : undefined,
                        vendorContactId: deliverableForm.vendorContactId || undefined,
                      });
                      setDeliverableForm({ title: '', platform: '', dueDate: '', price: '', cost: '', vendorContactId: '' });
                      await loadExecution(selectedCampaign.id);
                    }}>
                      <Plus className="me-1.5 h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {deliverables.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No deliverables yet.</p>}
                  {deliverables.map((item) => (
                    <div key={item.id} className="rounded-lg border bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.platform || 'No platform'}
                            {item.dueDate && ` · Due ${new Date(item.dueDate).toLocaleDateString()}`}
                            {item.price != null && item.price > 0 && ` · Client: ${amount(item.price)}`}
                            {item.cost != null && item.cost > 0 && ` · Cost: ${amount(item.cost)}`}
                            {item.vendorContactId && ` · Vendor: ${contactName(item.vendorContactId)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.vendorBillId && (
                            <Badge variant="outline" className="gap-1 text-[10px] h-5 text-blue-700 border-blue-300 bg-blue-50">
                              <BadgeDollarSign className="h-2.5 w-2.5" /> Bill
                            </Badge>
                          )}
                          {item.status !== 'Published' && (
                            <Button size="sm" variant="outline" className="h-6 text-xs"
                              onClick={async () => { await updateCampaignDeliverable(item.id, { status: 'Published', publishedAt: new Date() }); await loadExecution(selectedCampaign.id); }}>
                              Publish
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={async () => { await deleteCampaignDeliverable(item.id); await loadExecution(selectedCampaign.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <ColorBadge status={item.status} map={{ Pending: 'bg-yellow-50 text-yellow-700 border-yellow-200', 'In Progress': 'bg-blue-50 text-blue-700 border-blue-200', Published: 'bg-green-50 text-green-700 border-green-200', Cancelled: 'bg-red-50 text-red-700 border-red-200' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Assignments */}
            <TabsContent value="assignments">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add Assignment</p>
                    <Select value={assignmentForm.contactId} onValueChange={(v) => setAssignmentForm((p) => ({ ...p, contactId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
                      <SelectContent>{contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={assignmentForm.role} onValueChange={(v: ContactRoleType) => setAssignmentForm((p) => ({ ...p, role: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Influencer">Influencer</SelectItem>
                        <SelectItem value="Vendor">Vendor</SelectItem>
                        <SelectItem value="Partner">Partner</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" placeholder="Agreed rate" value={assignmentForm.agreedRate} onChange={(e) => setAssignmentForm((p) => ({ ...p, agreedRate: e.target.value }))} />
                    <Button size="sm" className="w-full" onClick={async () => {
                      if (!assignmentForm.contactId) return;
                      await createCampaignAssignment(selectedCampaign.id, {
                        contactId: assignmentForm.contactId,
                        role: assignmentForm.role,
                        agreedRate: assignmentForm.agreedRate ? Number(assignmentForm.agreedRate) : undefined,
                        status: 'Confirmed',
                      });
                      setAssignmentForm({ contactId: '', role: 'Influencer', agreedRate: '' });
                      await loadExecution(selectedCampaign.id);
                    }}>
                      <Plus className="me-1.5 h-3.5 w-3.5" /> Assign
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {assignments.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No assignments yet.</p>}
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
                              Done
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={async () => { await deleteCampaignAssignment(item.id); await loadExecution(selectedCampaign.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <ColorBadge status={item.status} map={{ Confirmed: 'bg-green-50 text-green-700 border-green-200', Pending: 'bg-yellow-50 text-yellow-700 border-yellow-200', Completed: 'bg-blue-50 text-blue-700 border-blue-200', Cancelled: 'bg-red-50 text-red-700 border-red-200' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Expenses */}
            <TabsContent value="expenses">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add Expense</p>
                    <Input placeholder="Description" value={expenseForm.description} onChange={(e) => setExpenseForm((p) => ({ ...p, description: e.target.value }))} />
                    <Input type="number" placeholder="Amount" value={expenseForm.amount} onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))} />
                    <Input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm((p) => ({ ...p, expenseDate: e.target.value }))} />
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={expenseForm.billable} className="rounded" onChange={(e) => setExpenseForm((p) => ({ ...p, billable: e.target.checked }))} />
                      <span className="text-muted-foreground">Billable to client</span>
                    </label>
                    <Button size="sm" className="w-full" onClick={async () => {
                      if (!expenseForm.description.trim()) return;
                      await createCampaignExpense(selectedCampaign.id, {
                        description: expenseForm.description.trim(),
                        amount: Number(expenseForm.amount || 0),
                        expenseDate: expenseForm.expenseDate ? new Date(expenseForm.expenseDate) : undefined,
                        billable: expenseForm.billable,
                        status: 'Submitted',
                      });
                      setExpenseForm({ description: '', amount: '', expenseDate: '', billable: false });
                      await loadExecution(selectedCampaign.id);
                    }}>
                      <Plus className="me-1.5 h-3.5 w-3.5" /> Add Expense
                    </Button>
                  </div>
                  {expenses.length > 0 && (
                    <div className="rounded-lg border bg-primary/5 p-3 text-sm">
                      <span className="text-muted-foreground">Total expenses: </span>
                      <span className="font-semibold">{amount(expenses.reduce((s, e) => s + e.amount, 0))}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {expenses.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No expenses yet.</p>}
                  {expenses.map((item) => (
                    <div key={item.id} className="rounded-lg border bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{item.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {amount(item.amount)}{item.billable ? ' · billable' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.status !== 'Approved' && (
                            <Button size="sm" variant="outline" className="h-6 text-xs"
                              onClick={async () => { await updateCampaignExpense(item.id, { status: 'Approved' }); await loadExecution(selectedCampaign.id); }}>
                              Approve
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={async () => { await deleteCampaignExpense(item.id); await loadExecution(selectedCampaign.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <ColorBadge status={item.status} map={{ Submitted: 'bg-yellow-50 text-yellow-700 border-yellow-200', Approved: 'bg-green-50 text-green-700 border-green-200', Rejected: 'bg-red-50 text-red-700 border-red-200' }} />
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
              <Megaphone className="h-5 w-5 text-primary" /> New Campaign
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Campaign Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Ramadan 2025 Campaign" value={campaignForm.name} onChange={(e) => setCampaignForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Client / Contact</Label>
                <Select value={campaignForm.contactId} onValueChange={(v) => setCampaignForm((p) => ({ ...p, contactId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Opportunity</Label>
                <Select value={campaignForm.opportunityId} onValueChange={(v) => setCampaignForm((p) => ({ ...p, opportunityId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{opportunities.map((o) => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={campaignForm.startDate} onChange={(e) => setCampaignForm((p) => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={campaignForm.endDate} onChange={(e) => setCampaignForm((p) => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Budget</Label>
              <Input type="number" placeholder="0.00" value={campaignForm.budget} onChange={(e) => setCampaignForm((p) => ({ ...p, budget: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitCampaign} disabled={submitting || !campaignForm.name.trim()}>
              {submitting ? 'Creating…' : 'Create Campaign'}
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
    catch (error: any) { toast({ variant: 'destructive', title: 'Could not load requests', description: error?.message }); }
  }, [selectedCompany, toast]);

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
      toast({ title: 'Request submitted' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to submit request', description: error?.message });
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
    <SectionPageShell title="Vendor Requests" description="Request influencers, vendors, and production support.">
      <SectionEmptyState title="Choose a company" description="Requests are company-specific." />
    </SectionPageShell>
  );

  const pending = requests.filter((r) => ['New', 'Under Review'].includes(r.status)).length;
  const approved = requests.filter((r) => r.status === 'Approved').length;
  const rejected = requests.filter((r) => r.status === 'Rejected').length;

  return (
    <SectionPageShell title="Vendor Requests" description="Track influencer and vendor sourcing requests, approvals, and estimated costs.">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={AlertCircle} label="Pending Review" value={pending} color={pending > 0 ? 'text-yellow-600' : 'text-foreground'} />
        <StatCard icon={CheckCircle2} label="Approved" value={approved} color="text-green-600" />
        <StatCard icon={XCircle} label="Rejected" value={rejected} color="text-red-600" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{requests.length} request{requests.length !== 1 ? 's' : ''}</p>
        <Button onClick={() => setDialogOpen(true)} data-tutorial="vendor-requests-create">
          <Plus className="me-2 h-4 w-4" /> New Request
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="">
              <TableHead>Request</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Platform / Handle</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Est. Cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                    {item.role}{item.requestedByName ? ` · by ${item.requestedByName}` : ''}
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
                <TableCell><ColorBadge status={item.status} map={vendorStatusColor} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {['New', 'Under Review'].includes(item.status) && (
                      <>
                        <Button size="sm" className="h-7 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
                          onClick={async () => { await updateVendorRequestStatus(item.id, 'Approved'); await load(); }}>
                          <CheckCircle2 className="h-3 w-3" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => { setRejectDialogItem(item); setRejectNote(''); }}>
                          <XCircle className="h-3 w-3" /> Reject
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
                No vendor requests yet.
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
              <UserRoundSearch className="h-5 w-5 text-primary" /> New Vendor Request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input placeholder="Person or company name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v: 'Influencer' | 'Vendor') => setForm((p) => ({ ...p, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Influencer">Influencer</SelectItem>
                    <SelectItem value="Vendor">Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Platform</Label>
                <Input placeholder="Instagram, TikTok…" value={form.platform} onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Handle</Label>
                <Input placeholder="@username" value={form.handle} onChange={(e) => setForm((p) => ({ ...p, handle: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type / Category</Label>
                <Input placeholder="e.g. Lifestyle, Production" value={form.requestType} onChange={(e) => setForm((p) => ({ ...p, requestType: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Estimated Cost</Label>
                <Input type="number" placeholder="0.00" value={form.cost} onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Details / Justification</Label>
              <Textarea placeholder="Why is this vendor/influencer needed?" value={form.details} onChange={(e) => setForm((p) => ({ ...p, details: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || !form.name.trim()}>
              {submitting ? 'Submitting…' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject with reason dialog */}
      <Dialog open={!!rejectDialogItem} onOpenChange={(v) => { if (!v) { setRejectDialogItem(null); setRejectNote(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" /> Reject Request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Rejecting request for <span className="font-medium text-foreground">{rejectDialogItem?.name}</span>.
            </p>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea placeholder="Explain why this request is being rejected…" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogItem(null); setRejectNote(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject}>Confirm Rejection</Button>
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
