'use client';

/**
 * Settings → People: everyone in the company with their main role, add-ons
 * and temporary access, flagged when they are not linked to an HR record or
 * hold a role that still needs review. People who reach the company only
 * through the group are listed after the members, read-only, "Via group".
 */
import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Plus, Search } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { listPeople, listRoles, type Person, type Role } from '@/services/authzService';
import { usePermissions } from '@/context/permissions-context';
import {
  AccessHeader,
  Chip,
  countLabel,
  EmptyState,
  EngineNotice,
  ErrorState,
  ListSkeleton,
  errorText,
  roleLabel,
  shortDate,
  useLegacyDecides,
  useTr,
  type Tr,
} from './shared';

/** Whether a person's main role waits for switch-over: a custom role while the old engine decides. */
export const waitsForSwitchOver = (legacy: boolean, mainRoleId: string | undefined, roles: readonly Role[]) =>
  Boolean(legacy && mainRoleId && roles.find((r) => r.id === mainRoleId)?.kind === 'custom');

export function SwitchOverChip({ tr }: { tr: Tr }) {
  return (
    <Chip tone="info" title={tr(
      'While the old permission engine decides, this person\'s company role still applies.',
      'ما دام نظام الصلاحيات القديم هو الحاكم، يبقى دور الشخص في الشركة هو المطبَّق.',
    )}
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      {tr('Takes effect at switch-over', 'يسري عند التحويل')}
    </Chip>
  );
}

/**
 * `quietHr`: when nobody in the company is linked to HR yet, the flag is a
 * fact about the company, not a warning about this person (the count line
 * above the list says it once).
 */
export function PersonFlags({ person, tr, quietHr = false }: { person: Person; tr: Tr; quietHr?: boolean }) {
  const needsReview = [person.mainRole, ...person.addOns].some((r) => r?.needsReview);
  return (
    <>
      {!person.linkedToHr && !person.readOnly && (
        <Chip tone={quietHr ? 'neutral' : 'warn'}>
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {tr('Not linked to an HR record', 'غير مرتبط بسجل موظف')}
        </Chip>
      )}
      {needsReview && (
        <Chip tone="warn">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {tr('Needs review — not counted yet', 'بحاجة إلى مراجعة — لا يُحتسب بعد')}
        </Chip>
      )}
    </>
  );
}

