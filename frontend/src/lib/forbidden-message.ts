/**
 * The sentence shown when the server refuses an action (403 FORBIDDEN): what
 * was missing, in the person's language, and who to ask. Never a bare "403".
 *
 * The server's 403 body is { code: 'FORBIDDEN', permission, message }.
 * `permission` is a catalogue key ('sales.delete') or 'field:<sensitive field>';
 * under v2 `message` names the roles that can grant it ("Ask an Admin or
 * Manager."), otherwise it is a generic English sentence.
 */

export type Lang = 'en' | 'ar';
export interface Label { en: string; ar: string }

/** Catalogue labels by key: permission keys and sensitive-field keys. */
export interface CatalogueLabels {
  permissions: Record<string, Label>;
  fields: Record<string, Label>;
}

export interface ForbiddenBody {
  code?: string;
  permission?: string | null;
  message?: string;
}

/** The standard roles' Arabic names (backend authz/templates.ts); custom role names stay as written. */
const ROLE_AR: Record<string, string> = {
  Owner: 'المالك',
  Admin: 'مدير النظام',
  Manager: 'مدير',
  Accountant: 'محاسب',
  Employee: 'موظف',
};

export function isForbiddenBody(value: unknown): value is ForbiddenBody {
  return Boolean(value) && typeof value === 'object' && (value as ForbiddenBody).code === 'FORBIDDEN';
}

/** Role names from the server's "Ask an Admin or Manager." (v2), else null. */
export function rolesToAsk(message: string | undefined): string[] | null {
  const match = /^Ask an? (.+)\.$/.exec((message ?? '').trim());
  if (!match) return null;
  return match[1].split(/, | or /).map((r) => r.trim()).filter(Boolean);
}

function joinList(items: string[], lang: Lang): string {
  if (items.length <= 1) return items[0] ?? '';
  const or = lang === 'ar' ? ' أو ' : ' or ';
  return `${items.slice(0, -1).join(lang === 'ar' ? '، ' : ', ')}${or}${items[items.length - 1]}`;
}

function whoToAsk(message: string | undefined, lang: Lang): string {
  const roles = rolesToAsk(message);
  if (roles && roles.length) {
    if (lang === 'ar') return `اطلبها من ${joinList(roles.map((r) => ROLE_AR[r] ?? r), 'ar')}`;
    const article = /^[aeiou]/i.test(roles[0]) ? 'an' : 'a';
    return `ask ${article} ${joinList(roles, 'en')}`;
  }
  if (/^Nobody in this company/i.test(message ?? '')) {
    return lang === 'ar' ? 'لا أحد في هذه الشركة يملكها بعد، فاطلبها من مسؤول المنصة' : 'nobody in this company has it yet, so ask the platform administrator';
  }
  return lang === 'ar' ? 'اطلبها من مسؤول الأدوار في شركتك' : 'ask whoever manages roles in your company';
}

/** One sentence: what is missing and who to ask. */
export function forbiddenSentence(body: ForbiddenBody, labels: CatalogueLabels | null, lang: Lang): string {
  const ask = whoToAsk(body.message, lang);
  const permission = body.permission ?? '';
  if (permission.startsWith('field:')) {
    const label = labels?.fields[permission.slice(6)]?.[lang];
    if (label) {
      return lang === 'ar'
        ? `لا يمكنك تغيير «${label}» — ${ask}.`
        : `You can't change "${label}" — ${ask}.`;
    }
  }
  const label = permission ? labels?.permissions[permission]?.[lang] : undefined;
  if (label) {
    return lang === 'ar'
      ? `تحتاج إلى صلاحية «${label}» — ${ask}.`
      : `You need the permission "${label}" — ${ask}.`;
  }
  return lang === 'ar'
    ? `ليست لديك صلاحية لهذا الإجراء — ${ask}.`
    : `You don't have permission to do this — ${ask}.`;
}

/** Labels from GET /permissions/catalogue. */
export function labelsFromCatalogue(catalogue: {
  areas?: Array<{ actions?: Array<{ key: string; label: Label }> }>;
  fields?: Array<{ key: string; label: Label }>;
}): CatalogueLabels {
  const permissions: Record<string, Label> = {};
  for (const area of catalogue.areas ?? []) {
    for (const action of area.actions ?? []) permissions[action.key] = action.label;
  }
  const fields: Record<string, Label> = {};
  for (const field of catalogue.fields ?? []) fields[field.key] = field.label;
  return { permissions, fields };
}
