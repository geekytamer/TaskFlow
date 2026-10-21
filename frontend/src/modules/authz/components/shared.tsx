'use client';

/**
 * Pieces shared by the People, Roles and Group screens: the header with the
 * section tabs, the notice shown while the new permission engine is not yet
 * deciding, loading/empty/error states, and the catalogue and group lookups.
 */
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Info, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/context/i18n-context';
import { useCompany } from '@/context/company-context';
import { usePermissions } from '@/context/permissions-context';
import { cn } from '@/lib/utils';
import {
  fetchAuthzCatalogue,
  listHoldingGroups,
  type Catalogue,
  type HoldingGroup,
  type Label,
} from '@/services/authzService';

export type Tr = (en: string, ar: string) => string;

export function useTr() {
  const { language } = useI18n();
  const lang: 'en' | 'ar' = language === 'ar' ? 'ar' : 'en';
  const tr = React.useCallback<Tr>((en, ar) => (lang === 'ar' ? ar : en), [lang]);
  return { tr, lang };
}

export const pick = (label: Label | null | undefined, lang: 'en' | 'ar') => (label ? label[lang] || label.en : '');

/** A role's name in the reader's language (Arabic falls back to the English name). */
export const roleLabel = (role: { name: string; nameAr?: string | null }, lang: 'en' | 'ar') =>
  (lang === 'ar' && role.nameAr ? role.nameAr : role.name);

/** A date as "12 Nov 2026" / "١٢ نوفمبر ٢٠٢٦"; '' for none or unparseable. */
export function shortDate(value: string | null | undefined, lang: 'en' | 'ar') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const errorText = (error: unknown, fallback: string) =>
  (error instanceof Error && error.message ? error.message : fallback);

// ── Catalogue (one request per session) ──────────────────────────────

let cataloguePromise: Promise<Catalogue> | null = null;

export function useCatalogue() {
  const [catalogue, setCatalogue] = React.useState<Catalogue | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    cataloguePromise ??= fetchAuthzCatalogue();
    cataloguePromise
      .then((c) => { if (active) { setCatalogue(c); setError(null); } })
      .catch((e: unknown) => {
        cataloguePromise = null;
        if (active) setError(errorText(e, 'Could not load the catalogue.'));
      });
    return () => { active = false; };
  }, [nonce]);
  return { catalogue, error, retry: () => setNonce((n) => n + 1) };
}

// ── Holding groups the signed-in person administers ──────────────────

const groupsCache = new Map<string, Promise<HoldingGroup[]>>();

/** The groups I administer (all of them for the super admin). Empty for everyone else. */
export function useMyHoldingGroups() {
  const { currentUser } = useCompany();
  const userId = currentUser?.id ?? null;
  const [groups, setGroups] = React.useState<HoldingGroup[] | null>(null);
  React.useEffect(() => {
    if (!userId) { setGroups(null); return; }
    let active = true;
    if (!groupsCache.has(userId)) groupsCache.set(userId, listHoldingGroups().catch(() => []));
    groupsCache.get(userId)!.then((g) => { if (active) setGroups(g); });
    return () => { active = false; };
  }, [userId]);
  return { groups: groups ?? [], loading: groups === null };
}

// ── Layout ───────────────────────────────────────────────────────────

const TABS = [
  { href: '/settings/people', en: 'People', ar: 'الأشخاص' },
  { href: '/settings/roles', en: 'Roles', ar: 'الأدوار' },
  { href: '/settings/group', en: 'Group', ar: 'المجموعة' },
] as const;

/** Page title, one-line description, and People / Roles / Group tabs (each only where the person may open it). */
export function AccessHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  const { tr } = useTr();
  const pathname = usePathname() ?? '';
  const { canAdmin } = usePermissions();
  const { groups } = useMyHoldingGroups();
  const tabs = TABS.filter((t) => (t.href === '/settings/group' ? groups.length > 0 : canAdmin('people.view_roles')));
  return (
    <header className="space-y-4 pb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="font-headline text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {tabs.length > 1 && (
        <nav aria-label={tr('Access settings', 'إعدادات الوصول')} className="flex gap-1 border-b">
          {tabs.map((t) => {
            const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tr(t.en, t.ar)}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

/**
 * While legacy (or shadow) decides, role changes are recorded but each
 * person's company role still decides (spec §5, known limits of the 1a API).
 */
export function EngineNotice() {
  const { engine } = usePermissions();
  const { tr } = useTr();
  if (!engine || engine === 'v2') return null;
  return (
    <div role="note" className="mb-5 flex gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-muted-foreground">
        {tr(
          'Changes here take effect when the new permission engine is switched on; today access still follows each person\'s company role.',
          'تسري التغييرات هنا عند تشغيل نظام الصلاحيات الجديد؛ أما اليوم فما زال الوصول يتبع دور كل شخص في الشركة.',
        )}
      </p>
    </div>
  );
}

/** True while the old engine decides (custom main roles wait for switch-over). */
export function useLegacyDecides() {
  const { engine } = usePermissions();
  return Boolean(engine) && engine !== 'v2';
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { tr } = useTr();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center">
      <span className="flex flex-1 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        {message}
      </span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {tr('Try again', 'إعادة المحاولة')}
        </Button>
      )}
    </div>
  );
}

/** An inline refusal or failure next to the control that caused it. */
export function InlineError({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn('flex items-start gap-2 text-sm text-destructive', className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  const { tr } = useTr();
  return (
    <div className="space-y-2" aria-busy="true" aria-label={tr('Loading', 'جارٍ التحميل')}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
    </div>
  );
}

/** A small neutral chip (add-ons, flags) — quieter than a Badge. */
export function Chip({ children, tone = 'neutral', className, title }: {
  children: React.ReactNode;
  tone?: 'neutral' | 'warn' | 'info';
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-md border px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-secondary/60 text-secondary-foreground',
        tone === 'warn' && 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
        tone === 'info' && 'border-primary/30 bg-primary/5 text-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
