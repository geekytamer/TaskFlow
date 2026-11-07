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
  if (!partial.length) {
    // A typo or a transliteration a letter or two off ("samatha"): the one close label, if only one is close.
    const close = rows.filter((r) => closeTo(want, norm(label(r))));
    if (close.length === 1) return close[0];
    // Typed in Arabic, stored in English (or the other way round).
    const across = rows.filter((r) => sameName(String(ref), label(r)));
    if (across.length === 1) return across[0];
    if (across.length > 1) throw new Error(`several ${kind}s match "${String(ref)}": ${across.slice(0, 8).map((r) => `${label(r)} (id ${r.id})`).join('; ')}. Ask the person which one, or pass the id.`);
  }
  if (partial.length > 1) throw new Error(`several ${kind}s match "${String(ref)}": ${partial.slice(0, 8).map((r) => `${label(r)} (id ${r.id})`).join('; ')}. Ask the person which one, or pass the id.`);
  throw new Error(`no ${kind} matches "${String(ref)}"${rows.length ? `; some there are: ${rows.slice(0, 8).map(label).join('; ')}` : ''}`);
}

/** Edit distance between two short strings (Levenshtein). */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** Whether `want` is within a letter or two of the label or of a run of its words (5+ letters asked: shorter words collide). */
function closeTo(want: string, label: string): boolean {
  if (want.length < 5) return false;
  const allowed = want.length >= 8 ? 2 : 1;
  const words = label.split(' ');
  const size = want.split(' ').length;
  for (let i = 0; i + size <= words.length; i += 1) {
    if (distance(want, words.slice(i, i + size).join(' ')) <= allowed) return true;
  }
  return distance(want, label) <= allowed;
}

const AR_LATIN: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'a', آ: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh', د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh',
  ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: '', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', ة: '', و: 'w', ي: 'y',
  ى: 'a', ء: '', ئ: '', ؤ: '',
};
const ARABIC = /[\u0600-\u06FF]/;
const FILLER = new Set(['al', 'el', 'the', 'and', 'co', 'llc', 'شركه', 'مؤسسه']);

/** A word's consonant outline, the same for "نور" and "Noor": in Latin letters, vowels (and w, y) dropped, close sounds merged. */
function outline(word: string): string {
  const latin = ARABIC.test(word) ? [...word].map((c) => AR_LATIN[c] ?? '').join('') : word.toLowerCase();
  return latin.replace(/[^a-z]/g, '').replace(/q|c(?!h)/g, 'k').replace(/ph/g, 'f').replace(/[aeiouwy]/g, '').replace(/(.)\1+/g, '$1');
}

function outlines(text: string): string[] {
  const arabic = ARABIC.test(text);
  return norm(text).split(/[\s\-_.,/]+/)
    .map((w) => (arabic ? w.replace(/^(وال|بال|لل|ال)/, '') : w))
    .filter((w) => w && !FILLER.has(w))
    .map(outline)
    .filter((o) => o.length >= 2);
}

/**
 * A name typed in one script naming a record stored in the other ("النور للأغذية"
 * → "Al Noor Foods", "أحمد البلوشي" → "Ahmed Al Balushi"): some word sounds the same.
 * Same-script names are the ordinary match's job; this one says false for them.
 */
export function sameName(typed: string, stored: string): boolean {
  if (!typed || !stored || ARABIC.test(typed) === ARABIC.test(stored)) return false;
  const typedOutlines = new Set(outlines(typed));
  return outlines(stored).some((o) => typedOutlines.has(o));
}

/** A company path: co(ctx, '/invoices') → /companies/<id>/invoices. */
export const co = (ctx: Pick<RecipeContext, 'companyId'>, rest: string): string => `/companies/${encodeURIComponent(ctx.companyId)}${rest}`;

/** A colleague's user id from their name, an id, or "me". */
/** The member list, read once per recipe call (a batch of 25 tasks reads it once). */
const membersOf = new WeakMap<RecipeContext, Promise<Array<{ id: string; name: string }>>>();

const SELF_WORDS = ['me', 'myself', 'انا', 'لي', 'نفسي'];

const membersList = (ctx: RecipeContext): Promise<Array<{ id: string; name: string }>> => {
  let members = membersOf.get(ctx);
  if (!members) {
    members = ctx.get<Array<{ id: string; name: string }>>(co(ctx, '/members'));
    membersOf.set(ctx, members);
  }
  return members;
};

/** A word as typed, without the Arabic letters glued to its front (لِ، و، ب، ف، ال): "لبعرب" → "بعرب", "ليعرب" → "يعرب". */
function bareWords(text: string): string[] {
  const words = norm(text).split(/[\s\-_.,/:;!?،؟]+/).filter(Boolean);
  const out = new Set<string>();
  for (const w of words) {
    out.add(w);
    if (ARABIC.test(w)) {
      const stripped = w.replace(/^(وال|بال|فال|لل|ال)/, '');
      out.add(stripped);
      if (stripped.length >= 4 && /^[ولبف]/.test(stripped)) out.add(stripped.slice(1));
    }
  }
  return [...out].filter((w) => w.length >= 3);
}

/**
 * Whether a typed word means a name word: the same, or (4+ letters) one letter
 * off — "بعرب" for "يعرب", the next key on an Arabic keyboard — or the same name
 * in the other script.
 */
function wordNames(typed: string, nameWord: string): boolean {
  if (typed === nameWord) return true;
  if (typed.length >= 4 && nameWord.length >= 4 && Math.abs(typed.length - nameWord.length) <= 1 && distance(typed, nameWord) <= 1) return true;
  if (sameName(typed, nameWord)) return true;
  // Typed in Arabic with a stray first letter, stored in English ("بعرب" for Yarub). Only the first
  // letter: dropping any letter makes ordinary words sound like names ("عشان" → Aisha).
  return ARABIC.test(typed) && !ARABIC.test(nameWord) && typed.length >= 4 && sameName(typed.slice(1), nameWord);
}

/** Colleagues the person names in their request (not themselves): first or any 3+ letter name word, typos of one letter allowed. */
export async function membersNamed(ctx: RecipeContext, text: string): Promise<Array<{ id: string; name: string }>> {
  const typed = bareWords(text);
  if (!typed.length) return [];
  return (await membersList(ctx)).filter((m) => m.id !== ctx.userId && norm(m.name).split(' ')
    .map((w) => w.replace(/^(ال)/, ''))
    .filter((w) => w.length >= 3 && !FILLER.has(w))
    .some((w) => typed.some((t) => wordNames(t, w))));
}

/** Whether the person's words say the thing is for themselves ("for me", "لي", "نفسي"). */
export const saysSelf = (text: string): boolean => norm(text).split(/[\s,.،]+/).some((w) => SELF_WORDS.includes(w));

export async function memberId(ctx: RecipeContext, ref: unknown): Promise<string> {
  if (SELF_WORDS.includes(norm(ref))) return ctx.userId;
  const members = await membersList(ctx);
  try {
    return pickOne(members, ref, (m) => m.name, 'person').id;
  } catch (error) {
    // A name a letter off, or with "ل" in front ("لبعرب"): the one colleague it can mean.
    const named = await membersNamed(ctx, String(ref ?? ''));
    if (named.length === 1) return named[0].id;
    throw error;
  }
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
