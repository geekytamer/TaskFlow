'use client';

/**
 * Settings → Group (group administrators and the platform administrator):
 * the group's companies, the people given group-wide roles (they reach every
 * company of the group, read-only there), and the role templates the group
 * supplies, with Push to bring companies using a template unchanged up to
 * date. Push never touches a company's standard roles (Ruling N) and leaves
 * customised copies alone; the result says which was which.
 */
import * as React from 'react';
import Link from 'next/link';
import { Building2, Loader2, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getUsersByCompany } from '@/services/userService';
import {
  getHoldingGroup,
  pushHoldingTemplate,
  setHoldingAssignment,
  type HoldingGroupDetail,
  type HoldingPerson,
  type HoldingTemplate,
  type PushResult,
} from '@/services/authzService';
import {
  AccessHeader,
  Chip,
  EmptyState,
  ErrorState,
  InlineError,
  ListSkeleton,
  errorText,
  roleLabel,
  shortDate,
  useMyHoldingGroups,
  useTr,
  type Tr,
} from './shared';

interface GroupPerson {
  user: HoldingPerson;
  mainKey: string | null;
  addOnKeys: string[];
  startsAt: string | null;
  endsAt: string | null;
}

/** The group's assignment rows, one entry per person (one window per person: Task 8 known limit). */
export function groupPeople(detail: HoldingGroupDetail): GroupPerson[] {
  const byUser = new Map<string, GroupPerson>();
  for (const a of detail.assignments) {
    const entry = byUser.get(a.userId) ?? { user: a.user, mainKey: null, addOnKeys: [], startsAt: a.startsAt, endsAt: a.endsAt };
    if (a.isMain) entry.mainKey = a.roleKey;
    else entry.addOnKeys.push(a.roleKey);
    byUser.set(a.userId, entry);
  }
  return [...byUser.values()].sort((a, b) => (a.user.name ?? '').localeCompare(b.user.name ?? ''));
}

export function GroupPage() {
  const { tr } = useTr();
  const { groups, loading } = useMyHoldingGroups();
  const [groupId, setGroupId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!groupId && groups.length) setGroupId(groups[0].id);
  }, [groups, groupId]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <AccessHeader
        title={tr('Group', 'المجموعة')}
        description={tr(
          'People given a group-wide role reach every company of the group. Each company keeps managing its own roles.',
          'من يُمنح دورًا على مستوى المجموعة يصل إلى كل شركاتها. وتبقى كل شركة تدير أدوارها الخاصة.',
        )}
        actions={groups.length > 1 ? (
          <Select value={groupId ?? ''} onValueChange={setGroupId}>
            <SelectTrigger className="w-56" aria-label={tr('Group', 'المجموعة')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : undefined}
      />
      {loading && <ListSkeleton rows={3} />}
      {!loading && groups.length === 0 && (
        <EmptyState title={tr('You don\'t administer a group', 'أنت لا تدير أي مجموعة')}>
          {tr('Group settings are for the administrators of a group of companies.', 'إعدادات المجموعة لمسؤولي مجموعة الشركات.')}
        </EmptyState>
      )}
      {groupId && <GroupDetail key={groupId} groupId={groupId} />}
    </div>
  );
}

