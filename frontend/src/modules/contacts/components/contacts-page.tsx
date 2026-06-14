'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { CsvImportExport } from '@/components/ui/csv-import-export';
import { CustomFieldsForm } from '@/components/ui/custom-fields-form';
import { getCustomFieldDefinitions, type CustomFieldDefinition } from '@/services/customFieldService';
import {
  createContact,
  getContacts,
  updateContact,
  deleteContact,
  influencerPlatforms,
  type Contact,
  type ContactRoleType,
  type InfluencerAccount,
} from '@/services/contactService';

const makeId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
import {
  patchContactCrm,
  getContactActivities,
  leadStatuses,
  leadSources,
  contactPriorities,
  type LeadStatus,
  type LeadSource,
  type ContactPriority,
  type CrmActivity,
} from '@/services/crmService';
import { getUsersByCompany } from '@/services/userService';
import type { User as UserType } from '@/modules/users/types';
import { LogActivityDialog } from '@/modules/crm/components/log-activity-dialog';
import { ActivityFeed } from '@/modules/crm/components/activity-feed';
import { Building2, User, Plus, Search, MoreHorizontal, Pencil, Trash2, Phone, CalendarClock, Lock, Globe, Eye } from 'lucide-react';
import Link from 'next/link';

const ALL_ROLES: ContactRoleType[] = ['Lead', 'Client', 'Vendor', 'Influencer', 'Partner'];

const ROLE_COLORS: Record<ContactRoleType, string> = {
  Lead: 'bg-yellow-100 text-yellow-800',
  Client: 'bg-blue-100 text-blue-800',
  Vendor: 'bg-purple-100 text-purple-800',
  Influencer: 'bg-pink-100 text-pink-800',
  Partner: 'bg-green-100 text-green-800',
};

const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  New: 'bg-sky-100 text-sky-700',
  Qualified: 'bg-indigo-100 text-indigo-700',
  'Follow-up': 'bg-orange-100 text-orange-700',
  Proposal: 'bg-yellow-100 text-yellow-700',
  Won: 'bg-green-100 text-green-700',
  Lost: 'bg-red-100 text-red-700',
  Archived: 'bg-gray-100 text-gray-500',
};

const PRIORITY_COLORS: Record<ContactPriority, string> = {
  High: 'text-red-600',
  Medium: 'text-orange-500',
  Low: 'text-slate-400',
};

type ContactForm = {
  kind: 'Organization' | 'Person';
  name: string;
  legalName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  taxNumber: string;
  notes: string;
  roles: ContactRoleType[];
};

const emptyForm = (): ContactForm => ({
  kind: 'Organization', name: '', legalName: '', contactPerson: '',
  email: '', phone: '', address: '', taxNumber: '', notes: '', roles: [],
});

const contactToForm = (c: Contact): ContactForm => ({
  kind: c.kind,
  name: c.name,
  legalName: c.legalName ?? '',
  contactPerson: c.contactPerson ?? '',
  email: c.email ?? '',
  phone: c.phone ?? '',
  address: c.address ?? '',
  taxNumber: c.taxNumber ?? '',
  notes: c.notes ?? '',
  roles: (c.roles as ContactRoleType[]) ?? [],
});

