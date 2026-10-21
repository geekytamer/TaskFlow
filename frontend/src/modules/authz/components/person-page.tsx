'use client';

/**
 * Settings → People → one person: what they can do, in plain words, with the
 * role each line comes from ("Why"), and their main role and add-ons. A
 * refused save shows the server's sentence next to Save.
 */
import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import { isApiError } from '@/lib/api-client';
import {
  getPerson,
  listRoles,
  setPersonRoles,
  type GrantSource,
  type PersonDetail,
  type Role,
} from '@/services/authzService';
import { explainSummary } from '../lib/explain';
import { PersonFlags, SwitchOverChip, waitsForSwitchOver } from './people-page';
import {
  EngineNotice,
  ErrorState,
  InlineError,
  ListSkeleton,
  errorText,
  pick,
  roleLabel,
  shortDate,
  useCatalogue,
  useLegacyDecides,
  useTr,
  type Tr,
} from './shared';

/** "Accountant (main role)"; the role's Arabic name when the company's roles list has it. */
function sourceText(s: GrantSource, tr: Tr, lang: 'en' | 'ar', roles: readonly Role[]) {
  const role = roles.find((r) => r.id === s.roleId);
  const name = role ? roleLabel(role, lang) : s.roleName;
  const until = s.until ? ` ${tr('until', 'حتى')} ${shortDate(s.until, lang)}` : '';
  switch (s.kind) {
    case 'main': return tr(`${name} (main role)`, `${name} (الدور الأساسي)`);
    case 'addon': return tr(`${name} (add-on)`, `${name} (إضافة)`);
    case 'temporary': return tr(`${name} (temporary${until})`, `${name} (مؤقت${until})`);
    case 'holding': return tr(`${name} (from the group${until})`, `${name} (من المجموعة${until})`);
  }
}