function GroupDetail({ groupId }: { groupId: string }) {
  const { tr, lang } = useTr();
  const confirm = useConfirm();
  const [detail, setDetail] = React.useState<HoldingGroupDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const [editing, setEditing] = React.useState<GroupPerson | 'new' | null>(null);
  const [rowError, setRowError] = React.useState<{ id: string; message: string } | null>(null);

  React.useEffect(() => {
    let active = true;
    setError(null);
    getHoldingGroup(groupId)
      .then((d) => { if (active) setDetail(d); })
      .catch((e: unknown) => { if (active) setError(errorText(e, tr('Could not load the group.', 'تعذّر تحميل المجموعة.'))); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, nonce]);

  if (error) return <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />;
  if (!detail) return <ListSkeleton rows={4} />;

  const people = groupPeople(detail);
  const templateName = (key: string) => {
    const t = detail.templates.find((x) => x.key === key);
    return t ? roleLabel(t, lang) : key;
  };
  const companyName = (id: string) => detail.companies.find((c) => c.id === id)?.name ?? id;

  const remove = async (p: GroupPerson) => {
    const ok = await confirm({
      title: tr('Remove group-wide roles?', 'إزالة أدوار المجموعة؟'),
      description: tr(
        `${p.user.name ?? p.user.email} will keep only what their own companies give them.`,
        `سيبقى لـ${p.user.name ?? p.user.email} ما تمنحه شركاته فقط.`,
      ),
      confirmText: tr('Remove', 'إزالة'),
      cancelText: tr('Cancel', 'إلغاء'),
      destructive: true,
    });
    if (!ok) return;
    setRowError(null);
    try {
      setDetail(await setHoldingAssignment(groupId, p.user.id, { roleKey: null, addOnKeys: [] }));
    } catch (e) {
      setRowError({ id: p.user.id, message: errorText(e, tr('Could not remove.', 'تعذّرت الإزالة.')) });
    }
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="companies-heading">
        <h2 id="companies-heading" className="mb-2 text-sm font-semibold text-muted-foreground">{tr('Companies', 'الشركات')}</h2>
        {detail.companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr('No companies in this group yet.', 'لا توجد شركات في هذه المجموعة بعد.')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {detail.companies.map((c) => (
              <li key={c.id} className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {c.name ?? c.id}
              </li>
            ))}
          </ul>
        )}
        {detail.admins.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {tr('Administrators: ', 'المسؤولون: ')}
            {detail.admins.map((a) => a.name ?? a.email).join(lang === 'ar' ? '، ' : ', ')}
          </p>
        )}
      </section>

      <section aria-labelledby="group-people-heading">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="group-people-heading" className="text-sm font-semibold text-muted-foreground">{tr('Group-wide people', 'أشخاص على مستوى المجموعة')}</h2>
          <Button size="sm" variant="outline" onClick={() => setEditing('new')} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {tr('Add person', 'إضافة شخص')}
          </Button>
        </div>
        {people.length === 0 ? (
          <EmptyState title={tr('Nobody has a group-wide role', 'لا أحد لديه دور على مستوى المجموعة')}>
            {tr('Give someone a group-wide role to let them work in every company of the group.', 'امنح شخصًا دورًا على مستوى المجموعة ليعمل في كل شركاتها.')}
          </EmptyState>
        ) : (
          <ul className="divide-y rounded-lg border">
            {people.map((p) => (
              <li key={p.user.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.user.name ?? p.user.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                    <span>{p.mainKey ? templateName(p.mainKey) : tr('No main role', 'بلا دور أساسي')}</span>
                    {p.addOnKeys.map((k) => <Chip key={k}><Plus className="h-3 w-3" aria-hidden="true" />{templateName(k)}</Chip>)}
                    {p.endsAt && <Chip>{tr('until', 'حتى')} {shortDate(p.endsAt, lang)}</Chip>}
                  </div>
                  {rowError?.id === p.user.id && <InlineError message={rowError.message} className="mt-1" />}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr('Change', 'تغيير')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(p)} className="gap-1.5 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr('Remove', 'إزالة')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="templates-heading">
        <h2 id="templates-heading" className="text-sm font-semibold text-muted-foreground">{tr('Role templates', 'قوالب الأدوار')}</h2>
        <p className="mb-2 mt-0.5 text-sm text-muted-foreground">
          {tr(
            'Companies start their roles from these. Push sends your latest version to every company still using a template unchanged.',
            'تبدأ الشركات أدوارها من هذه القوالب. «إرسال» يوصل آخر نسخة إلى كل شركة ما زالت تستخدم القالب دون تعديل.',
          )}
        </p>
        <ul className="divide-y rounded-lg border">
          {detail.templates.map((t) => (
            <TemplateRow key={t.key} groupId={groupId} template={t} companyName={companyName} />
          ))}
        </ul>
      </section>

      <AssignDialog
        groupId={groupId}
        detail={detail}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(d) => { setDetail(d); setEditing(null); }}
      />
    </div>
  );
}

function TemplateRow({ groupId, template, companyName }: { groupId: string; template: HoldingTemplate; companyName: (id: string) => string }) {
  const { tr, lang } = useTr();
  const { toast } = useToast();
  const [pushing, setPushing] = React.useState(false);
  const [result, setResult] = React.useState<PushResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const push = async () => {
    setPushing(true);
    setError(null);
    try {
      const r = await pushHoldingTemplate(groupId, template.key);
      setResult(r);
      toast({ title: tr('Template pushed', 'تم إرسال القالب') });
    } catch (e) {
      setError(errorText(e, tr('The template could not be pushed.', 'تعذّر إرسال القالب.')));
    } finally {
      setPushing(false);
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{roleLabel(template, lang)}</span>
          <Badge variant="secondary">{template.source === 'system' ? tr('Standard', 'قياسي') : tr('Edited by the group', 'معدّل من المجموعة')}</Badge>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button asChild size="sm" variant="ghost" className="gap-1.5">
            <Link href={`/settings/group/${encodeURIComponent(groupId)}/templates/${encodeURIComponent(template.key)}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              {tr('Edit', 'تعديل')}
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={push} disabled={pushing} className="gap-1.5">
            {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />}
            {tr('Push', 'إرسال')}
          </Button>
        </div>
      </div>
      <InlineError message={error} className="mt-2" />
      {result && <PushReport result={result} companyName={companyName} tr={tr} />}
    </li>
  );
}

function PushReport({ result, companyName, tr }: { result: PushResult; companyName: (id: string) => string; tr: Tr }) {
  const groups = [
    { rows: result.updated, title: tr('Updated', 'تم التحديث') },
    { rows: result.customised, title: tr('Customised — not updated', 'معدّل محليًا — لم يُحدَّث') },
    { rows: result.standard, title: tr('Company standard role — not updated', 'دور قياسي للشركة — لم يُحدَّث') },
  ].filter((g) => g.rows.length);
  return (
    <div role="status" className="mt-3 space-y-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
      {groups.length === 0 && <p className="text-muted-foreground">{tr('No company uses this template yet.', 'لا تستخدم أي شركة هذا القالب بعد.')}</p>}
      {groups.map((g) => (
        <div key={g.title}>
          <p className="font-medium">{g.title} <span className="font-normal text-muted-foreground">({g.rows.length})</span></p>
          <ul className="text-muted-foreground">
            {g.rows.map((r) => (
              <li key={r.roleId}>
                {companyName(r.companyId)} · {r.roleName}
                {/* The company's read-only copy of the group role, not its own role of the same name. */}
                {r.roleKey.startsWith('group:') && ` (${tr('group copy', 'نسخة المجموعة')})`}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AssignDialog({ groupId, detail, editing, onClose, onSaved }: {
  groupId: string;
  detail: HoldingGroupDetail;
  editing: GroupPerson | 'new' | null;
  onClose: () => void;
  onSaved: (detail: HoldingGroupDetail) => void;
}) {
  const { tr, lang } = useTr();
  const open = editing !== null;
  const existing = editing && editing !== 'new' ? editing : null;
  const [candidates, setCandidates] = React.useState<HoldingPerson[] | null>(null);
  const [userId, setUserId] = React.useState('');
  const [mainKey, setMainKey] = React.useState('');
  const [addOnKeys, setAddOnKeys] = React.useState<string[]>([]);
  const [endsAt, setEndsAt] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setUserId(existing?.user.id ?? '');
    setMainKey(existing?.mainKey ?? '');
    setAddOnKeys(existing?.addOnKeys ?? []);
    setEndsAt(existing?.endsAt ? existing.endsAt.slice(0, 10) : '');
    setError(null);
    if (existing) return;
    // People who belong to a company of the group (Ruling O).
    let active = true;
    setCandidates(null);
    Promise.all(detail.companies.map((c) => getUsersByCompany(c.id).catch(() => [])))
      .then((lists) => {
        if (!active) return;
        const taken = new Set(detail.assignments.map((a) => a.userId));
        const seen = new Map<string, HoldingPerson>();
        for (const u of lists.flat()) if (!taken.has(u.id) && !seen.has(u.id)) seen.set(u.id, { id: u.id, name: u.name, email: u.email });
        setCandidates([...seen.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')));
      });
    return () => { active = false; };
  }, [open, existing, detail]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !mainKey) {
      setError(tr('Choose a person and a main role.', 'اختر شخصًا ودورًا أساسيًا.'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const d = await setHoldingAssignment(groupId, userId, {
        roleKey: mainKey,
        addOnKeys: addOnKeys.filter((k) => k !== mainKey),
        startsAt: existing?.startsAt ?? null,
        endsAt: endsAt || null,
      });
      onSaved(d);
    } catch (err) {
      setError(errorText(err, tr('Could not save.', 'تعذّر الحفظ.')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{existing ? tr('Change group-wide roles', 'تغيير أدوار المجموعة') : tr('Add a group-wide person', 'إضافة شخص على مستوى المجموعة')}</DialogTitle>
            <DialogDescription>
              {tr('They reach every company of the group, now and added later.', 'يصل إلى كل شركات المجموعة، الحالية واللاحقة.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="group-person">{tr('Person', 'الشخص')}</Label>
            {existing ? (
              <p id="group-person" className="text-sm">{existing.user.name ?? existing.user.email}</p>
            ) : (
              <Select value={userId} onValueChange={setUserId} disabled={!candidates}>
                <SelectTrigger id="group-person">
                  <SelectValue placeholder={candidates ? tr('Choose someone', 'اختر شخصًا') : tr('Loading…', 'جارٍ التحميل…')} />
                </SelectTrigger>
                <SelectContent>
                  {(candidates ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {candidates && candidates.length === 0 && !existing && (
              <p className="text-xs text-muted-foreground">{tr('Everyone in the group\'s companies already has a group-wide role.', 'كل من في شركات المجموعة لديه دور على مستواها بالفعل.')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-main-role">{tr('Main role', 'الدور الأساسي')}</Label>
            <Select value={mainKey} onValueChange={setMainKey}>
              <SelectTrigger id="group-main-role"><SelectValue placeholder={tr('Choose a role', 'اختر دورًا')} /></SelectTrigger>
              <SelectContent>
                {detail.templates.map((t) => <SelectItem key={t.key} value={t.key}>{roleLabel(t, lang)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{tr('Add-ons', 'الإضافات')}</legend>
            {detail.templates.filter((t) => t.key !== mainKey).map((t) => {
              const id = `group-addon-${t.key}`;
              return (
                <div key={t.key} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={addOnKeys.includes(t.key)}
                    onCheckedChange={(on) => setAddOnKeys((keys) => (on === true ? [...keys, t.key] : keys.filter((k) => k !== t.key)))}
                  />
                  <Label htmlFor={id} className="text-sm font-normal">{roleLabel(t, lang)}</Label>
                </div>
              );
            })}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="group-ends">{tr('End date (optional)', 'تاريخ الانتهاء (اختياري)')}</Label>
            <Input id="group-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full sm:w-48" />
            <p className="text-xs text-muted-foreground">{tr('Leave empty for access with no end.', 'اتركه فارغًا لوصول بلا نهاية.')}</p>
          </div>

          <InlineError message={error} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {tr('Save', 'حفظ')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
