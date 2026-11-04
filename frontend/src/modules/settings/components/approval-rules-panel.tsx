'use client';

/**
 * Settings → Approvals: the company's approver teams (Legal, Finance …) and,
 * per kind of document, the steps it goes through: who decides each (a team,
 * a role, a person or the requester's manager), whether one of them or all
 * of them, and for which amounts. A company without its own policy uses its
 * group's, and says so.
 */
import * as React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getUsersByCompany } from '@/services/userService';
import {
  POLICY_DOC_TYPES, deleteApprovalTeam, docTypeGate, docTypeLabel, getApprovalPolicies, getApprovalTeams, roleLabel,
  saveApprovalPolicy, saveApprovalTeam, type ApprovalDocType, type ApprovalPolicy, type ApprovalTeam, type Approver, type PolicyStep,
  amountIsDays,
} from '@/services/approvalService';

type Tr = (en: string, ar: string) => string;
const ROLES = ['Manager', 'Accountant', 'Admin'] as const;
const MEMBER_ROLES = ['Admin', 'Manager', 'Accountant', 'Employee'] as const;

const approverKey = (a: Approver) => (a.kind === 'manager' ? 'manager' : `${a.kind}:${a.id}`);
const fromKey = (key: string): Approver => {
  if (key === 'manager') return { kind: 'manager' };
  const [kind, ...rest] = key.split(':');
  return { kind, id: rest.join(':') } as Approver;
};

