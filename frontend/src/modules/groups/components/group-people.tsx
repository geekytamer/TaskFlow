'use client';

/**
 * Everyone in a group, once: the companies each person can work in and their
 * role there, and the company that employs them. Access changes go through
 * the same checks as anywhere else; a company I don't manage is shown, not
 * offered for change.
 */
import * as React from 'react';
import { Briefcase, Loader2, Plus, Search, UserMinus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { displayName, allNames } from '@/lib/display-name';
import { matchesSearch } from '@/lib/search-normalize';
import { createEmployee, getEmployees, updateEmployee } from '@/services/hrService';
import { getGroupPeople, removeFromGroup, setGroupAccess, type GroupPeople, type GroupPerson } from '@/services/groupPeopleService';
import { employerAction } from '@/modules/groups/lib/employer';

const ROLES = ['Admin', 'Manager', 'Accountant', 'Employee'] as const;
const ROLE_AR: Record<string, string> = { Admin: 'مدير النظام', Manager: 'مدير', Accountant: 'محاسب', Employee: 'موظف' };

export function GroupPeoplePanel() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const ar = language === 'ar';
  const tr = (en: string, a: string) => (ar ? a : en);
  const roleName = (r: string) => (ar ? ROLE_AR[r] ?? r : r);
  const { toast } = useToast();
  const confirm = useConfirm();
  const groupId = selectedCompany?.id ?? '';
  const [data, setData] = React.useState<GroupPeople | null>(null);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [giving, setGiving] = React.useState<GroupPerson | null>(null);
  const [employing, setEmploying] = React.useState<GroupPerson | null>(null);

  const load = React.useCallback(async () => {
    if (!groupId) return;
    try {
      setData(await getGroupPeople(groupId));
    } catch (e) {
      toast({ variant: 'destructive', title: tr("Couldn't load the group's people", 'تعذر تحميل أشخاص المجموعة'), description: (e as Error).message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);
  React.useEffect(() => { void load(); }, [load]);

  const name = (companyId: string) => data?.companies.find((c) => c.id === companyId)?.name ?? companyId;
  const manages = (companyId: string) => Boolean(data?.manageable.includes(companyId));

  /** Runs one change, then shows the group as it now is (or why it was refused). */
  const act = async (key: string, run: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await run();
      toast({ title: done });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Not changed', 'لم يتم التغيير'), description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={tr('Loading', 'جارٍ التحميل')} /></div>;
  }

  const people = data.people.filter((p) => matchesSearch(query, allNames(p), p.email));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {tr(
            `${data.people.length} people across ${data.companies.length} companies. Each person is listed once, with every company they can work in.`,
            `${data.people.length} شخصًا في ${data.companies.length} شركات. يظهر كل شخص مرة واحدة مع كل شركة يعمل فيها.`,
          )}
        </p>
        <div className="relative sm:w-72">
          <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input className="ps-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Find a person', 'ابحث عن شخص')} aria-label={tr('Find a person', 'ابحث عن شخص')} />
        </div>
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {people.map((p) => {
          const offerable = data.manageable.filter((id) => !p.memberships.some((m) => m.companyId === id));
          const canRemove = p.memberships.some((m) => manages(m.companyId));
          return (
            <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="min-w-0 sm:w-56">
                <div className="truncate text-sm font-medium">{displayName(p, language)}</div>
                <div className="truncate text-xs text-muted-foreground" dir="ltr">{p.email}</div>
                <button
                  type="button"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
                  onClick={() => setEmploying(p)}
                  disabled={Boolean(p.employer)}
                  title={p.employer ? tr('Employment is managed in HR', 'تدار الوظيفة من الموارد البشرية') : undefined}
                >
                  <Briefcase className="h-3 w-3" aria-hidden="true" />
                  {p.employer
                    ? tr(`Works for ${name(p.employer.companyId)}`, `يعمل لدى ${name(p.employer.companyId)}`)
                    : tr('No employer set — set one', 'لا جهة عمل — حدّدها')}
                </button>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {p.memberships.map((m) => (
                  <span key={m.companyId} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pe-1 ps-2.5 text-xs">
                    <span className="font-medium">{name(m.companyId)}</span>
                    {manages(m.companyId) ? (
                      <Select
                        value={ROLES.includes(m.role as (typeof ROLES)[number]) ? m.role : undefined}
                        onValueChange={(role) => act(`${p.id}:${m.companyId}`, () => setGroupAccess(groupId, p.id, m.companyId, role), tr('Role changed', 'تم تغيير الدور'))}
                      >
                        <SelectTrigger className="h-6 w-auto gap-1 border-0 bg-transparent px-1 text-xs" aria-label={tr(`Role in ${name(m.companyId)}`, `الدور في ${name(m.companyId)}`)}>
                          <SelectValue placeholder={m.role} />
                        </SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{roleName(r)}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <span className="px-1 text-muted-foreground">{roleName(m.role)}</span>
                    )}
                    {manages(m.companyId) && (
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label={tr(`End access to ${name(m.companyId)}`, `إنهاء الوصول إلى ${name(m.companyId)}`)}
                        disabled={busy !== null}
                        onClick={async () => {
                          if (!(await confirm({ title: tr(`End ${p.name}'s access to ${name(m.companyId)}?`, `إنهاء وصول ${p.name} إلى ${name(m.companyId)}؟`), confirmText: tr('End access', 'إنهاء الوصول'), cancelText: tr('Cancel', 'إلغاء'), destructive: true }))) return;
                          void act(`${p.id}:${m.companyId}`, () => setGroupAccess(groupId, p.id, m.companyId, null), tr('Access ended', 'تم إنهاء الوصول'));
                        }}
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
                {offerable.length > 0 && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setGiving(p)}>
                    <Plus className="h-3 w-3" aria-hidden="true" />{tr('Give access', 'منح الوصول')}
                  </Button>
                )}
              </div>
              {canRemove && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 gap-1 self-start px-2 text-xs text-muted-foreground hover:text-destructive"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (!(await confirm({
                      title: tr(`Remove ${p.name} from the group?`, `إزالة ${p.name} من المجموعة؟`),
                      description: tr('Their access ends in every company of the group you manage. Their records stay.', 'ينتهي وصوله في كل شركات المجموعة التي تديرها. تبقى سجلاته.'),
                      confirmText: tr('Remove', 'إزالة'), cancelText: tr('Cancel', 'إلغاء'), destructive: true,
                    }))) return;
                    void act(`${p.id}:remove`, () => removeFromGroup(groupId, p.id), tr('Removed from the group', 'تمت الإزالة من المجموعة'));
                  }}
                >
                  {busy === `${p.id}:remove` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <UserMinus className="h-3 w-3" aria-hidden="true" />}
                  {tr('Remove from group', 'إزالة من المجموعة')}
                </Button>
              )}
            </li>
          );
        })}
        {people.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{tr('Nobody matches.', 'لا يوجد أحد مطابق.')}</li>}
      </ul>

      <GiveAccessDialog
        person={giving}
        companies={giving ? data.manageable.filter((id) => !giving.memberships.some((m) => m.companyId === id)) : []}
        name={name}
        roleName={roleName}
        tr={tr}
        onClose={() => setGiving(null)}
        onGive={(companyId, role) => {
          const p = giving!;
          setGiving(null);
          void act(`${p.id}:${companyId}`, () => setGroupAccess(groupId, p.id, companyId, role), tr(`${p.name} can now work in ${name(companyId)}`, `يمكن لـ${p.name} الآن العمل في ${name(companyId)}`));
        }}
      />
      <EmployerDialog
        person={employing}
        name={name}
        tr={tr}
        onClose={() => setEmploying(null)}
        onSet={(companyId) => {
          const p = employing!;
          setEmploying(null);
          void act(`${p.id}:employer`, async () => {
            const step = employerAction(await getEmployees(companyId), p);
            if ('link' in step) await updateEmployee(step.link, { userId: p.id });
            else await createEmployee(companyId, step.create);
          }, tr(`${p.name} now works for ${name(companyId)}`, `${p.name} يعمل الآن لدى ${name(companyId)}`));
        }}
      />
    </div>
  );
}