function ContactFormFields({ form, setForm }: { form: ContactForm; setForm: React.Dispatch<React.SetStateAction<ContactForm>> }) {
  const { t } = useI18n();
  const toggleRole = (role: ContactRoleType) =>
    setForm(f => ({ ...f, roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role] }));
  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t('contacts.kind')}</Label>
          <Select value={form.kind} onValueChange={(v: 'Organization' | 'Person') => setForm(f => ({ ...f, kind: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Organization">{t('contacts.kindOrg')}</SelectItem>
              <SelectItem value="Person">{t('contacts.kindPerson')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t('contacts.name')} *</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t('contacts.legalName')}</Label>
          <Input value={form.legalName} onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))} />
        </div>
        <div>
          <Label>{t('contacts.contactPerson')}</Label>
          <Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t('contacts.email')}</Label>
          <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <Label>{t('contacts.phone')}</Label>
          <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t('contacts.address')}</Label>
          <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div>
          <Label>{t('contacts.taxNumber')}</Label>
          <Input value={form.taxNumber} onChange={e => setForm(f => ({ ...f, taxNumber: e.target.value }))} />
        </div>
      </div>
      <div>
        <Label>{t('contacts.roles')}</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {ALL_ROLES.map(role => (
            <button key={role} type="button" onClick={() => toggleRole(role)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                form.roles.includes(role)
                  ? ROLE_COLORS[role] + ' border-transparent'
                  : 'bg-transparent border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              {t(`contacts.role${role}`)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>{t('contacts.notes')}</Label>
        <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
      </div>
    </div>
  );
}

export function ContactsPage() {
  const { selectedCompany } = useCompany();
  const { t } = useI18n();
  const { toast } = useToast();
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<ContactRoleType | 'All'>('All');

  // Create / Edit / Delete
  const [openCreate, setOpenCreate] = React.useState(false);
  const [createForm, setCreateForm] = React.useState<ContactForm>(emptyForm());
  const [customFieldDefs, setCustomFieldDefs] = React.useState<CustomFieldDefinition[]>([]);
  const [createCustomValues, setCreateCustomValues] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);
  const [editingContact, setEditingContact] = React.useState<Contact | null>(null);
  const [editForm, setEditForm] = React.useState<ContactForm>(emptyForm());
  const [deletingContact, setDeletingContact] = React.useState<Contact | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [companyUsers, setCompanyUsers] = React.useState<UserType[]>([]);

  React.useEffect(() => {
    if (!selectedCompany) return;
    getUsersByCompany(selectedCompany.id).then(setCompanyUsers).catch(() => {});
  }, [selectedCompany]);

  // CRM panel (side sheet)
  const [crmContact, setCrmContact] = React.useState<Contact | null>(null);
  const [crmActivities, setCrmActivities] = React.useState<CrmActivity[]>([]);
  const [crmLoading, setCrmLoading] = React.useState(false);
  const [logActivityOpen, setLogActivityOpen] = React.useState(false);
  const [crmForm, setCrmForm] = React.useState({
    leadStatus: '', leadSource: '', priority: '', ownerUserId: '', nextFollowupDate: '', nextFollowupNote: '',
    // influencer fields
    influencerPlatform: '', influencerHandle: '', influencerNiche: '',
    followerCount: '', engagementRate: '', rateCardAmount: '', location: '', availabilityStatus: '',
    visibility: 'Public' as 'Public' | 'Private',
  });
  const [accounts, setAccounts] = React.useState<InfluencerAccount[]>([]);
  const addAccount = () => setAccounts(prev => [...prev, { id: makeId(), platform: 'Instagram' }]);
  const updateAccount = (id: string, patch: Partial<InfluencerAccount>) =>
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  const removeAccount = (id: string) => setAccounts(prev => prev.filter(a => a.id !== id));

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedCompany) { setContacts([]); setLoading(false); return; }
      setLoading(true);
      try {
        const data = await getContacts(selectedCompany.id);
        if (!cancelled) setContacts(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedCompany]);

  const reloadContacts = React.useCallback(async () => {
    if (!selectedCompany) return;
    setContacts(await getContacts(selectedCompany.id));
  }, [selectedCompany]);

  React.useEffect(() => {
    if (!selectedCompany) { setCustomFieldDefs([]); return; }
    let cancelled = false;
    getCustomFieldDefinitions(selectedCompany.id, 'contact')
      .then((defs) => { if (!cancelled) setCustomFieldDefs(defs); })
      .catch(() => { if (!cancelled) setCustomFieldDefs([]); });
    return () => { cancelled = true; };
  }, [selectedCompany]);

  const openCrmPanel = async (c: Contact) => {
    setCrmContact(c);
    setCrmForm({
      leadStatus: c.leadStatus ?? '',
      leadSource: c.leadSource ?? '',
      priority: c.priority ?? '',
      nextFollowupDate: c.nextFollowupDate ? c.nextFollowupDate.toISOString().split('T')[0] : '',
      nextFollowupNote: c.nextFollowupNote ?? '',
      ownerUserId: c.ownerUserId ?? '',
      visibility: c.visibility ?? 'Public',
      influencerPlatform: c.influencerPlatform ?? '',
      influencerHandle: c.influencerHandle ?? '',
      influencerNiche: c.influencerNiche ?? '',
      followerCount: c.followerCount?.toString() ?? '',
      engagementRate: c.engagementRate?.toString() ?? '',
      rateCardAmount: c.rateCardAmount?.toString() ?? '',
      location: c.location ?? '',
      availabilityStatus: c.availabilityStatus ?? '',
    });
    setAccounts(c.influencerAccounts ?? []);
    setCrmLoading(true);
    try {
      const activities = await getContactActivities(c.id, 30);
      setCrmActivities(activities);
    } finally {
      setCrmLoading(false);
    }
  };

  const saveCrm = async () => {
    if (!crmContact) return;
    setSaving(true);
    try {
      const isInfluencer = (crmContact.roles as ContactRoleType[])?.includes('Influencer');
      // Save CRM overlay fields
      await patchContactCrm(crmContact.id, {
        leadStatus: (crmForm.leadStatus || undefined) as LeadStatus | undefined,
        leadSource: (crmForm.leadSource || undefined) as LeadSource | undefined,
        priority: (crmForm.priority || undefined) as ContactPriority | undefined,
        ownerUserId: crmForm.ownerUserId || undefined,
        ownerName: crmForm.ownerUserId
          ? (companyUsers.find(u => u.id === crmForm.ownerUserId)?.name ?? undefined)
          : undefined,
        nextFollowupDate: crmForm.nextFollowupDate ? new Date(crmForm.nextFollowupDate) : undefined,
        nextFollowupNote: crmForm.nextFollowupNote || undefined,
        visibility: crmForm.visibility,
      });
      // Save influencer profile fields via full update
      const influencerUpdate = isInfluencer ? {
        influencerPlatform: crmForm.influencerPlatform || undefined,
        influencerHandle: crmForm.influencerHandle || undefined,
        influencerNiche: crmForm.influencerNiche || undefined,
        followerCount: crmForm.followerCount ? Number(crmForm.followerCount) : undefined,
        engagementRate: crmForm.engagementRate ? Number(crmForm.engagementRate) : undefined,
        rateCardAmount: crmForm.rateCardAmount ? Number(crmForm.rateCardAmount) : undefined,
        location: crmForm.location || undefined,
        availabilityStatus: crmForm.availabilityStatus || undefined,
        influencerAccounts: accounts,
      } : {};
      const updated = await updateContact(crmContact.id, influencerUpdate);
      setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      setCrmContact(updated);
      toast({ title: t('contacts.updated') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filtered = React.useMemo(() => {
    let result = contacts;
    if (roleFilter !== 'All') result = result.filter(c => (c.roles as ContactRoleType[])?.includes(roleFilter as ContactRoleType));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.contactPerson?.toLowerCase().includes(q));
    }
    return result;
  }, [contacts, roleFilter, search]);

  const roleCounts = React.useMemo(() => {
    const counts: Record<string, number> = { All: contacts.length };
    ALL_ROLES.forEach(r => { counts[r] = contacts.filter(c => (c.roles as ContactRoleType[])?.includes(r)).length; });
    return counts;
  }, [contacts]);

  const handleCreate = async () => {
    if (!selectedCompany || !createForm.name.trim()) return;
    setSaving(true);
    try {
      const contact = await createContact({
        companyId: selectedCompany.id,
        kind: createForm.kind,
        name: createForm.name.trim(),
        legalName: createForm.legalName.trim() || undefined,
        contactPerson: createForm.contactPerson.trim() || undefined,
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        address: createForm.address.trim() || undefined,
        taxNumber: createForm.taxNumber.trim() || undefined,
        notes: createForm.notes.trim() || undefined,
        roles: createForm.roles.length > 0 ? createForm.roles : undefined,
        customFields: Object.keys(createCustomValues).length > 0 ? createCustomValues : undefined,
      });
      setContacts(prev => [...prev, contact].sort((a, b) => a.name.localeCompare(b.name)));
      setOpenCreate(false);
      setCreateForm(emptyForm());
      setCreateCustomValues({});
      toast({ title: t('contacts.created') });
    } catch (error: any) {
      toast({ title: error?.message || t('common.error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingContact || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const updated = await updateContact(editingContact.id, {
        kind: editForm.kind,
        name: editForm.name.trim(),
        legalName: editForm.legalName.trim() || undefined,
        contactPerson: editForm.contactPerson.trim() || undefined,
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        address: editForm.address.trim() || undefined,
        taxNumber: editForm.taxNumber.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      });
      setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      setEditingContact(null);
      toast({ title: t('contacts.updated') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingContact) return;
    setDeleting(true);
    try {
      await deleteContact(deletingContact.id);
      setContacts(prev => prev.filter(c => c.id !== deletingContact.id));
      setDeletingContact(null);
      toast({ title: t('contacts.deleted') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SectionPageShell
      title={t('nav.contacts')}
      description={t('contacts.subtitle')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
        {selectedCompany ? (
          <CsvImportExport
            exportPath={`/companies/${selectedCompany.id}/contacts/export`}
            exportFilename="contacts.csv"
            importPath={`/companies/${selectedCompany.id}/contacts/import`}
            onImported={reloadContacts}
          />
        ) : null}
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button size="sm" data-tutorial="contacts-create"><Plus className="h-4 w-4 me-1" />{t('contacts.create')}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{t('contacts.createTitle')}</DialogTitle></DialogHeader>
            <ContactFormFields form={createForm} setForm={setCreateForm} />
            {customFieldDefs.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <CustomFieldsForm
                  definitions={customFieldDefs}
                  values={createCustomValues}
                  onChange={setCreateCustomValues}
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleCreate} disabled={saving || !createForm.name.trim()}>{t('common.save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      }
    >
      {/* Search + role filter */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm" data-tutorial="contacts-search">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={t('contacts.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['All', ...ALL_ROLES] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                roleFilter === r
                  ? 'bg-primary text-primary-foreground border-transparent'
                  : 'bg-transparent border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              {r === 'All' ? t('contacts.allContacts') : t(`contacts.role${r}`)} ({roleCounts[r] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <SectionEmptyState title={t('contacts.emptyTitle')} description={t('contacts.emptyDescription')} />
      ) : (
        <Table data-tutorial="contacts-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t('contacts.name')}</TableHead>
              <TableHead>{t('contacts.contactPerson')}</TableHead>
              <TableHead>{t('contacts.email')}</TableHead>
              <TableHead>{t('crm.leadStatus')}</TableHead>
              <TableHead>{t('crm.nextFollowup')}</TableHead>
              <TableHead>{t('contacts.roles')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(c => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openCrmPanel(c)}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {c.kind === 'Organization' ? <Building2 className="h-4 w-4 text-muted-foreground shrink-0" /> : <User className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span>{c.name}</span>
                    {c.visibility === 'Private' && <Lock className="h-3 w-3 text-red-400 shrink-0" />}
                    {(c as any).priority && (
                      <span className={`text-xs font-bold ${PRIORITY_COLORS[(c as any).priority as ContactPriority]}`}>
                        {(c as any).priority === 'High' ? '↑' : (c as any).priority === 'Low' ? '↓' : '–'}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{c.contactPerson ?? '—'}</TableCell>
                <TableCell>{c.email ?? '—'}</TableCell>
                <TableCell>
                  {(c as any).leadStatus ? (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEAD_STATUS_COLORS[(c as any).leadStatus as LeadStatus]}`}>
                      {t(`crm.status${(c as any).leadStatus.replace('-', '')}`)}
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell>
                  {(c as any).nextFollowupDate ? (
                    <div className="flex items-center gap-1 text-xs text-amber-700">
                      <CalendarClock className="h-3 w-3" />
                      {new Date((c as any).nextFollowupDate).toLocaleDateString()}
                    </div>
                  ) : '—'}
                  {c.ownerName && <div className="text-xs text-muted-foreground mt-0.5">{c.ownerName}</div>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {((c.roles ?? []) as ContactRoleType[]).map(r => (
                      <span key={r} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[r]}`}>
                        {t(`contacts.role${r}`)}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/contacts/${c.id}`} className="flex items-center">
                          <Eye className="h-4 w-4 me-2" />{t('contact360.openDetail')}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditingContact(c); setEditForm(contactToForm(c)); }}>
                        <Pencil className="h-4 w-4 me-2" />{t('common.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeletingContact(c)}>
                        <Trash2 className="h-4 w-4 me-2" />{t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editingContact} onOpenChange={open => { if (!open) setEditingContact(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t('contacts.editTitle')}</DialogTitle></DialogHeader>
          <ContactFormFields form={editForm} setForm={setEditForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContact(null)}>{t('common.cancel')}</Button>
            <Button onClick={handleUpdate} disabled={saving || !editForm.name.trim()}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deletingContact} onOpenChange={open => { if (!open) setDeletingContact(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('contacts.deleteTitle')}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('contacts.deleteDescription').replace('{name}', deletingContact?.name ?? '')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingContact(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{t('common.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CRM Side Panel */}
      <Sheet open={!!crmContact} onOpenChange={open => { if (!open) setCrmContact(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {crmContact && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  {crmContact.kind === 'Organization' ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
                  {crmContact.name}
                </SheetTitle>
                <div className="flex flex-wrap gap-1 mt-1">
                  {((crmContact.roles ?? []) as ContactRoleType[]).map(r => (
                    <span key={r} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[r]}`}>
                      {t(`contacts.role${r}`)}
                    </span>
                  ))}
                </div>
              </SheetHeader>

              {/* CRM fields */}
              <div className="border rounded-lg p-4 mb-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('crm.crmPanel')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div data-tutorial="crm-lead-status">
                    <Label className="text-xs">{t('crm.leadStatus')}</Label>
                    <Select value={crmForm.leadStatus || '__none__'} onValueChange={v => setCrmForm(f => ({ ...f, leadStatus: v === '__none__' ? '' : v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {leadStatuses.map(s => <SelectItem key={s} value={s}>{t(`crm.status${s.replace('-', '')}`)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{t('crm.priority')}</Label>
                    <Select value={crmForm.priority || '__none__'} onValueChange={v => setCrmForm(f => ({ ...f, priority: v === '__none__' ? '' : v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {contactPriorities.map(p => <SelectItem key={p} value={p}>{t(`crm.priority${p}`)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div data-tutorial="crm-source">
                    <Label className="text-xs">{t('crm.leadSource')}</Label>
                    <Select value={crmForm.leadSource || '__none__'} onValueChange={v => setCrmForm(f => ({ ...f, leadSource: v === '__none__' ? '' : v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {leadSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div data-tutorial="crm-owner">
                    <Label className="text-xs">{t('crm.owner')}</Label>
                    <Select value={crmForm.ownerUserId || '__none__'} onValueChange={v => setCrmForm(f => ({ ...f, ownerUserId: v === '__none__' ? '' : v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {companyUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div data-tutorial="crm-followup">
                    <Label className="text-xs">{t('crm.nextFollowup')}</Label>
                    <Input type="date" className="h-8 text-sm" value={crmForm.nextFollowupDate}
                      onChange={e => setCrmForm(f => ({ ...f, nextFollowupDate: e.target.value }))} />
                  </div>
                  <div className="col-span-2" data-tutorial="crm-visibility">
                    <Label className="text-xs">{t('crm.visibility')}</Label>
                    <div className="flex gap-2 mt-1">
                      {(['Public', 'Private'] as const).map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setCrmForm(f => ({ ...f, visibility: v }))}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                            crmForm.visibility === v
                              ? v === 'Private'
                                ? 'bg-red-100 text-red-700 border-red-300'
                                : 'bg-green-100 text-green-700 border-green-300'
                              : 'bg-transparent border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
                          }`}
                        >
                          {v === 'Private' ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                          {t(`crm.visibility${v}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t('crm.followupNote')}</Label>
                  <Input className="h-8 text-sm" value={crmForm.nextFollowupNote}
                    onChange={e => setCrmForm(f => ({ ...f, nextFollowupNote: e.target.value }))}
                    placeholder={t('crm.nextActionPlaceholder')} />
                </div>
              </div>

              {/* Influencer profile section */}
              {((crmContact.roles ?? []) as ContactRoleType[]).includes('Influencer') && (
                <div className="border rounded-lg p-4 mb-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('crm.influencerProfile')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{t('crm.platform')}</Label>
                      <Select value={crmForm.influencerPlatform || '__none__'} onValueChange={v => setCrmForm(f => ({ ...f, influencerPlatform: v === '__none__' ? '' : v }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Snapchat', 'Twitter/X', 'Other'].map(p => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">{t('crm.handle')}</Label>
                      <Input className="h-8 text-sm" value={crmForm.influencerHandle}
                        onChange={e => setCrmForm(f => ({ ...f, influencerHandle: e.target.value }))}
                        placeholder="@username" />
                    </div>
                    <div>
                      <Label className="text-xs">{t('crm.niche')}</Label>
                      <Input className="h-8 text-sm" value={crmForm.influencerNiche}
                        onChange={e => setCrmForm(f => ({ ...f, influencerNiche: e.target.value }))}
                        placeholder="Beauty, Tech, Lifestyle…" />
                    </div>
                    <div>
                      <Label className="text-xs">{t('crm.availability')}</Label>
                      <Select value={crmForm.availabilityStatus || '__none__'} onValueChange={v => setCrmForm(f => ({ ...f, availabilityStatus: v === '__none__' ? '' : v }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {['Available', 'Partially Available', 'Unavailable'].map(a => (
                            <SelectItem key={a} value={a}>{a}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">{t('crm.followerCount')}</Label>
                      <Input type="number" className="h-8 text-sm" value={crmForm.followerCount}
                        onChange={e => setCrmForm(f => ({ ...f, followerCount: e.target.value }))}
                        placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs">{t('crm.engagementRate')} (%)</Label>
                      <Input type="number" step="0.1" className="h-8 text-sm" value={crmForm.engagementRate}
                        onChange={e => setCrmForm(f => ({ ...f, engagementRate: e.target.value }))}
                        placeholder="0.0" />
                    </div>
                    <div>
                      <Label className="text-xs">{t('crm.rateCard')}</Label>
                      <Input type="number" className="h-8 text-sm" value={crmForm.rateCardAmount}
                        onChange={e => setCrmForm(f => ({ ...f, rateCardAmount: e.target.value }))}
                        placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs">{t('crm.location')}</Label>
                      <Input className="h-8 text-sm" value={crmForm.location}
                        onChange={e => setCrmForm(f => ({ ...f, location: e.target.value }))}
                        placeholder="City, Country" />
                    </div>
                  </div>

                  {/* Per-platform social accounts */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('crm.accountsTitle')}</p>
                      <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addAccount}>
                        <Plus className="h-3 w-3" /> {t('crm.addAccount')}
                      </Button>
                    </div>
                    {accounts.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t('crm.noAccounts')}</p>
                    )}
                    {accounts.map((acc) => (
                      <div key={acc.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px] text-muted-foreground">{t('crm.platform')}</Label>
                            <Select value={acc.platform} onValueChange={(v) => updateAccount(acc.id, { platform: v as InfluencerAccount['platform'] })}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {influencerPlatforms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">{t('crm.handle')}</Label>
                            <Input className="h-8 text-sm" value={acc.handle ?? ''} placeholder="@username"
                              onChange={(e) => updateAccount(acc.id, { handle: e.target.value })} />
                          </div>
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">{t('crm.accountUrl')}</Label>
                          <Input className="h-8 text-sm" value={acc.url ?? ''} placeholder="https://…"
                            onChange={(e) => updateAccount(acc.id, { url: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px] text-muted-foreground">{t('crm.followers')}</Label>
                            <Input type="number" className="h-8 text-sm" value={acc.followers ?? ''} placeholder="0"
                              onChange={(e) => updateAccount(acc.id, { followers: e.target.value ? Number(e.target.value) : undefined })} />
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">{t('crm.avgViews')}</Label>
                            <Input type="number" className="h-8 text-sm" value={acc.avgViews ?? ''} placeholder="0"
                              onChange={(e) => updateAccount(acc.id, { avgViews: e.target.value ? Number(e.target.value) : undefined })} />
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">{t('crm.engagementRate')} (%)</Label>
                            <Input type="number" step="0.1" className="h-8 text-sm" value={acc.engagementRate ?? ''} placeholder="0.0"
                              onChange={(e) => updateAccount(acc.id, { engagementRate: e.target.value ? Number(e.target.value) : undefined })} />
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">{t('crm.estimatedAvg')}</Label>
                            <Input type="number" className="h-8 text-sm" value={acc.estimatedAvg ?? ''} placeholder="0"
                              onChange={(e) => updateAccount(acc.id, { estimatedAvg: e.target.value ? Number(e.target.value) : undefined })} />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                            onClick={() => removeAccount(acc.id)}>
                            <Trash2 className="h-3 w-3" /> {t('common.delete')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border rounded-lg p-4 mb-4 space-y-3">
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" data-tutorial="crm-log-activity"
                    onClick={() => { setLogActivityOpen(true); }}>
                    <Phone className="h-3 w-3" />{t('crm.logActivity')}
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={saveCrm} disabled={saving}>
                    {t('common.save')}
                  </Button>
                </div>
              </div>

              {/* Activity feed */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {t('crm.logActivityTitle')}
                </p>
                <ActivityFeed activities={crmActivities} loading={crmLoading} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <LogActivityDialog
        open={logActivityOpen}
        onOpenChange={setLogActivityOpen}
        contactId={crmContact?.id ?? ''}
        contactName={crmContact?.name}
        onLogged={async () => {
          if (crmContact) {
            const activities = await getContactActivities(crmContact.id, 30);
            setCrmActivities(activities);
          }
        }}
      />
    </SectionPageShell>
  );
}
