'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import {
  approveCommission,
  contributionRoles,
  createCommissionRule,
  deleteCommissionRule,
  getCommissionRules,
  getCommissions,
  payCommission,
  recomputeCommissions,
  type Commission,
  type CommissionRule,
  type ContributionRole,
} from '@/services/crmService';
import { getUsersByCompany } from '@/services/userService';
import { updateUser } from '@/services/userService';
import type { User } from '@/modules/users/types';
import {
  BadgeDollarSign,
  CheckCircle2,
  Loader2,
  Pencil,
  PlusCircle,
  RefreshCw,
  Trash2,
  TrendingUp,
} from 'lucide-react';

type CommissionBasis = 'Revenue' | 'Paid Amount' | 'Profit';
type CommissionRateType = 'Percent' | 'Fixed';

const COMMISSION_BASES: CommissionBasis[] = ['Revenue', 'Paid Amount', 'Profit'];
const RATE_TYPES: CommissionRateType[] = ['Percent', 'Fixed'];

const STATUS_STYLES: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Approved: 'bg-blue-100 text-blue-700 border-blue-200',
  Paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Voided: 'bg-red-100 text-red-700 border-red-200',
};

export function CommissionsPageV2() {
  const { selectedCompany } = useCompany();
  const { t } = useI18n();
  const { amount } = useCompanyCurrency();
  const { toast } = useToast();
  const [commissions, setCommissions] = React.useState<Commission[]>([]);
  const [rules, setRules] = React.useState<CommissionRule[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setCommissions([]);
      setRules([]);
      setUsers([]);
      return;
    }
    setLoading(true);
    try {
      const [c, r, u] = await Promise.allSettled([
        getCommissions(selectedCompany.id),
        getCommissionRules(selectedCompany.id),
        getUsersByCompany(selectedCompany.id),
      ]);
      if (c.status === 'fulfilled') setCommissions(c.value);
      if (r.status === 'fulfilled') setRules(r.value);
      if (u.status === 'fulfilled') setUsers(u.value);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (!selectedCompany) {
    return (
      <SectionPageShell title="Commissions" description={t('commissions.subtitle')}>
        <SectionEmptyState
          title={t('commissions.chooseCompany')}
          description={t('commissions.companyScoped')}
        />
      </SectionPageShell>
    );
  }

  const draftTotal = commissions.filter((c) => c.status === 'Draft').reduce((s, c) => s + c.amount, 0);
  const approvedTotal = commissions.filter((c) => c.status === 'Approved').reduce((s, c) => s + c.amount, 0);
  const paidTotal = commissions.filter((c) => c.status === 'Paid').reduce((s, c) => s + c.amount, 0);
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <SectionPageShell title={t('commissions.title')} description={t('commissions.subtitle')}>
      <Tabs defaultValue="earnings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="earnings">{t('commissions.tabEarnings')}</TabsTrigger>
          <TabsTrigger value="rules">{t('commissions.tabRules')}</TabsTrigger>
          <TabsTrigger value="eligibility">{t('commissions.tabEligibility')}</TabsTrigger>
        </TabsList>

        {/* Earnings tab */}
        <TabsContent value="earnings" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard icon={<BadgeDollarSign className="h-4 w-4 text-slate-600" />}
              label={t('commissions.draftTotal')} value={amount(draftTotal)}
              sub={`${commissions.filter((c) => c.status === 'Draft').length} ${t('commissions.entries')}`} />
            <SummaryCard icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
              label={t('commissions.approvedTotal')} value={amount(approvedTotal)}
              sub={`${commissions.filter((c) => c.status === 'Approved').length} ${t('commissions.entries')}`} />
            <SummaryCard icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
              label={t('commissions.paidTotal')} value={amount(paidTotal)}
              sub={`${commissions.filter((c) => c.status === 'Paid').length} ${t('commissions.entries')}`} />
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const res = await recomputeCommissions(selectedCompany.id);
                  toast({
                    title: t('commissions.recomputedToast'),
                    description: `${res.recomputed} ${t('commissions.entries')}`,
                  });
                  await load();
                } catch (error: any) {
                  toast({
                    variant: 'destructive',
                    title: t('common.error'),
                    description: error?.message,
                  });
                }
              }}
            >
              <RefreshCw className="me-2 h-3.5 w-3.5" />
              {t('commissions.recomputeAll')}
            </Button>
          </div>

          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('commissions.colSource')}</TableHead>
                  <TableHead>{t('commissions.colUser')}</TableHead>
                  <TableHead>{t('commissions.colRole')}</TableHead>
                  <TableHead>{t('commissions.colBasis')}</TableHead>
                  <TableHead className="text-right">{t('commissions.colAmount')}</TableHead>
                  <TableHead>{t('commissions.colStatus')}</TableHead>
                  <TableHead className="text-right">{t('commissions.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                )}
                {!loading && commissions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                      {t('commissions.empty')}
                    </TableCell>
                  </TableRow>
                )}
                {!loading && commissions.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-sm">
                      {c.sourceLabel || c.serviceType}
                    </TableCell>
                    <TableCell className="text-sm">{c.userName || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.role || '—'}
                      {c.weightPercent != null && c.weightPercent !== 100 && (
                        <span className="ms-1 text-[10px] opacity-60">({c.weightPercent}%)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{c.basis}</div>
                      <div className="opacity-60">{amount(c.basisAmount)}</div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">{amount(c.amount)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLES[c.status]}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {c.status === 'Draft' && (
                          <Button
                            size="sm" variant="outline" className="h-7 gap-1 text-xs"
                            onClick={async () => {
                              try {
                                await approveCommission(c.id);
                                await load();
                                toast({ title: t('commissions.approvedToast') });
                              } catch (error: any) {
                                toast({
                                  variant: 'destructive',
                                  title: t('common.error'),
                                  description: error?.message,
                                });
                              }
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3" /> {t('commissions.approve')}
                          </Button>
                        )}
                        {c.status === 'Approved' && (
                          <Button
                            size="sm" className="h-7 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={async () => {
                              try {
                                await payCommission(c.id);
                                await load();
                                toast({ title: t('commissions.paidToast') });
                              } catch (error: any) {
                                toast({
                                  variant: 'destructive',
                                  title: t('common.error'),
                                  description: error?.message,
                                });
                              }
                            }}
                          >
                            <BadgeDollarSign className="h-3 w-3" /> {t('commissions.markPaid')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Rules tab */}
        <TabsContent value="rules" className="space-y-4">
          <RulesTab
            companyId={selectedCompany.id}
            rules={rules}
            users={users}
            onChanged={load}
          />
        </TabsContent>

        {/* Eligibility tab */}
        <TabsContent value="eligibility" className="space-y-4">
          <EligibilityTab
            companyId={selectedCompany.id}
            users={users}
            onChanged={load}
          />
        </TabsContent>
      </Tabs>
    </SectionPageShell>
  );
}

function SummaryCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
      <div className="rounded-lg p-2 bg-muted/40">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-0.5">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Rules tab ──────────────────────────────────────────────────────────────

function RulesTab({
  companyId,
  rules,
  users,
  onChanged,
}: {
  companyId: string;
  rules: CommissionRule[];
  users: User[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CommissionRule | null>(null);
  const [form, setForm] = React.useState({
    userId: '',
    role: '',
    serviceType: '',
    basis: 'Revenue' as CommissionBasis,
    rateType: 'Percent' as CommissionRateType,
    rate: '5',
    fixedAmount: '',
    priority: '0',
    isActive: true,
    notes: '',
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      userId: '',
      role: '',
      serviceType: '',
      basis: 'Revenue',
      rateType: 'Percent',
      rate: '5',
      fixedAmount: '',
      priority: '0',
      isActive: true,
      notes: '',
    });
    setOpen(true);
  };

  const openEdit = (rule: CommissionRule) => {
    setEditing(rule);
    setForm({
      userId: rule.userId || '',
      role: rule.role || '',
      serviceType: rule.serviceType || '',
      basis: rule.basis,
      rateType: rule.rateType,
      rate: String(rule.rate ?? 0),
      fixedAmount: rule.fixedAmount != null ? String(rule.fixedAmount) : '',
      priority: String(rule.priority ?? 0),
      isActive: rule.isActive,
      notes: rule.notes || '',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      const input = {
        userId: form.userId || undefined,
        role: (form.role || undefined) as ContributionRole | undefined,
        serviceType: form.serviceType.trim() || undefined,
        basis: form.basis,
        rateType: form.rateType,
        rate: Number(form.rate) || 0,
        fixedAmount: form.fixedAmount ? Number(form.fixedAmount) : undefined,
        priority: Number(form.priority) || 0,
        isActive: form.isActive,
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        const { updateCommissionRule } = await import('@/services/crmService');
        await updateCommissionRule(editing.id, input);
      } else {
        await createCommissionRule(companyId, input);
      }
      setOpen(false);
      onChanged();
      toast({ title: editing ? t('commissions.ruleUpdated') : t('commissions.ruleCreated') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: error?.message,
      });
    }
  };

  const handleDelete = async (rule: CommissionRule) => {
    if (!window.confirm(t('commissions.ruleDeleteConfirm'))) return;
    try {
      await deleteCommissionRule(rule.id);
      onChanged();
      toast({ title: t('commissions.ruleDeleted') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: error?.message,
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{t('commissions.rulesTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{t('commissions.rulesDescription')}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              <PlusCircle className="me-2 h-4 w-4" />
              {t('commissions.newRule')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editing ? t('commissions.editRule') : t('commissions.newRule')}
              </DialogTitle>
              <DialogDescription>{t('commissions.ruleFormDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('commissions.ruleUser')}</Label>
                  <Select value={form.userId || 'any'} onValueChange={(v) => setForm((p) => ({ ...p, userId: v === 'any' ? '' : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t('commissions.anyUser')}</SelectItem>
                      {users.filter((u) => u.commissionEligible).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('commissions.ruleRole')}</Label>
                  <Select value={form.role || 'any'} onValueChange={(v) => setForm((p) => ({ ...p, role: v === 'any' ? '' : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t('commissions.anyRole')}</SelectItem>
                      {contributionRoles.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('commissions.ruleServiceType')}</Label>
                <Input
                  value={form.serviceType}
                  onChange={(e) => setForm((p) => ({ ...p, serviceType: e.target.value }))}
                  placeholder={t('commissions.ruleServicePlaceholder')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('commissions.ruleBasis')}</Label>
                  <Select value={form.basis} onValueChange={(v) => setForm((p) => ({ ...p, basis: v as CommissionBasis }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMMISSION_BASES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('commissions.ruleRateType')}</Label>
                  <Select value={form.rateType} onValueChange={(v) => setForm((p) => ({ ...p, rateType: v as CommissionRateType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RATE_TYPES.map((rt) => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>
                    {form.rateType === 'Percent' ? t('commissions.ruleRatePct') : t('commissions.ruleFixed')}
                  </Label>
                  {form.rateType === 'Percent' ? (
                    <Input
                      type="number" step="0.1"
                      value={form.rate}
                      onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
                    />
                  ) : (
                    <Input
                      type="number" step="0.01"
                      value={form.fixedAmount}
                      onChange={(e) => setForm((p) => ({ ...p, fixedAmount: e.target.value }))}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>{t('commissions.rulePriority')}</Label>
                  <Input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('commissions.ruleNotes')}</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder={t('commissions.ruleNotesPlaceholder')}
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
                />
                <Label className="cursor-pointer" onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}>
                  {t('commissions.ruleActive')}
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleSave}>{t('common.save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <SectionEmptyState
            title={t('commissions.noRulesTitle')}
            description={t('commissions.noRulesDescription')}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('commissions.ruleUser')}</TableHead>
                <TableHead>{t('commissions.ruleRole')}</TableHead>
                <TableHead>{t('commissions.ruleServiceType')}</TableHead>
                <TableHead>{t('commissions.ruleBasis')}</TableHead>
                <TableHead>{t('commissions.ruleRate')}</TableHead>
                <TableHead>{t('commissions.rulePriority')}</TableHead>
                <TableHead>{t('commissions.ruleActive')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => {
                const u = r.userId ? users.find((x) => x.id === r.userId) : undefined;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{u?.name ?? <span className="text-muted-foreground italic">{t('commissions.anyUser')}</span>}</TableCell>
                    <TableCell className="text-sm">{r.role ?? <span className="text-muted-foreground italic">{t('commissions.anyRole')}</span>}</TableCell>
                    <TableCell className="text-sm">{r.serviceType ?? <span className="text-muted-foreground italic">{t('commissions.anyService')}</span>}</TableCell>
                    <TableCell className="text-sm">{r.basis}</TableCell>
                    <TableCell className="text-sm">
                      {r.rateType === 'Percent' ? `${r.rate}%` : `${r.fixedAmount ?? r.rate} flat`}
                    </TableCell>
                    <TableCell className="text-sm">{r.priority}</TableCell>
                    <TableCell>
                      {r.isActive ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          {t('commissions.active')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 text-slate-600">
                          {t('commissions.inactive')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Eligibility tab ────────────────────────────────────────────────────────

function EligibilityTab({
  companyId,
  users,
  onChanged,
}: {
  companyId: string;
  users: User[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [pending, setPending] = React.useState<string | null>(null);
  // local override for instant feedback before the parent reloads
  const [local, setLocal] = React.useState<Record<string, Partial<User>>>({});

  const handleToggle = async (user: User, next: boolean) => {
    setPending(user.id);
    setLocal((prev) => ({ ...prev, [user.id]: { ...prev[user.id], commissionEligible: next } }));
    try {
      await updateUser(user.id, { commissionEligible: next });
      onChanged();
    } catch (error: any) {
      setLocal((prev) => {
        const copy = { ...prev };
        delete copy[user.id];
        return copy;
      });
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: error?.message,
      });
    } finally {
      setPending(null);
    }
  };

  const handleRateChange = async (user: User, value: string) => {
    const rate = value === '' ? undefined : Number(value);
    setPending(user.id);
    setLocal((prev) => ({ ...prev, [user.id]: { ...prev[user.id], defaultCommissionRate: rate } }));
    try {
      await updateUser(user.id, { defaultCommissionRate: rate });
      onChanged();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: error?.message,
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('commissions.eligibilityTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">{t('commissions.eligibilityDescription')}</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('commissions.userName')}</TableHead>
              <TableHead>{t('commissions.userEmail')}</TableHead>
              <TableHead>{t('commissions.userRole')}</TableHead>
              <TableHead>{t('commissions.eligible')}</TableHead>
              <TableHead>{t('commissions.defaultRate')}</TableHead>
              <TableHead className="text-right">{pending && <Loader2 className="h-3 w-3 animate-spin ms-auto" />}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const overlay = local[u.id] || {};
              const eligible = overlay.commissionEligible ?? u.commissionEligible ?? false;
              const rate = overlay.defaultCommissionRate ?? u.defaultCommissionRate;
              return (
                <TableRow key={u.id}>
                  <TableCell className="text-sm font-medium">{u.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-sm">{u.role}</TableCell>
                  <TableCell>
                    <Switch
                      checked={eligible}
                      onCheckedChange={(v) => handleToggle(u, v)}
                      disabled={pending === u.id}
                    />
                  </TableCell>
                  <TableCell className="w-32">
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="—"
                      defaultValue={rate ?? ''}
                      onBlur={(e) => {
                        if (e.target.value !== String(rate ?? '')) {
                          handleRateChange(u, e.target.value);
                        }
                      }}
                      disabled={!eligible || pending === u.id}
                      className="text-end"
                    />
                  </TableCell>
                  <TableCell />
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