export function PersonPage({ userId }: { userId: string }) {
  const { tr, lang } = useTr();
  const { isRtl } = useI18n();
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? null;
  const canManage = usePermissions().canAdmin('people.manage_roles');
  const legacy = useLegacyDecides();
  const { catalogue } = useCatalogue();

  const [person, setPerson] = React.useState<PersonDetail | null>(null);
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const [mainRoleId, setMainRoleId] = React.useState('');
  const [addOnIds, setAddOnIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const resetPickers = React.useCallback((p: PersonDetail) => {
    setMainRoleId(p.mainRole?.id ?? '');
    setAddOnIds(p.addOns.map((a) => a.id));
  }, []);

  React.useEffect(() => {
    if (!companyId) return;
    let active = true;
    setError(null);
    Promise.all([getPerson(companyId, userId), listRoles(companyId)])
      .then(([p, r]) => {
        if (!active) return;
        setPerson(p);
        setRoles(r);
        resetPickers(p);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(isApiError(e) && e.status === 404
          ? tr('This person is not in this company.', 'هذا الشخص ليس في هذه الشركة.')
          : errorText(e, tr('Could not load this person.', 'تعذّر تحميل هذا الشخص.')));
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, userId, nonce]);

  const assignable = roles.filter((r) => r.kind !== 'group');
  const dirty = Boolean(person) && (
    mainRoleId !== (person?.mainRole?.id ?? '')
    || [...addOnIds].sort().join() !== person!.addOns.map((a) => a.id).sort().join()
  );
  const editable = Boolean(person) && !person!.readOnly && canManage;

  const save = async () => {
    if (!companyId || !person || !mainRoleId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setPersonRoles(companyId, person.userId, { mainRoleId, addOnRoleIds: addOnIds.filter((id) => id !== mainRoleId) });
      const fresh = await getPerson(companyId, person.userId);
      setPerson(fresh);
      resetPickers(fresh);
      toast({ title: tr('Roles saved', 'تم حفظ الأدوار') });
    } catch (e) {
      const code = isApiError(e) ? (e.details as { code?: string } | undefined)?.code : undefined;
      setSaveError(code === 'NEEDS_REVIEW'
        ? tr('That role needs review first: open it under Roles and Activate it.', 'هذا الدور بحاجة إلى مراجعة أولًا: افتحه من «الأدوار» وفعّله.')
        : errorText(e, tr('The roles could not be saved.', 'تعذّر حفظ الأدوار.')));
    } finally {
      setSaving(false);
    }
  };

  const Back = isRtl ? ArrowRight : ArrowLeft;
  const lines = person && catalogue ? explainSummary(person, catalogue.areas) : person?.summary.map((text) => ({ text, why: [] as GrantSource[], kind: 'area' as const })) ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link href="/settings/people" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Back className="h-4 w-4" aria-hidden="true" />
        {tr('All people', 'كل الأشخاص')}
      </Link>

      {error && <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />}
      {!person && !error && <ListSkeleton rows={4} />}

      {person && (
        <>
          <header className="mb-5 flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {person.avatar && <AvatarImage src={person.avatar} alt="" />}
              <AvatarFallback>{(person.name ?? '?').charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate font-headline text-2xl font-bold tracking-tight">{person.name ?? person.email}</h1>
              <p className="truncate text-sm text-muted-foreground">{person.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5"><PersonFlags person={person} tr={tr} /></div>
            </div>
          </header>
          <EngineNotice />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <section aria-labelledby="summary-heading">
              <div className="mb-2">
              <h2 id="summary-heading" className="text-sm font-semibold text-muted-foreground">
                {legacy ? tr('What they can do today', 'ما يمكنه فعله اليوم') : tr('What they can do', 'ما يمكنه فعله')}
              </h2>
              {legacy && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {tr('Worked out from their company role until the switch-over.', 'محسوب من دوره في الشركة حتى التحويل.')}
                </p>
              )}
              </div>
              {person.superAdmin && (
                <p className="mb-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                  {tr('Platform administrator: also manages every company\'s settings and roles.', 'مسؤول المنصة: يدير أيضًا إعدادات وأدوار كل الشركات.')}
                </p>
              )}
              {lines.length === 0 ? (
                <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
                  {tr('Nothing yet: give them a main role.', 'لا شيء بعد: امنحه دورًا أساسيًا.')}
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {lines.map((line, i) => (
                    <li key={i} className="px-4 py-3">
                      <p className={line.kind === 'hidden' ? 'text-sm text-muted-foreground' : 'text-sm'}>{pick(line.text, lang)}</p>
                      {line.why.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <span className="font-medium">{tr('Why: ', 'السبب: ')}</span>
                          {line.why.map((s) => sourceText(s, tr, lang, roles)).join(lang === 'ar' ? '، ' : ', ')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="roles-heading" className="rounded-lg border p-4">
              <h2 id="roles-heading" className="mb-3 text-sm font-semibold">{tr('Roles', 'الأدوار')}</h2>
              {person.readOnly ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    {tr(
                      `This person comes through the group${person.viaGroup ? ` ${person.viaGroup.name}` : ''}. The group's administrators set their roles.`,
                      `يصل هذا الشخص عبر المجموعة${person.viaGroup ? ` ${person.viaGroup.name}` : ''}. يحدد مسؤولو المجموعة أدواره.`,
                    )}
                  </p>
                  <GroupRoles person={person} tr={tr} lang={lang} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="main-role">{tr('Main role', 'الدور الأساسي')}</Label>
                    <Select value={mainRoleId} onValueChange={setMainRoleId} disabled={!editable}>
                      <SelectTrigger id="main-role">
                        <SelectValue placeholder={tr('Choose a role', 'اختر دورًا')} />
                      </SelectTrigger>
                      <SelectContent>
                        {assignable.map((r) => (
                          <SelectItem key={r.id} value={r.id} disabled={r.needsReview}>
                            {roleLabel(r, lang)}
                            {r.needsReview ? ` — ${tr('needs review', 'بحاجة إلى مراجعة')}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {waitsForSwitchOver(legacy, mainRoleId, roles) && <div><SwitchOverChip tr={tr} /></div>}
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">{tr('Add-ons', 'الإضافات')}</legend>
                    <p className="text-xs text-muted-foreground">{tr('Extra access on top of the main role. Nothing is taken away.', 'وصول إضافي فوق الدور الأساسي. لا يُنتزع شيء.')}</p>
                    <div className="space-y-1.5">
                      {assignable.filter((r) => r.id !== mainRoleId).map((r) => {
                        const id = `addon-${r.id}`;
                        return (
                          <div key={r.id} className="flex items-center gap-2">
                            <Checkbox
                              id={id}
                              checked={addOnIds.includes(r.id)}
                              disabled={!editable}
                              onCheckedChange={(on) => setAddOnIds((ids) => (on === true ? [...ids, r.id] : ids.filter((x) => x !== r.id)))}
                            />
                            <Label htmlFor={id} className="text-sm font-normal">{roleLabel(r, lang)}</Label>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>

                  {person.temporary.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{tr('Temporary access', 'وصول مؤقت')}</p>
                      <ul className="space-y-0.5 text-sm text-muted-foreground">
                        {person.temporary.map((t) => (
                          <li key={`${t.id}-${t.endsAt}`}>{roleLabel(t, lang)} · {tr('until', 'حتى')} {shortDate(t.endsAt, lang)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <GroupRoles person={person} tr={tr} lang={lang} />

                  {!canManage && (
                    <p className="text-xs text-muted-foreground">{tr('Only people who manage roles can change these.', 'يغيّرها فقط من يدير الأدوار.')}</p>
                  )}
                  {editable && (
                    <div className="space-y-2 border-t pt-3">
                      <InlineError message={saveError} />
                      <div className="flex gap-2">
                        <Button onClick={save} disabled={!dirty || saving || !mainRoleId} className="gap-1.5">
                          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                          {tr('Save roles', 'حفظ الأدوار')}
                        </Button>
                        {dirty && (
                          <Button variant="ghost" onClick={() => { resetPickers(person); setSaveError(null); }} disabled={saving}>
                            {tr('Discard', 'تجاهل')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function GroupRoles({ person, tr, lang }: { person: PersonDetail; tr: Tr; lang: 'en' | 'ar' }) {
  if (!person.groupRoles.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">{tr('From the group', 'من المجموعة')}</p>
      <ul className="space-y-0.5 text-sm text-muted-foreground">
        {person.groupRoles.map((g) => (
          <li key={`${g.holdingGroupId}-${g.key}`}>
            {g.name}
            {g.isMain ? ` · ${tr('main', 'أساسي')}` : ` · ${tr('add-on', 'إضافة')}`}
            {g.endsAt ? ` · ${tr('until', 'حتى')} ${shortDate(g.endsAt, lang)}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