function GiveAccessDialog({ person, companies, name, roleName, tr, onClose, onGive }: {
  person: GroupPerson | null; companies: string[]; name: (id: string) => string; roleName: (r: string) => string;
  tr: (en: string, ar: string) => string; onClose: () => void; onGive: (companyId: string, role: string) => void;
}) {
  const [companyId, setCompanyId] = React.useState('');
  const [role, setRole] = React.useState<string>('Employee');
  // Reset when another person opens the dialog, not on every render of the list.
  const choicesKey = companies.join(',');
  React.useEffect(() => { setCompanyId(choicesKey.split(',')[0] ?? ''); setRole('Employee'); }, [person, choicesKey]);
  return (
    <Dialog open={Boolean(person)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{tr(`Give ${person?.name ?? ''} access`, `منح ${person?.name ?? ''} الوصول`)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger aria-label={tr('Company', 'الشركة')}><SelectValue /></SelectTrigger>
            <SelectContent>{companies.map((id) => <SelectItem key={id} value={id}>{name(id)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger aria-label={tr('Role', 'الدور')}><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{roleName(r)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button disabled={!companyId} onClick={() => onGive(companyId, role)}>{tr('Give access', 'منح الوصول')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployerDialog({ person, name, tr, onClose, onSet }: {
  person: GroupPerson | null; name: (id: string) => string; tr: (en: string, ar: string) => string;
  onClose: () => void; onSet: (companyId: string) => void;
}) {
  const choices = person?.memberships.map((m) => m.companyId) ?? [];
  const [companyId, setCompanyId] = React.useState('');
  React.useEffect(() => { setCompanyId(choices[0] ?? ''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [person]);
  return (
    <Dialog open={Boolean(person)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{tr(`Who employs ${person?.name ?? ''}?`, `من يوظّف ${person?.name ?? ''}؟`)}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {tr('Payroll, WPS and end-of-service run in this company. One employer per person in the group; access to the others stays as it is.', 'يجري الراتب ونظام حماية الأجور ونهاية الخدمة في هذه الشركة. جهة عمل واحدة لكل شخص في المجموعة؛ يبقى الوصول إلى غيرها كما هو.')}
        </p>
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger aria-label={tr('Employer', 'جهة العمل')}><SelectValue /></SelectTrigger>
          <SelectContent>{choices.map((id) => <SelectItem key={id} value={id}>{name(id)}</SelectItem>)}</SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button disabled={!companyId} onClick={() => onSet(companyId)}>{tr('Set employer', 'تحديد جهة العمل')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
