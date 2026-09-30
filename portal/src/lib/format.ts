import type { Lang } from './i18n';

/** Arabic text with Latin digits: the convention for business figures in the Gulf. */
const locale = (lang: Lang) => (lang === 'ar' ? 'ar-u-nu-latn' : 'en');

const MISSING = '-';

export function formatCompact(value: number | null, lang: Lang): string {
  if (value === null) return MISSING;
  return new Intl.NumberFormat(locale(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Engagement is stored as a percentage already (4.2 means 4.2%). */
export function formatPercent(value: number | null, lang: Lang): string {
  if (value === null) return MISSING;
  return `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatMoney(amount: number, currency: string, lang: Lang): string {
  try {
    return new Intl.NumberFormat(locale(lang), {
      style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** A calendar date. Date-only strings are read as that day in UTC, so the day never shifts by timezone. */
export function formatDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return MISSING;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return MISSING;
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export const CATALOGUE_FILTERS = ['q', 'platform', 'niche', 'availability', 'minFollowers'] as const;
export type CatalogueFilters = Partial<Record<(typeof CATALOGUE_FILTERS)[number], string>>;

/** A query string of known, non-empty filters, safe to append to the backend path. */
export function catalogueQuery(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const key of CATALOGUE_FILTERS) {
    const raw = params[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}
