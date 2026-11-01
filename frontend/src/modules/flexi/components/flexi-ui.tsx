'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/context/i18n-context';
import type { FlexiState } from '@/services/flexiService';

export type Tr = (en: string, ar: string) => string;

/** Bilingual inline strings, as the rest of the staff app does. */
export function useTr(): { tr: Tr; language: string } {
  const { language } = useI18n();
  const tr = React.useCallback<Tr>((en, ar) => (language === 'ar' ? ar : en), [language]);
  return { tr, language };
}

export const money = (n: number | null | undefined, currency: string, lang: string) =>
  n === null || n === undefined ? '…' : new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 3 }).format(n);

export const shortDate = (iso: string | null | undefined, lang: string) =>
  iso ? new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '…';

const STATE_STYLE: Record<FlexiState, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  frozen: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  closed: 'bg-muted text-muted-foreground',
};

export const stateLabel = (s: FlexiState, tr: Tr) => ({ active: tr('Active', 'نشط'), frozen: tr('Frozen', 'موقوف مؤقتًا'), closed: tr('Closed', 'مغلق') }[s]);

export function StateBadge({ state, tr }: { state: FlexiState | null; tr: Tr }) {
  if (!state) return null;
  return <Badge variant="outline" className={`border-transparent ${STATE_STYLE[state]}`}>{stateLabel(state, tr)}</Badge>;
}

/** How much of the balance is used; amber from 80%, red at 100%. */
export function UsageBar({ pct }: { pct: number }) {
  const width = Math.max(0, Math.min(100, pct));
  const tone = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="presentation">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/** Loads one thing for the selected company and reloads on demand. */
export function useCompanyLoad<T>(companyId: string | undefined, load: (companyId: string) => Promise<T>, onError: (message: string) => void) {
  const [data, setData] = React.useState<T | null>(null);
  const [failed, setFailed] = React.useState(false);
  const reload = React.useCallback(() => {
    if (!companyId) return;
    load(companyId).then((d) => { setData(d); setFailed(false); }).catch((error) => { setFailed(true); onError(error instanceof Error ? error.message : String(error)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);
  React.useEffect(reload, [reload]);
  return { data, failed, reload, setData };
}
