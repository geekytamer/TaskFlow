'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/context/company-context';
import { useCompanyCurrency } from '@/lib/currency';
import { useI18n } from '@/context/i18n-context';
import {
  adminService,
  startImpersonation,
  type AdminCompanyRow,
  type AdminHealth,
  type AdminOverview,
  type AdminUserRow,
  type AdminActivityRow,
} from '@/services/adminService';
import { getStoredToken } from '@/lib/api-client';
import { createCompany, deleteCompany, getCompanyById } from '@/services/companyService';
import { getUserById, deleteUser } from '@/services/userService';
import type { User } from '@/lib/types';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AddUserSheet } from '@/modules/users/components/add-user-sheet';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { PlusCircle } from 'lucide-react';
import { EditCompanyDialog } from '@/modules/companies/components/edit-company-dialog';
import { CompanyMark } from '@/modules/companies/components/company-mark';
import type { Company } from '@/modules/companies/types';
import {
  Activity,
  BadgeDollarSign,
  Building,
  Cloud,
  Database,
  Download,
  Gauge,
  Inbox,
  ListChecks,
  LogIn,
  MessageSquare,
  Pencil,
  PlayCircle,
  RefreshCw,
  Server,
  Trash2,
  Users as UsersIcon,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';

// Entity types that can appear in the activity log (matches the backend union).
const ADMIN_ENTITY_TYPES = [
  'contact', 'opportunity', 'proposal', 'campaign', 'campaign_deliverable',
  'campaign_assignment', 'campaign_expense', 'vendor_request', 'commission',
  'client', 'project', 'task', 'supplier', 'inventory_item', 'purchase_order',
  'sales_order', 'delivery', 'invoice', 'vendor_bill', 'whatsapp_message',
] as const;

function formatBytes(b: number) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

function formatUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function formatRelative(iso?: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function AdminPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { amount } = useCompanyCurrency();
  const { setSelectedCompany, companies } = useCompany();

  const [overview, setOverview] = React.useState<AdminOverview | null>(null);
  const [adminCompanies, setAdminCompanies] = React.useState<AdminCompanyRow[]>([]);
  const [users, setUsers] = React.useState<AdminUserRow[]>([]);
  const [activity, setActivity] = React.useState<AdminActivityRow[]>([]);
  const [activityTotal, setActivityTotal] = React.useState(0);
  const [activityFilter, setActivityFilter] = React.useState<{ companyId?: string; entityType?: string }>({});
  const [health, setHealth] = React.useState<AdminHealth | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState('overview');
  const [createUserOpen, setCreateUserOpen] = React.useState(false);
  const [createCompanyOpen, setCreateCompanyOpen] = React.useState(false);
  const [companyForm, setCompanyForm] = React.useState({ name: '', website: '', address: '' });
  const [savingCompany, setSavingCompany] = React.useState(false);
  const [companyToDelete, setCompanyToDelete] = React.useState<AdminCompanyRow | null>(null);
  const [companyToEdit, setCompanyToEdit] = React.useState<Company | null>(null);
  const [loadingCompanyEdit, setLoadingCompanyEdit] = React.useState<string | null>(null);
  const [cascadeDelete, setCascadeDelete] = React.useState(false);
  const [deletingCompany, setDeletingCompany] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<User | null>(null);
  const [loadingUserEdit, setLoadingUserEdit] = React.useState<string | null>(null);
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    const [o, c, u, h, a] = await Promise.allSettled([
      adminService.overview(),
      adminService.companies(),
      adminService.users(),
      adminService.health(),
      adminService.activity({ limit: '200' }),
    ]);
    if (o.status === 'fulfilled') setOverview(o.value);
    if (c.status === 'fulfilled') setAdminCompanies(c.value);
    if (u.status === 'fulfilled') setUsers(u.value);
    if (h.status === 'fulfilled') setHealth(h.value);
    if (a.status === 'fulfilled') {
      setActivity(a.value.rows);
      setActivityTotal(a.value.total);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const reloadActivity = React.useCallback(async () => {
    const a = await adminService.activity({ limit: '200', ...activityFilter });
    setActivity(a.rows);
    setActivityTotal(a.total);
  }, [activityFilter]);

  React.useEffect(() => { if (!loading) reloadActivity(); }, [reloadActivity, loading]);

  const handleHopIntoCompany = (companyId: string) => {
    const target = companies.find((c) => c.id === companyId);
    if (target) {
      setSelectedCompany(target);
      window.location.href = '/';
    }
  };

  const runTool = async (label: string, fn: () => Promise<{ [k: string]: number }>) => {
    try {
      const res = await fn();
      const count = Object.values(res)[0];
      toast({ title: label, description: `${count}` });
      load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Tool failed', description: e?.message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('admin.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('admin.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`me-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('admin.refresh')}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t('admin.tabOverview')}</TabsTrigger>
          <TabsTrigger value="companies">{t('admin.tabCompanies')}</TabsTrigger>
          <TabsTrigger value="users">{t('admin.tabUsers')}</TabsTrigger>
          <TabsTrigger value="activity">{t('admin.tabActivity')}</TabsTrigger>
          <TabsTrigger value="health">{t('admin.tabHealth')}</TabsTrigger>
          <TabsTrigger value="tools">{t('admin.tabTools')}</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-4 pt-4">
          {loading || !overview ? (
            <div className="grid gap-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi icon={<Building />} label={t('admin.kpiCompanies')} value={String(overview.companies)} href="#" onClick={() => setTab('companies')} />
                <Kpi icon={<UsersIcon />} label={t('admin.kpiUsers')} value={String(overview.users)} href="#" onClick={() => setTab('users')} />
                <Kpi icon={<Inbox />} label={t('admin.kpiOpenReceivables')} value={amount(overview.openReceivables)} />
                <Kpi icon={<Inbox />} label={t('admin.kpiOpenPayables')} value={amount(overview.openPayables)} />
                <Kpi icon={<BadgeDollarSign />} label={t('admin.kpiRevenueMtd')} value={amount(overview.revenueMtd)} />
                <Kpi icon={<BadgeDollarSign />} label={t('admin.kpiRevenueYtd')} value={amount(overview.revenueYtd)} />
                <Kpi icon={<MessageSquare />} label={t('admin.kpiWhatsapp')} value={`${overview.whatsappActive}/${overview.whatsappInstances}`} sub={t('admin.kpiWhatsappSub')} />
                <Kpi icon={<ListChecks />} label={t('admin.kpiFollowups')} value={String(overview.followupsOpen)} sub={`${overview.followupsOverdue} ${t('admin.kpiOverdue')}`} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Kpi icon={<BadgeDollarSign />} label={t('admin.kpiCommDraft')} value={amount(overview.commissionsDraft)} />
                <Kpi icon={<BadgeDollarSign />} label={t('admin.kpiCommApproved')} value={amount(overview.commissionsApproved)} />
                <Kpi icon={<BadgeDollarSign />} label={t('admin.kpiCommPaid')} value={amount(overview.commissionsPaid)} />
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm">{t('admin.usersByRole')}</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {overview.usersByRole.map((r) => (
                      <Badge key={r.role} variant="outline">{r.role}: {r.c}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Companies ── */}
        <TabsContent value="companies" className="space-y-3 pt-4">
          <div className="flex justify-end">
            <Dialog open={createCompanyOpen} onOpenChange={setCreateCompanyOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="me-1.5 h-3.5 w-3.5" />
                  {t('admin.newCompany')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('admin.newCompany')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1">
                    <Label>{t('admin.companyName')}</Label>
                    <Input
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('admin.companyWebsite')}</Label>
                    <Input
                      value={companyForm.website}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, website: e.target.value }))}
                      placeholder="https://"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('admin.companyAddress')}</Label>
                    <Input
                      value={companyForm.address}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateCompanyOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    disabled={!companyForm.name.trim() || savingCompany}
                    onClick={async () => {
                      setSavingCompany(true);
                      try {
                        await createCompany({
                          name: companyForm.name.trim(),
                          website: companyForm.website.trim() || undefined,
                          address: companyForm.address.trim() || undefined,
                        });
                        setCreateCompanyOpen(false);
                        setCompanyForm({ name: '', website: '', address: '' });
                        await load();
                        toast({ title: t('admin.companyCreated') });
                      } catch (e: any) {
                        toast({ variant: 'destructive', title: t('common.error'), description: e?.message });
                      } finally {
                        setSavingCompany(false);
                      }
                    }}
                  >
                    {savingCompany ? '...' : t('common.save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.colCompany')}</TableHead>
                  <TableHead className="text-end">{t('admin.colUsers')}</TableHead>
                  <TableHead className="text-end">{t('admin.colContacts')}</TableHead>
                  <TableHead className="text-end">{t('admin.colInvoices')}</TableHead>
                  <TableHead className="text-end">{t('admin.colRevenue')}</TableHead>
                  <TableHead className="text-end">{t('admin.colTasks')}</TableHead>
                  <TableHead>{t('admin.colWhatsapp')}</TableHead>
                  <TableHead>{t('admin.colLastActivity')}</TableHead>
                  <TableHead className="text-end">{t('admin.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminCompanies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <CompanyMark company={companies.find((company) => company.id === c.id) || { name: c.name }} />
                        {c.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-end">{c.userCount}</TableCell>
                    <TableCell className="text-end">{c.contactCount}</TableCell>
                    <TableCell className="text-end">{c.invoiceCount}</TableCell>
                    <TableCell className="text-end">{amount(c.revenue)}</TableCell>
                    <TableCell className="text-end">{c.taskCount}</TableCell>
                    <TableCell>{c.whatsappLinked
                      ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{t('admin.linked')}</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>
                    }</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatRelative(c.lastActivityAt)}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleHopIntoCompany(c.id)}>
                          <LogIn className="me-1 h-3.5 w-3.5" />
                          {t('admin.hopIn')}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={loadingCompanyEdit === c.id}
                          onClick={async () => {
                            setLoadingCompanyEdit(c.id);
                            try {
                              const company = await getCompanyById(c.id);
                              if (company) setCompanyToEdit(company);
                            } finally {
                              setLoadingCompanyEdit(null);
                            }
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Edit company</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => { setCompanyToDelete(c); setCascadeDelete(false); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Users ── */}
        <TabsContent value="users" className="space-y-3 pt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCreateUserOpen(true)}>
              <PlusCircle className="me-1.5 h-3.5 w-3.5" />
              {t('admin.newUser')}
            </Button>
          </div>
          <AddUserSheet
            open={createUserOpen}
            onOpenChange={setCreateUserOpen}
            onUserAdded={load}
            currentUserRole="Admin"
          />
          {editingUser && (
            <AddUserSheet
              open={!!editingUser}
              onOpenChange={(isOpen) => { if (!isOpen) setEditingUser(null); }}
              onUserAdded={() => { setEditingUser(null); load(); }}
              userToEdit={editingUser}
              currentUserRole="Admin"
            />
          )}
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.colName')}</TableHead>
                  <TableHead>{t('admin.colEmail')}</TableHead>
                  <TableHead>{t('admin.colRole')}</TableHead>
                  <TableHead className="text-end">{t('admin.colCompaniesCount')}</TableHead>
                  <TableHead>{t('admin.colCommissionEligible')}</TableHead>
                  <TableHead>{t('admin.colLastActivity')}</TableHead>
                  <TableHead className="text-end">{t('admin.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                    <TableCell className="text-end">{u.companyIds.length}</TableCell>
                    <TableCell>{u.commissionEligible
                      ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{t('admin.yes')}</Badge>
                      : <span className="text-xs text-muted-foreground">{t('admin.no')}</span>
                    }</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatRelative(u.lastActivityAt)}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (!window.confirm(t('admin.impersonateConfirm').replace('{name}', u.name))) return;
                            try {
                              const token = await adminService.impersonate(u.id);
                              const original = getStoredToken();
                              if (original) startImpersonation(token, original);
                            } catch (e: any) {
                              toast({ variant: 'destructive', title: t('common.error'), description: e?.message });
                            }
                          }}
                        >
                          <LogIn className="me-1 h-3.5 w-3.5" />
                          {t('admin.impersonate')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          disabled={loadingUserEdit === u.id}
                          title={t('admin.editUser')}
                          onClick={async () => {
                            setLoadingUserEdit(u.id);
                            try {
                              const full = await getUserById(u.id);
                              if (full) setEditingUser(full);
                              else toast({ variant: 'destructive', title: t('common.error') });
                            } catch (e: any) {
                              toast({ variant: 'destructive', title: t('common.error'), description: e?.message });
                            } finally {
                              setLoadingUserEdit(null);
                            }
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          title={t('admin.deleteUser')}
                          onClick={async () => {
                            if (!(await confirm({
                              title: t('admin.deleteUserTitle'),
                              description: t('admin.deleteUserDesc').replace('{name}', u.name),
                              confirmText: t('common.delete'),
                              cancelText: t('common.cancel'),
                              destructive: true,
                            }))) return;
                            try {
                              await deleteUser(u.id);
                              toast({ title: t('admin.deleteUserDone').replace('{name}', u.name) });
                              await load();
                            } catch (e: any) {
                              toast({ variant: 'destructive', title: t('admin.deleteUserFailed'), description: e?.message });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Activity ── */}
        <TabsContent value="activity" className="space-y-3 pt-4">
          <div className="flex flex-wrap gap-2">
            <div className="w-56">
              <Combobox
                options={adminCompanies.map((c) => ({ value: c.id, label: c.name }))}
                value={activityFilter.companyId ?? ''}
                onValueChange={(v) => setActivityFilter((f) => ({ ...f, companyId: v || undefined }))}
                placeholder={t('admin.activityFilterCompany')}
                searchPlaceholder={t('admin.activityFilterCompany')}
                clearLabel={t('admin.activityAllCompanies')}
              />
            </div>
            <Select
              value={activityFilter.entityType ?? '__all__'}
              onValueChange={(v) => setActivityFilter((f) => ({ ...f, entityType: v === '__all__' ? undefined : v }))}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t('admin.activityFilterEntity')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('admin.activityAllEntities')}</SelectItem>
                {ADMIN_ENTITY_TYPES.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => reloadActivity()}>
              <Activity className="me-1 h-3.5 w-3.5" />{t('admin.activityApply')}
            </Button>
            <span className="ms-auto text-xs text-muted-foreground self-center">
              {t('admin.activityShowing').replace('{shown}', String(activity.length)).replace('{total}', String(activityTotal))}
            </span>
          </div>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.colWhen')}</TableHead>
                  <TableHead>{t('admin.colActor')}</TableHead>
                  <TableHead>{t('admin.colEntity')}</TableHead>
                  <TableHead>{t('admin.colAction')}</TableHead>
                  <TableHead>{t('admin.colSummary')}</TableHead>
                  <TableHead>{t('admin.colCompanyId')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatRelative(r.createdAt)}</TableCell>
                    <TableCell className="text-sm">{r.actorName ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.entityType}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.action}</TableCell>
                    <TableCell className="text-sm">{r.summary}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground font-mono">{r.companyId.slice(0, 8)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Health ── */}
        <TabsContent value="health" className="space-y-3 pt-4">
          {!health ? <Skeleton className="h-40" /> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi icon={<Server />} label={t('admin.healthUptime')} value={formatUptime(health.uptimeSeconds)} />
                <Kpi icon={<Cloud />} label={t('admin.healthNode')} value={health.nodeVersion} />
                <Kpi icon={<Gauge />} label={t('admin.healthVersion')} value={health.version} />
                <Kpi icon={<Database />} label={t('admin.healthDbSize')} value={formatBytes(health.dbSizeBytes)} />
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm">{t('admin.healthRowCounts')}</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 text-sm">
                    {health.rowCounts.map((r) => (
                      <div key={r.table} className="flex justify-between border-b py-1">
                        <span className="text-muted-foreground font-mono text-xs">{r.table}</span>
                        <span className="font-semibold">{r.rows.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">{t('admin.healthMigrations')}</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {health.migrationsApplied.map((m) => (
                      <Badge key={m} variant="outline" className="text-[10px] font-mono">{m}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Tools ── */}
        <TabsContent value="tools" className="space-y-3 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('admin.toolsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToolButton
                icon={<ListChecks />}
                title={t('admin.toolSweepOverdue')}
                description={t('admin.toolSweepOverdueDesc')}
                onClick={() => runTool(t('admin.toolSweepOverdue'), adminService.sweepOverdueAll)}
              />
              <ToolButton
                icon={<BadgeDollarSign />}
                title={t('admin.toolRecomputeCommissions')}
                description={t('admin.toolRecomputeCommissionsDesc')}
                onClick={() => runTool(t('admin.toolRecomputeCommissions'), adminService.recomputeCommissionsAll)}
              />
              <ToolButton
                icon={<RefreshCw />}
                title={t('admin.toolRefreshInvoices')}
                description={t('admin.toolRefreshInvoicesDesc')}
                onClick={() => runTool(t('admin.toolRefreshInvoices'), adminService.refreshInvoiceStatuses)}
              />
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <Database className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t('admin.toolBackup')}</div>
                  <div className="text-xs text-muted-foreground">{t('admin.toolBackupDesc')}</div>
                </div>
                <a
                  href={`${API_BASE}/admin/tools/backup`}
                  onClick={(e) => {
                    e.preventDefault();
                    fetch(`${API_BASE}/admin/tools/backup`, {
                      headers: { Authorization: `Bearer ${getStoredToken()}` },
                    })
                      .then((res) => res.blob())
                      .then((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `taskflow-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      })
                      .catch((err) => toast({ variant: 'destructive', title: t('common.error'), description: err?.message }));
                  }}
                >
                  <Button size="sm" variant="outline">
                    <Download className="me-1 h-3.5 w-3.5" />
                    {t('admin.toolBackupDownload')}
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete company confirmation (super-admin only) with optional cascade */}
      <EditCompanyDialog
        company={companyToEdit}
        open={!!companyToEdit}
        onOpenChange={(open) => { if (!open) setCompanyToEdit(null); }}
        onSaved={async (company) => {
          setCompanyToEdit(null);
          await load();
          const selected = companies.find((item) => item.id === company.id);
          if (selected) setSelectedCompany(company);
        }}
      />

      {/* Delete company confirmation (super-admin only) with optional cascade */}
      <AlertDialog open={!!companyToDelete} onOpenChange={(open) => { if (!open) setCompanyToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.deleteCompanyTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.deleteCompanyDesc').replace('{name}', companyToDelete?.name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 rounded"
              checked={cascadeDelete}
              onChange={(e) => setCascadeDelete(e.target.checked)}
            />
            <span>
              <span className="font-medium text-amber-900">{t('admin.deleteCompanyCascadeLabel')}</span>
              <span className="block text-xs text-amber-800">{t('admin.deleteCompanyCascadeHint')}</span>
            </span>
          </label>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setCompanyToDelete(null)} disabled={deletingCompany}>
              {t('common.cancel')}
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingCompany}
              onClick={async () => {
                if (!companyToDelete) return;
                setDeletingCompany(true);
                try {
                  await deleteCompany(companyToDelete.id, { cascade: cascadeDelete });
                  toast({
                    title: t('admin.deleteCompanyDoneTitle'),
                    description: t('admin.deleteCompanyDoneDesc').replace('{name}', companyToDelete.name),
                  });
                  setCompanyToDelete(null);
                  await load();
                } catch (error: any) {
                  toast({ variant: 'destructive', title: t('admin.deleteCompanyFailed'), description: error?.message });
                } finally {
                  setDeletingCompany(false);
                }
              }}
            >
              {deletingCompany ? '…' : (cascadeDelete ? t('admin.deleteCompanyConfirmCascade') : t('admin.deleteCompanyConfirm'))}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kpi({
  icon, label, value, sub, href, onClick,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string;
  href?: string; onClick?: () => void;
}) {
  const inner = (
    <Card className={onClick ? 'cursor-pointer hover:border-primary/40 transition' : ''}>
      <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <span className="text-muted-foreground/70">{icon}</span>{label}
      </CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
  if (onClick) return <div onClick={onClick}>{inner}</div>;
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function ToolButton({
  icon, title, description, onClick,
}: {
  icon: React.ReactNode; title: string; description: string; onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Button size="sm" variant="outline" onClick={onClick}>
        <PlayCircle className="me-1 h-3.5 w-3.5" />
        Run
      </Button>
    </div>
  );
}