const initials = (name: string | null) => (name ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function PeoplePage() {
  const { tr, lang } = useTr();
  const { isRtl } = useI18n();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? null;
  const legacy = useLegacyDecides();
  const canManage = usePermissions().canAdmin('people.manage_roles');

  const [people, setPeople] = React.useState<Person[] | null>(null);
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    if (!companyId) return;
    let active = true;
    setPeople(null);
    setError(null);
    Promise.all([listPeople(companyId), listRoles(companyId)])
      .then(([p, r]) => { if (active) { setPeople(p); setRoles(r); } })
      .catch((e: unknown) => { if (active) setError(errorText(e, tr('Could not load people.', 'تعذّر تحميل الأشخاص.'))); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, nonce]);

  const q = query.trim().toLowerCase();
  const shown = (people ?? []).filter((p) => !q
    || (p.name ?? '').toLowerCase().includes(q)
    || (p.email ?? '').toLowerCase().includes(q)
    || (p.mainRole && roleLabel(p.mainRole, lang).toLowerCase().includes(q)));
  const unlinked = (people ?? []).filter((p) => !p.readOnly && !p.linkedToHr).length;
  const members = (people ?? []).filter((p) => !p.readOnly).length;
  const Chevron = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <AccessHeader
        title={tr('People', 'الأشخاص')}
        description={canManage
          ? tr(
            `Who can do what in ${selectedCompany?.name ?? 'this company'}. Open someone to see why and to change their roles.`,
            `من يستطيع فعل ماذا في ${selectedCompany?.name ?? 'هذه الشركة'}. افتح أي شخص لترى السبب ولتغيير أدواره.`,
          )
          : tr(
            `Who can do what in ${selectedCompany?.name ?? 'this company'}. Open someone to see why.`,
            `من يستطيع فعل ماذا في ${selectedCompany?.name ?? 'هذه الشركة'}. افتح أي شخص لترى السبب.`,
          )}
      />
      <EngineNotice />

      {error && <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />}
      {!people && !error && <ListSkeleton />}

      {people && (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr('Search by name, email or role', 'ابحث بالاسم أو البريد أو الدور')}
                aria-label={tr('Search people', 'البحث عن الأشخاص')}
                className="ps-9"
              />
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {countLabel(people.length, 'people', lang)}
              {unlinked > 0 && (unlinked === members
                ? tr(' · nobody is linked to an HR record yet', ' · لا أحد مرتبط بسجل موظف بعد')
                : tr(` · ${unlinked} not linked to HR`, ` · ${unlinked} غير مرتبطين بالموارد البشرية`))}
            </p>
          </div>

          {shown.length === 0 ? (
            <EmptyState title={q ? tr('Nobody matches', 'لا نتائج مطابقة') : tr('No people yet', 'لا يوجد أشخاص بعد')}>
              {q
                ? tr('Try another name or role.', 'جرّب اسمًا أو دورًا آخر.')
                : tr('People added under Users appear here.', 'يظهر هنا الأشخاص المضافون من صفحة المستخدمين.')}
            </EmptyState>
          ) : (
            <ul className="divide-y rounded-lg border">
              {shown.map((person) => (
                <li key={person.userId}>
                  <Link
                    href={`/settings/people/${encodeURIComponent(person.userId)}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      {person.avatar && <AvatarImage src={person.avatar} alt="" />}
                      <AvatarFallback className="text-xs">{initials(person.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center sm:gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{person.name ?? person.email}</p>
                        <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                      </div>
                      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 sm:mt-0">
                        <PersonRoles person={person} roles={roles} legacy={legacy} tr={tr} lang={lang} />
                        <PersonFlags person={person} tr={tr} quietHr={unlinked === members} />
                      </div>
                    </div>
                    <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function PersonRoles({ person, roles, legacy, tr, lang }: { person: Person; roles: Role[]; legacy: boolean; tr: Tr; lang: 'en' | 'ar' }) {
  if (person.readOnly) {
    const main = person.groupRoles.find((g) => g.isMain) ?? person.groupRoles[0];
    return (
      <>
        {main && <span className="text-sm">{roleLabel(main, lang)}</span>}
        <Chip tone="info">{tr(`Via group ${person.viaGroup?.name ?? ''}`, `عبر المجموعة ${person.viaGroup?.name ?? ''}`).trim()}</Chip>
      </>
    );
  }
  return (
    <>
      <span className="text-sm">
        {person.mainRole ? roleLabel(person.mainRole, lang) : <span className="text-muted-foreground">{tr('No main role', 'بلا دور أساسي')}</span>}
      </span>
      {waitsForSwitchOver(legacy, person.mainRole?.id, roles) && <SwitchOverChip tr={tr} />}
      {person.addOns.map((a) => (
        <Chip key={a.id}><Plus className="h-3 w-3" aria-hidden="true" />{roleLabel(a, lang)}</Chip>
      ))}
      {/* M-8: add-ons and group roles grant nothing while the old engine decides. */}
      {legacy && (person.addOns.length > 0 || person.groupRoles.length > 0) && <SwitchOverChip tr={tr} />}
      {person.temporary.map((t) => (
        <Chip key={`${t.id}-${t.endsAt}`} title={t.reason ?? undefined}>
          <Clock className="h-3 w-3" aria-hidden="true" />
          {roleLabel(t, lang)} · {tr('until', 'حتى')} {shortDate(t.endsAt, lang)}
        </Chip>
      ))}
      {person.groupRoles.length > 0 && (
        <Chip tone="info">{tr(`Group: ${person.groupRoles.map((g) => g.name).join(', ')}`, `المجموعة: ${person.groupRoles.map((g) => roleLabel(g, 'ar')).join('، ')}`)}</Chip>
      )}
    </>
  );
}