export function ApprovalRulesPanel({ canEdit }: { canEdit: boolean }) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { toast } = useToast();
  const confirm = useConfirm();
  const companyId = selectedCompany?.id ?? '';
  const [teams, setTeams] = React.useState<ApprovalTeam[]>([]);
  const [policies, setPolicies] = React.useState<Record<string, ApprovalPolicy> | null>(null);
  const [people, setPeople] = React.useState<Array<{ id: string; name: string }>>([]);
  const [editingTeam, setEditingTeam] = React.useState<Partial<ApprovalTeam> | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, ApprovalPolicy>>({});

  const load = React.useCallback(async () => {
    if (!companyId) return;
    const [t, p, u] = await Promise.all([getApprovalTeams(companyId), getApprovalPolicies(companyId), getUsersByCompany(companyId).catch(() => [])]);
    setTeams(t);
    setPolicies(p);
    setPeople(u.map((x) => ({ id: x.id, name: x.name })));
    setDrafts({});
  }, [companyId]);
  React.useEffect(() => { void load().catch(() => setPolicies({})); }, [load]);

  const label = (a: Approver): string => {
    if (a.kind === 'role') return roleLabel(a.id, tr);
    if (a.kind === 'team') return teams.find((t) => t.id === a.id)?.name ?? a.label ?? tr('A team', 'فريق');
    if (a.kind === 'user') return people.find((p) => p.id === a.id)?.name ?? a.label ?? tr('A person', 'شخص');
    return tr("The requester's manager", 'مدير مقدّم الطلب');
  };

  const policyOf = (t: ApprovalDocType): ApprovalPolicy =>
    drafts[t] ?? policies?.[t] ?? { steps: [], allowSelf: false, reminderHours: 24, escalateHours: 72, inheritedFrom: null };
  const edit = (t: ApprovalDocType, change: (p: ApprovalPolicy) => ApprovalPolicy) =>
    setDrafts((d) => ({ ...d, [t]: change(structuredClone(policyOf(t))) }));

  const savePolicy = async (t: ApprovalDocType) => {
    try {
      const p = policyOf(t);
      await saveApprovalPolicy(companyId, t, { steps: p.steps, allowSelf: p.allowSelf, reminderHours: p.reminderHours, escalateHours: p.escalateHours });
      toast({ title: tr('Approval policy saved', 'تم حفظ سياسة الموافقة') });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Not saved', 'لم يُحفظ'), description: (e as Error).message });
    }
  };

  const saveTeam = async () => {
    if (!editingTeam) return;
    try {
      await saveApprovalTeam(companyId, { id: editingTeam.id, name: editingTeam.name ?? '', members: editingTeam.members ?? [] });
      setEditingTeam(null);
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Not saved', 'لم يُحفظ'), description: (e as Error).message });
    }
  };

  if (!selectedCompany || policies === null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr('Approvals', 'الموافقات')}</CardTitle>
        <CardDescription>
          {tr('Who signs off what: teams such as Legal or Finance, managers, accountants, named people, or the requester\'s own manager.',
            'من يعتمد ماذا: فرق مثل القانونية أو المالية، والمدراء، والمحاسبون، وأشخاص محددون، أو مدير مقدّم الطلب.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Teams */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{tr('Approver teams', 'فرق الاعتماد')}</h3>
            {canEdit && <Button size="sm" variant="outline" onClick={() => setEditingTeam({ name: '', members: [] })}><Plus className="me-1 h-4 w-4" />{tr('New team', 'فريق جديد')}</Button>}
          </div>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr('No teams yet. Make one for Legal, Finance or any group of people who sign off together.', 'لا توجد فرق بعد. أنشئ فريقًا للقانونية أو المالية أو أي مجموعة تعتمد معًا.')}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {teams.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium">{t.name}</span>
                  {t.companyId !== companyId && <span className="text-xs text-muted-foreground">{tr('(the group\'s)', '(للمجموعة)')}</span>}
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {t.members.map((m) => (m.kind === 'role' ? tr(`every ${roleLabel(m.value, tr)}`, `كل ${roleLabel(m.value, tr)}`) : people.find((p) => p.id === m.value)?.name ?? '…')).join(', ') || tr('nobody yet', 'لا أحد بعد')}
                  </span>
                  {canEdit && t.companyId === companyId && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingTeam(t)}>{tr('Edit', 'تعديل')}</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-destructive" aria-label={tr(`Delete ${t.name}`, `حذف ${t.name}`)}
                        onClick={async () => {
                          if (!(await confirm({ title: tr(`Delete ${t.name}?`, `حذف ${t.name}؟`), confirmText: tr('Delete', 'حذف'), cancelText: tr('Cancel', 'إلغاء'), destructive: true }))) return;
                          try { await deleteApprovalTeam(companyId, t.id); await load(); } catch (e) { toast({ variant: 'destructive', title: tr('Not deleted', 'لم يُحذف'), description: (e as Error).message }); }
                        }}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Policies per document type */}
        {POLICY_DOC_TYPES.map((t) => {
          const p = policyOf(t);
          const dirty = Boolean(drafts[t]);
          // The group's policy is read here; adding a step is how this company takes its own.
          const inherited = Boolean(p.inheritedFrom && !dirty);
          return (
            <section key={t} className="space-y-2 border-t pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{docTypeLabel(t, tr)}</h3>
                  <p className="text-xs text-muted-foreground">{docTypeGate(t, tr)}</p>
                </div>
                {p.inheritedFrom && !dirty && (
                  <span className="text-xs text-muted-foreground">{tr(`Uses ${p.inheritedFrom.name}'s policy. Steps you add here replace it for this company.`, `تستخدم سياسة ${p.inheritedFrom.name}. الخطوات التي تضيفها هنا تحل محلها لهذه الشركة.`)}</span>
                )}
              </div>
              {p.steps.length === 0 && !p.groupSignOff?.length && <p className="text-sm text-muted-foreground">{tr('No approval needed.', 'لا يحتاج إلى موافقة.')}</p>}
              <ol className="space-y-2">
                {p.steps.map((s, i) => (
                  <StepEditor
                    key={i} index={i} step={s} count={p.steps.length} canEdit={canEdit && !(p.inheritedFrom && !dirty)} tr={tr} label={label} isGroup={Boolean(p.hasCompaniesBelow)} days={amountIsDays(t)}
                    teams={teams} people={people}
                    onChange={(next) => edit(t, (q) => ({ ...q, inheritedFrom: null, steps: q.steps.map((x, j) => (j === i ? next : x)) }))}
                    onMove={(d) => edit(t, (q) => { const steps = [...q.steps]; const [x] = steps.splice(i, 1); steps.splice(i + d, 0, x); return { ...q, steps }; })}
                    onRemove={() => edit(t, (q) => ({ ...q, steps: q.steps.filter((_, j) => j !== i) }))}
                  />
                ))}
              </ol>
              {p.groupSignOff?.map((g) => (
                <p key={g.companyId} className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  {tr(`Then ${g.name} signs off: `, `ثم تعتمد ${g.name}: `)}
                  {g.steps.map((st) => st.approvers.map((a) => label(a)).join(st.need === 'all' ? tr(' and ', ' و') : tr(' or ', ' أو '))
                    + (st.minAmount ? tr(` (from ${st.minAmount}`, ` (من ${st.minAmount}`) + (st.maxAmount ? tr(` up to ${st.maxAmount})`, ` حتى ${st.maxAmount})`) : ')') : st.maxAmount ? tr(` (up to ${st.maxAmount})`, ` (حتى ${st.maxAmount})`) : '')).join(tr(', then ', '، ثم '))}
                  {amountIsDays(t) ? tr(' In days.', ' بالأيام.') : tr(` In ${g.name}'s currency.`, ` بعملة ${g.name}.`)}
                </p>
              ))}
              {canEdit && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="outline" disabled={p.steps.length >= 10}
                    onClick={() => edit(t, (q) => ({ ...(q.inheritedFrom ? { ...q, steps: [] } : q), inheritedFrom: null, steps: [...(q.inheritedFrom ? [] : q.steps), { approvers: [{ kind: 'role', id: 'Manager' }], need: 'any', minAmount: null, maxAmount: null }] }))}>
                    <Plus className="me-1 h-4 w-4" />{tr('Add step', 'إضافة خطوة')}
                  </Button>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={p.allowSelf} onCheckedChange={(v) => edit(t, (q) => ({ ...q, allowSelf: v }))} disabled={p.steps.length === 0 || inherited} />
                    {tr('The requester may approve their own', 'يجوز لمقدّم الطلب اعتماد طلبه')}
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    {tr('Remind after', 'تذكير بعد')}
                    <Input type="number" min={1} max={720} className="h-7 w-16" disabled={inherited} value={p.reminderHours} onChange={(e) => edit(t, (q) => ({ ...q, reminderHours: Number(e.target.value) || 24 }))} />
                    {tr('h, tell Admins after', 'س، إبلاغ المدراء بعد')}
                    <Input type="number" min={1} max={720} className="h-7 w-16" disabled={inherited} value={p.escalateHours} onChange={(e) => edit(t, (q) => ({ ...q, escalateHours: Number(e.target.value) || 72 }))} />
                    {tr('h', 'س')}
                  </label>
                  {dirty && (
                    <>
                      <Button size="sm" onClick={() => savePolicy(t)}>{tr('Save', 'حفظ')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDrafts((d) => { const n = { ...d }; delete n[t]; return n; })}>{tr('Cancel', 'إلغاء')}</Button>
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </CardContent>

      <Dialog open={Boolean(editingTeam)} onOpenChange={(o) => { if (!o) setEditingTeam(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingTeam?.id ? tr('Edit team', 'تعديل الفريق') : tr('New team', 'فريق جديد')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder={tr('Name, e.g. Legal', 'الاسم، مثل القانونية')} aria-label={tr('Name', 'الاسم')} value={editingTeam?.name ?? ''} onChange={(e) => setEditingTeam((t) => ({ ...t, name: e.target.value }))} />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{tr('Everyone with these roles', 'كل من يحمل هذه الأدوار')}</p>
              <div className="flex flex-wrap gap-3">
                {MEMBER_ROLES.map((r) => {
                  const on = Boolean(editingTeam?.members?.some((m) => m.kind === 'role' && m.value === r));
                  return (
                    <label key={r} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={on} onChange={() => setEditingTeam((t) => ({ ...t, members: on ? (t?.members ?? []).filter((m) => !(m.kind === 'role' && m.value === r)) : [...(t?.members ?? []), { kind: 'role', value: r }] }))} />
                      {roleLabel(r, tr)}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{tr('And these people', 'وهؤلاء الأشخاص')}</p>
              <div className="flex flex-wrap gap-1.5">
                {(editingTeam?.members ?? []).filter((m) => m.kind === 'user').map((m) => (
                  <span key={m.value} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                    {people.find((p) => p.id === m.value)?.name ?? '…'}
                    <button type="button" aria-label={tr('Remove', 'إزالة')} onClick={() => setEditingTeam((t) => ({ ...t, members: (t?.members ?? []).filter((x) => !(x.kind === 'user' && x.value === m.value)) }))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <Select value="" onValueChange={(id) => setEditingTeam((t) => ({ ...t, members: [...(t?.members ?? []), { kind: 'user', value: id }] }))}>
                <SelectTrigger aria-label={tr('Add a person', 'إضافة شخص')}><SelectValue placeholder={tr('Add a person', 'إضافة شخص')} /></SelectTrigger>
                <SelectContent>
                  {people.filter((p) => !editingTeam?.members?.some((m) => m.kind === 'user' && m.value === p.id)).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTeam(null)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button disabled={!editingTeam?.name?.trim()} onClick={saveTeam}>{tr('Save', 'حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StepEditor({ index, step, count, canEdit, tr, label, teams, people, onChange, onMove, onRemove, isGroup, days = false }: {
  days?: boolean;
  index: number; step: PolicyStep; count: number; canEdit: boolean; tr: Tr; label: (a: Approver) => string; isGroup: boolean;
  teams: ApprovalTeam[]; people: Array<{ id: string; name: string }>;
  onChange: (s: PolicyStep) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const chosen = new Set(step.approvers.map(approverKey));
  const amount = (v: string) => (v.trim() === '' ? null : Number(v));
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{tr(`Step ${index + 1}`, `الخطوة ${index + 1}`)}</span>
        {step.approvers.map((a) => (
          <span key={approverKey(a)} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            {label(a)}
            {canEdit && step.approvers.length > 1 && (
              <button type="button" aria-label={tr('Remove', 'إزالة')} onClick={() => onChange({ ...step, approvers: step.approvers.filter((x) => approverKey(x) !== approverKey(a)) })}><X className="h-3 w-3" /></button>
            )}
          </span>
        ))}
        {canEdit && (
          <Select value="" onValueChange={(key) => onChange({ ...step, approvers: [...step.approvers, fromKey(key)] })}>
            <SelectTrigger className="h-7 w-auto gap-1 text-xs" aria-label={tr('Add who decides', 'إضافة من يقرر')}><SelectValue placeholder={tr('+ who decides', '+ من يقرر')} /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{tr('Teams', 'الفرق')}</SelectLabel>
                {teams.filter((t) => !chosen.has(`team:${t.id}`)).map((t) => <SelectItem key={t.id} value={`team:${t.id}`}>{t.name}</SelectItem>)}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>{tr('Roles', 'الأدوار')}</SelectLabel>
                {ROLES.filter((r) => !chosen.has(`role:${r}`)).map((r) => <SelectItem key={r} value={`role:${r}`}>{roleLabel(r, tr)}</SelectItem>)}
              </SelectGroup>
              {!chosen.has('manager') && <SelectItem value="manager">{tr("The requester's manager", 'مدير مقدّم الطلب')}</SelectItem>}
              <SelectGroup>
                <SelectLabel>{tr('People', 'الأشخاص')}</SelectLabel>
                {people.filter((p) => !chosen.has(`user:${p.id}`)).map((p) => <SelectItem key={p.id} value={`user:${p.id}`}>{p.name}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        {step.approvers.length > 1 && (
          <Select value={step.need} onValueChange={(v) => onChange({ ...step, need: v as PolicyStep['need'] })} disabled={!canEdit}>
            <SelectTrigger className="h-7 w-auto text-xs" aria-label={tr('How many must approve', 'كم يجب أن يعتمد')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{tr('any one of them', 'أي واحد منهم')}</SelectItem>
              <SelectItem value="all">{tr('each of them', 'كل واحد منهم')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        {canEdit && (
          <span className="ms-auto flex items-center">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} aria-label={tr('Earlier', 'أبكر')} onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === count - 1} aria-label={tr('Later', 'لاحقًا')} onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={tr('Remove step', 'حذف الخطوة')} onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {tr('Applies from', 'تنطبق من')}
        <Input type="number" min={0} className="h-7 w-24" placeholder={tr('any', 'أي')} disabled={!canEdit} value={step.minAmount ?? ''} onChange={(e) => onChange({ ...step, minAmount: amount(e.target.value) })} />
        {tr('up to', 'حتى')}
        <Input type="number" min={0} className="h-7 w-24" placeholder={tr('any', 'أي')} disabled={!canEdit} value={step.maxAmount ?? ''} onChange={(e) => onChange({ ...step, maxAmount: amount(e.target.value) })} />
        {days ? tr('days of leave', 'أيام إجازة') : tr('(in the document\'s company currency)', '(بعملة شركة المستند)')}
      </div>
      {isGroup && (
        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={Boolean(step.alsoBelow)} onCheckedChange={(v) => onChange({ ...step, alsoBelow: v })} disabled={!canEdit} />
          {tr('Group sign-off: also for every company below, after their own approvals', 'اعتماد المجموعة: أيضًا لكل شركة تحتها، بعد اعتماداتها')}
        </label>
      )}
    </li>
  );
}
