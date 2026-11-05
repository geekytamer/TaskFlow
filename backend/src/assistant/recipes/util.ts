import type { RecipeContext } from './types';

/** Lower case; Arabic diacritics, tatweel and quotes removed; alef, ya and ta marbuta unified; single spaces. */
export function norm(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/["'“”‘’«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The args object: a bare string or number becomes { text }, an array { list }. */
export function argsOf(args: unknown): Record<string, unknown> {
  if (typeof args === 'string' || typeof args === 'number') return { text: String(args) };
  if (Array.isArray(args)) return { list: args };
  return args && typeof args === 'object' ? (args as Record<string, unknown>) : {};
}

export const say = (ctx: Pick<RecipeContext, 'lang'>, en: string, ar: string): string => (ctx.lang === 'ar' ? ar : en);

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayOf = (value: unknown): string | undefined => (value ? String(value).slice(0, 10) : undefined);

/** 'today' | 'tomorrow' | 'yesterday' | YYYY-MM-DD (also اليوم, غدا, بكرة, امس) → YYYY-MM-DD. */
export function dateArg(ctx: Pick<RecipeContext, 'today'>, value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const v = norm(value);
  if (v === 'today' || v === 'اليوم') return ctx.today;
  if (v === 'tomorrow' || v === 'غدا' || v === 'بكره') return addDays(ctx.today, 1);
  if (v === 'yesterday' || v === 'امس') return addDays(ctx.today, -1);
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  throw new Error(`${field} must be YYYY-MM-DD, 'today' or 'tomorrow' (got "${String(value)}")`);
}

/**
 * The one row a name or id means: the id, then an exact label, then a single
 * partial match. Several or none → an error naming what there is, so the
 * model can ask the person or pass the id.
 */
export function pickOne<T extends { id: string }>(rows: T[], ref: unknown, label: (r: T) => string, kind: string): T {
  const want = norm(ref);
  if (!want) throw new Error(`say which ${kind} (its name or id)`);
  const byId = rows.find((r) => r.id === String(ref));
  if (byId) return byId;
  const exact = rows.filter((r) => norm(label(r)) === want);
  if (exact.length === 1) return exact[0];
  const partial = exact.length ? exact : rows.filter((r) => {
    const l = norm(label(r));
    return l.length > 0 && (l.includes(want) || (l.length >= 3 && want.includes(l)));
  });
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`several ${kind}s match "${String(ref)}": ${partial.slice(0, 8).map((r) => `${label(r)} (id ${r.id})`).join('; ')}. Ask the person which one, or pass the id.`);
  throw new Error(`no ${kind} matches "${String(ref)}"${rows.length ? `; some there are: ${rows.slice(0, 8).map(label).join('; ')}` : ''}`);
}

/** A company path: co(ctx, '/invoices') → /companies/<id>/invoices. */
export const co = (ctx: Pick<RecipeContext, 'companyId'>, rest: string): string => `/companies/${encodeURIComponent(ctx.companyId)}${rest}`;

/** A colleague's user id from their name, an id, or "me". */
/** The member list, read once per recipe call (a batch of 25 tasks reads it once). */
const membersOf = new WeakMap<RecipeContext, Promise<Array<{ id: string; name: string }>>>();

export async function memberId(ctx: RecipeContext, ref: unknown): Promise<string> {
  if (['me', 'myself', 'انا', 'لي', 'نفسي'].includes(norm(ref))) return ctx.userId;
  let members = membersOf.get(ctx);
  if (!members) {
    members = ctx.get<Array<{ id: string; name: string }>>(co(ctx, '/members'));
    membersOf.set(ctx, members);
  }
  return pickOne(await members, ref, (m) => m.name, 'person').id;
}

/** One of the allowed values, matched without case; undefined when not given. */
export function oneOf(value: unknown, allowed: readonly string[], field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const hit = allowed.find((a) => a.toLowerCase() === String(value).toLowerCase());
  if (!hit) throw new Error(`${field} must be one of ${allowed.join('|')} (got "${String(value)}")`);
  return hit;
}

/** Money to 3 decimals (OMR has baisa). */
export const round = (n: number): number => Math.round(n * 1000) / 1000;
