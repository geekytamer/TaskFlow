'use client';

/**
 * Platform admin → Groups (super admin): create and rename holding groups,
 * attach and detach companies (a company is in at most one group; detaching
 * ends group-wide access there at once), and appoint group administrators
 * from the people of the group's companies. Group-wide people and templates
 * are managed on the Group page (/settings/group for group admins; the same
 * screen at /admin/groups for the super admin, who never enters the company app).
 */
import * as React from 'react';
import { ArrowLeft, Loader2, Pencil, PlusCircle, Settings2, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import type { AdminCompanyRow, AdminUserRow } from '@/services/adminService';
import {
  attachHoldingCompany,
  createHoldingGroup,
  detachHoldingCompany,
  getHoldingGroup,
  listHoldingGroups,
  renameHoldingGroup,
  setHoldingAdmins,
  type HoldingGroup,
  type HoldingGroupDetail,
} from '@/services/authzService';
import {
  Chip,
  EmptyState,
  ErrorState,
  InlineError,
  errorText,
  forgetHoldingGroups,
  roleLabel,
  useTr,
  GroupBaseProvider,
} from '@/modules/authz/components/shared';
import { adminCandidates, companyChoices, searchCandidates } from '../lib/holding-groups';
import { GroupDetail } from '@/modules/authz/components/group-page';

type NameTarget = { mode: 'new' } | { mode: 'rename'; group: HoldingGroup };

export function HoldingGroupsTab({ companies, users, loading: rowsLoading }: {
  companies: AdminCompanyRow[];
  users: AdminUserRow[];
  loading: boolean;
}) {
  const { tr, lang } = useTr();
  const [groups, setGroups] = React.useState<HoldingGroup[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [naming, setNaming] = React.useState<NameTarget | null>(null);

  /**
   * The open group lives in ?group=, so a template page (and a bookmark) comes
   * back to the group itself rather than to the list.
   */
  const openGroup = React.useCallback((id: string | null) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'groups');
    if (id) url.searchParams.set('group', id);
    else url.searchParams.delete('group');
    window.history.replaceState(null, '', url.toString());
  }, []);

  React.useEffect(() => {
    if (openId || !groups?.length) return;
    const wanted = new URLSearchParams(window.location.search).get('group');
    if (wanted && groups.some((g) => g.id === wanted)) setOpenId(wanted);
  }, [groups, openId]);

  // Loads again after the panel's Refresh (rowsLoading true → false) and after each change here.
  React.useEffect(() => {
    if (rowsLoading) return;
    let active = true;
    setError(null);
    listHoldingGroups()
      .then((g) => { if (active) setGroups(g); })
      .catch((e: unknown) => { if (active) setError(errorText(e, tr('Could not load the groups.', 'تعذّر تحميل المجموعات.'))); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, rowsLoading]);

  const refresh = React.useCallback(() => {
    forgetHoldingGroups();
    setNonce((n) => n + 1);
  }, []);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const listSep = lang === 'ar' ? '، ' : ', ';
  const open = openId ? groups?.find((g) => g.id === openId) ?? null : null;

  const nameDialog = (
    <GroupNameDialog
      target={naming}
      onClose={() => setNaming(null)}
      onSaved={(group, mode) => {
        setNaming(null);
        refresh();
        if (mode === 'new') openGroup(group.id);
      }}
    />
  );

  if (open && groups) {
    return (
      <>
        <GroupManage
          key={open.id}
          group={open}
          groups={groups}
          companies={companies}
          users={users}
          onBack={() => openGroup(null)}
          onRename={() => setNaming({ mode: 'rename', group: open })}
          onChanged={refresh}
        />
        {nameDialog}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-prose text-sm text-muted-foreground">
          {tr(
            'A holding group joins companies under group administrators. People given a group-wide role reach every company of the group.',
            'تجمع المجموعة القابضة عدة شركات تحت مسؤولين للمجموعة. من يُمنح دورًا على مستوى المجموعة يصل إلى كل شركاتها.',
          )}
        </p>
        <Button size="sm" className="self-start" onClick={() => setNaming({ mode: 'new' })}>
          <PlusCircle className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {tr('New group', 'مجموعة جديدة')}
        </Button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />
      ) : !groups ? (
        <div className="space-y-2" aria-busy="true" aria-label={tr('Loading', 'جارٍ التحميل')}>
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState title={tr('No groups yet', 'لا توجد مجموعات بعد')}>
          {tr(
            'Create a group, add its companies, then appoint its administrators.',
            'أنشئ مجموعة وأضف شركاتها، ثم عيّن مسؤوليها.',
          )}
        </EmptyState>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Group', 'المجموعة')}</TableHead>
                <TableHead className="text-end">{tr('Companies', 'الشركات')}</TableHead>
                <TableHead className="hidden sm:table-cell">{tr('Administrators', 'المسؤولون')}</TableHead>
                <TableHead className="text-end">{tr('Actions', 'الإجراءات')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">
                    <div className="min-w-0">
                      <div className="break-words">{roleLabel(g, lang)}</div>
                      {lang === 'en' && g.nameAr && <div className="text-left text-xs font-normal text-muted-foreground" dir="rtl">{g.nameAr}</div>}
                      <div className="text-xs font-normal text-muted-foreground sm:hidden">
                        {g.adminUserIds.length ? g.adminUserIds.map(userName).join(listSep) : tr('No administrators', 'بلا مسؤولين')}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{g.companyIds.length}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {g.adminUserIds.length ? g.adminUserIds.map(userName).join(listSep) : '—'}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => openGroup(g.id)} aria-label={tr(`Manage ${g.name}`, `إدارة ${roleLabel(g, lang)}`)}>
                        <Settings2 className="h-3.5 w-3.5 sm:me-1" aria-hidden="true" />
                        {/* Icon only on a phone, so the row fits without scrolling. */}
                        <span className="hidden sm:inline">{tr('Manage', 'إدارة')}</span>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setNaming({ mode: 'rename', group: g })}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">{tr(`Rename ${g.name}`, `إعادة تسمية ${roleLabel(g, lang)}`)}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {nameDialog}
    </div>
  );
}

function GroupManage({ group, groups, companies, users, onBack, onRename, onChanged }: {
  group: HoldingGroup;
  groups: HoldingGroup[];
  companies: AdminCompanyRow[];
  users: AdminUserRow[];
  onBack: () => void;
  onRename: () => void;
  onChanged: () => void;
}) {
  const { tr, lang } = useTr();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [detail, setDetail] = React.useState<HoldingGroupDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const [rowError, setRowError] = React.useState<{ id: string; message: string } | null>(null);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [addId, setAddId] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [adminQuery, setAdminQuery] = React.useState('');
  const [busyAdmin, setBusyAdmin] = React.useState<string | null>(null);
  const [adminError, setAdminError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setError(null);
    getHoldingGroup(group.id)
      .then((d) => { if (active) setDetail(d); })
      .catch((e: unknown) => { if (active) setError(errorText(e, tr('Could not load the group.', 'تعذّر تحميل المجموعة.'))); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, nonce]);

  const name = roleLabel(group, lang);

  const header = (
    <div className="space-y-3">
      <Button size="sm" variant="ghost" onClick={onBack} className="-ms-2 gap-1.5">
        <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
        {tr('All groups', 'كل المجموعات')}
      </Button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold tracking-tight">{name}</h2>
          {lang === 'en' && group.nameAr && <p className="text-left text-sm text-muted-foreground" dir="rtl">{group.nameAr}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onRename}>
            <Pencil className="me-1 h-3.5 w-3.5" aria-hidden="true" />
            {tr('Rename', 'إعادة تسمية')}
          </Button>
        </div>
      </div>
    </div>
  );

  if (error) return <div className="space-y-4">{header}<ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} /></div>;
  if (!detail) {
    return (
      <div className="space-y-4">
        {header}
        <div className="space-y-2" aria-busy="true" aria-label={tr('Loading', 'جارٍ التحميل')}>
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </div>
    );
  }

  const changed = (d: HoldingGroupDetail) => {
    // A later success clears an earlier inline refusal (K-1).
    setAddError(null);
    setRowError(null);
    setDetail(d);
    onChanged();
  };

  // The list may lag behind this group's own changes: use the detail for it.
  const choices = companyChoices(
    companies,
    groups.map((g) => (g.id === detail.id ? { ...g, companyIds: detail.companyIds } : g)),
    detail.id,
  );
  const free = choices.filter((c) => !c.inGroup);
  const candidates = adminCandidates(users, { companyIds: detail.companyIds, adminUserIds: detail.adminUserIds });
  const memberIds = new Set(candidates.filter((c) => c.member).map((c) => c.id));
  const matches = searchCandidates(candidates, adminQuery, detail.adminUserIds);

  const remove = async (company: { id: string; name: string | null }) => {
    const companyName = company.name ?? company.id;
    const ok = await confirm({
      title: tr(`Remove ${companyName} from ${name}?`, `إزالة ${companyName} من ${name}؟`),
      description: tr(
        `People who reach ${companyName} through this group lose access there.`,
        `من يصل إلى ${companyName} عبر هذه المجموعة يفقد الوصول إليها.`,
      ),
      confirmText: tr('Remove', 'إزالة'),
      cancelText: tr('Cancel', 'إلغاء'),
      destructive: true,
    });
    if (!ok) return;
    setRowError(null);
    setRemoving(company.id);
    try {
      changed(await detachHoldingCompany(detail.id, company.id));
      toast({ title: tr(`${companyName} removed from the group`, `أُزيلت ${companyName} من المجموعة`) });
    } catch (e) {
      setRowError({ id: company.id, message: errorText(e, tr('Could not remove the company.', 'تعذّرت إزالة الشركة.')) });
    } finally {
      setRemoving(null);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addId) {
      setAddError(tr('Choose a company to add.', 'اختر شركة لإضافتها.'));
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      changed(await attachHoldingCompany(detail.id, addId));
      setAddId('');
    } catch (err) {
      setAddError(errorText(err, tr('Could not add the company.', 'تعذّرت إضافة الشركة.')));
      // The company may have joined another group meanwhile: refresh the picker.
      setAddId('');
      onChanged();
    } finally {
      setAdding(false);
    }
  };

  // Appointing and removing apply at once, like adding and removing a company
  // above: one page, one way of working.
  const appoint = async (person: { id: string; name: string; email: string }) => {
    setBusyAdmin(person.id);
    setAdminError(null);
    try {
      changed(await setHoldingAdmins(detail.id, [...detail.adminUserIds, person.id]));
      setAdminQuery('');
      toast({ title: tr(`${person.name} administers ${name}`, `${person.name} يدير ${name}`) });
    } catch (err) {
      setAdminError(errorText(err, tr('Could not appoint them.', 'تعذّر تعيينه.')));
    } finally {
      setBusyAdmin(null);
    }
  };

  const stepDown = async (person: { id: string; name: string | null; email: string | null }) => {
    const who = person.name ?? person.email ?? person.id;
    const ok = await confirm({
      title: tr(`Remove ${who} as an administrator?`, `إزالة ${who} من مسؤولي المجموعة؟`),
      description: tr(
        'They keep whatever their own companies give them, and the group-wide roles they handed out stay.',
        'يبقى له ما تمنحه شركاته، وتبقى الأدوار التي منحها على مستوى المجموعة.',
      ),
      confirmText: tr('Remove', 'إزالة'),
      cancelText: tr('Cancel', 'إلغاء'),
      destructive: true,
    });
    if (!ok) return;
    setBusyAdmin(person.id);
    setAdminError(null);
    try {
      changed(await setHoldingAdmins(detail.id, detail.adminUserIds.filter((id) => id !== person.id)));
    } catch (err) {
      setAdminError(errorText(err, tr('Could not remove them.', 'تعذّرت إزالته.')));
    } finally {
      setBusyAdmin(null);
    }
  };

  return (
    <div className="space-y-8">
      {header}

      {/* Membership: what only the platform administrator decides. */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="admin-group-companies" className="space-y-3">
          <div>
            <h3 id="admin-group-companies" className="text-sm font-semibold text-muted-foreground">
              {tr('Companies', 'الشركات')} <span className="font-normal tabular-nums">({detail.companies.length})</span>
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {tr('A company belongs to one group only. Removing it ends group-wide access there at once.', 'لا تنتمي الشركة إلا لمجموعة واحدة. وإزالتها تنهي وصول المجموعة إليها فورًا.')}
            </p>
          </div>
          {detail.companies.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {tr('No companies in this group yet.', 'لا توجد شركات في هذه المجموعة بعد.')}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {detail.companies.map((c) => (
                <li key={c.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 break-words text-sm font-medium">{c.name ?? c.id}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={removing === c.id}
                      onClick={() => remove(c)}
                      aria-label={tr(`Remove ${c.name ?? c.id}`, `إزالة ${c.name ?? c.id}`)}
                    >
                      {removing === c.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span className="sr-only sm:not-sr-only sm:ms-1">{tr('Remove', 'إزالة')}</span>
                    </Button>
                  </div>
                  {rowError?.id === c.id && <InlineError message={rowError.message} className="mt-1" />}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
            <Label htmlFor="admin-group-add-company" className="sr-only">{tr('Add company', 'إضافة شركة')}</Label>
            <Select value={addId} onValueChange={(v) => { setAddId(v); setAddError(null); }} disabled={choices.length === 0}>
              <SelectTrigger id="admin-group-add-company" className="w-full">
                <SelectValue placeholder={free.length ? tr('Add a company…', 'إضافة شركة…') : tr('No company is free to add', 'لا توجد شركة متاحة للإضافة')} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((c) => (
                  <SelectItem key={c.id} value={c.id} disabled={Boolean(c.inGroup)}>
                    {c.name}
                    {c.inGroup && ` — ${tr('in', 'في')} ${roleLabel(c.inGroup, lang)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" variant="outline" className="h-10 shrink-0" disabled={adding || free.length === 0}>
              {adding ? <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <PlusCircle className="me-1 h-3.5 w-3.5" aria-hidden="true" />}
              {tr('Add', 'إضافة')}
            </Button>
          </form>
          <InlineError message={addError} />
        </section>

        <section aria-labelledby="admin-group-admins" className="space-y-3">
          <div>
            <h3 id="admin-group-admins" className="text-sm font-semibold text-muted-foreground">
              {tr('Administrators', 'المسؤولون')} <span className="font-normal tabular-nums">({detail.admins.length})</span>
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {tr(
                'They give people group-wide roles and edit the role templates, never beyond what they hold in every company of the group, and never their own. Only you appoint them.',
                'يمنحون أدوارًا على مستوى المجموعة ويعدّلون قوالب الأدوار، دون تجاوز ما يملكونه في كل شركات المجموعة، ودون تغيير أدوارهم. وأنت وحدك تعيّنهم.',
              )}
            </p>
          </div>

          {detail.admins.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {tr('Nobody administers this group yet.', 'لا أحد يدير هذه المجموعة بعد.')}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {detail.admins.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium">{a.name ?? a.email ?? a.id}</span>
                    {a.email && <span className="block break-all text-xs text-muted-foreground">{a.email}</span>}
                  </div>
                  {!memberIds.has(a.id) && <Chip tone="warn">{tr('Not in a group company', 'ليس في شركة من المجموعة')}</Chip>}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busyAdmin === a.id}
                    onClick={() => stepDown(a)}
                    aria-label={tr(`Remove ${a.name ?? a.email ?? a.id}`, `إزالة ${a.name ?? a.email ?? a.id}`)}
                  >
                    {busyAdmin === a.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    <span className="sr-only sm:not-sr-only sm:ms-1">{tr('Remove', 'إزالة')}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {/* Appointing is a search, not a list of everyone: a group's companies hold hundreds of people. */}
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {detail.companies.length === 0
                ? tr('Add a company first: administrators come from the group\'s companies.', 'أضف شركة أولًا: يُختار المسؤولون من شركات المجموعة.')
                : tr('Nobody belongs to the group\'s companies yet.', 'لا أحد ينتمي إلى شركات المجموعة بعد.')}
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="admin-group-admin-search">{tr('Appoint an administrator', 'تعيين مسؤول')}</Label>
              <Input
                id="admin-group-admin-search"
                value={adminQuery}
                onChange={(e) => { setAdminQuery(e.target.value); setAdminError(null); }}
                placeholder={tr('Search by name or email', 'ابحث بالاسم أو البريد')}
                autoComplete="off"
              />
              {matches.length > 0 ? (
                <ul className="divide-y rounded-xl border bg-card">
                  {matches.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                        disabled={busyAdmin === u.id}
                        onClick={() => appoint(u)}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-medium">{u.name}</span>
                          <span className="block break-all text-xs text-muted-foreground">{u.email}</span>
                        </div>
                        {busyAdmin === u.id
                          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                          : <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {adminQuery.trim()
                    ? tr('Nobody in the group\'s companies matches.', 'لا أحد في شركات المجموعة يطابق البحث.')
                    : tr('Everyone available already administers this group.', 'كل المتاحين يديرون هذه المجموعة بالفعل.')}
                </p>
              )}
              <InlineError message={adminError} />
            </div>
          )}
        </section>
      </div>

      {/* The group's own screens, on the same page: no jump to see its people and roles. */}
      <GroupBaseProvider value="/admin/groups">
        <GroupDetail key={detail.id} groupId={detail.id} hideCompanies />
      </GroupBaseProvider>
    </div>
  );
}

function GroupNameDialog({ target, onClose, onSaved }: {
  target: NameTarget | null;
  onClose: () => void;
  onSaved: (group: HoldingGroup, mode: NameTarget['mode']) => void;
}) {
  const { tr } = useTr();
  const [name, setName] = React.useState('');
  const [nameAr, setNameAr] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!target) return;
    setName(target.mode === 'rename' ? target.group.name : '');
    setNameAr(target.mode === 'rename' ? target.group.nameAr ?? '' : '');
    setError(null);
  }, [target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    if (!name.trim()) {
      setError(tr('Give the group a name.', 'أدخل اسمًا للمجموعة.'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), nameAr: nameAr.trim() || null };
      const group = target.mode === 'new'
        ? await createHoldingGroup(body)
        : await renameHoldingGroup(target.group.id, body);
      onSaved(group, target.mode);
    } catch (err) {
      setError(errorText(err, tr('Could not save the group.', 'تعذّر حفظ المجموعة.')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{target?.mode === 'rename' ? tr('Rename group', 'إعادة تسمية المجموعة') : tr('New group', 'مجموعة جديدة')}</DialogTitle>
            <DialogDescription>
              {target?.mode === 'rename'
                ? tr('Companies and people stay as they are.', 'تبقى الشركات والأشخاص كما هم.')
                : tr('You add its companies and administrators next.', 'تضيف شركاتها ومسؤوليها بعد ذلك.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="admin-group-name">{tr('Name', 'الاسم')}</Label>
            <Input id="admin-group-name" dir="ltr" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-group-name-ar">{tr('Arabic name (optional)', 'الاسم بالعربية (اختياري)')}</Label>
            <Input id="admin-group-name-ar" dir="rtl" lang="ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </div>
          <InlineError message={error} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {target?.mode === 'rename' ? tr('Save', 'حفظ') : tr('Create group', 'إنشاء المجموعة')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
