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
  /** Under v2: the names of the roles that grant it (backend authz/engine.ts forbiddenBody). */
  roles?: string[];
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

function whoToAsk(body: ForbiddenBody, lang: Lang): string {
  const message = body.message;
  // The structured list when the server sends it; the sentence as a fallback.
  const roles = Array.isArray(body.roles) ? body.roles : rolesToAsk(message);
  if (roles && roles.length) {
    if (lang === 'ar') return `اطلبها من ${joinList(roles.map((r) => ROLE_AR[r] ?? r), 'ar')}`;
    const article = /^[aeiou]/i.test(roles[0]) ? 'an' : 'a';
    return `ask ${article} ${joinList(roles, 'en')}`;
  }
  if ((roles && roles.length === 0) || /^Nobody in this company/i.test(message ?? '')) {
    return lang === 'ar' ? 'لا أحد في هذه الشركة يملكها بعد، فاطلبها من مسؤول المنصة' : 'nobody in this company has it yet, so ask the platform administrator';
  }
  return lang === 'ar' ? 'اطلبها من مسؤول الأدوار في شركتك' : 'ask whoever manages roles in your company';
}

/** One sentence: what is missing and who to ask. */
export function forbiddenSentence(body: ForbiddenBody, labels: CatalogueLabels | null, lang: Lang): string {
  const ask = whoToAsk(body, lang);
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

const permissionLabel = (key: string, labels: CatalogueLabels | null, lang: Lang) =>
  labels?.permissions[key]?.[lang] ?? key;

/**
 * One sentence for any coded refusal the staff app can meet, or null for a
 * code it does not know (the server's message is kept then).
 */
export function refusalSentence(body: ForbiddenBody & { code?: string; missing?: unknown }, labels: CatalogueLabels | null, lang: Lang): string | null {
  const ar = lang === 'ar';
  switch (body.code) {
    case 'FORBIDDEN':
      return forbiddenSentence(body, labels, lang);
    case 'HIGHER_THAN_YOU': {
      const missing = Array.isArray(body.missing) ? body.missing.filter((k): k is string => typeof k === 'string') : [];
      const list = missing.map((k) => permissionLabel(k, labels, lang)).join(ar ? '؛ ' : '; ');
      return ar
        ? `لا يمكنك منح صلاحيات لا تملكها بنفسك${list ? `: ${list}` : ''}.`
        : `You can't give permissions you don't have yourself${list ? `: ${list}` : ''}.`;
    }
    case 'NO_COMPANY_ACCESS':
      return ar
        ? 'ليس لديك وصول إلى هذه الشركة — اطلب من مسؤولها إضافتك.'
        : "You don't have access to this company — ask its administrator to add you.";
    case 'LOCKOUT':
      return ar
        ? 'هذا التغيير يترك الشركة بلا أحد يدير الأدوار — أبقِ شخصًا واحدًا على الأقل يملك «إدارة الأدوار».'
        : 'This change would leave nobody who can manage roles — keep at least one person with "Manage roles".';
    case 'SYSTEM_ROLE':
      return ar
        ? 'لا يمكن تعديل الأدوار القياسية — انسخ الدور لتصنع دورك الخاص.'
        : "Standard roles can't be changed — duplicate the role to make your own.";
    case 'GROUP_ROLE':
      return ar
        ? 'هذا الدور يأتي من المجموعة — غيّره من إعدادات المجموعة.'
        : 'This role comes from the group — change it in the group settings.';
    case 'GROUP_PERSON':
      return ar
        ? 'هذا الشخص يصل عبر المجموعة — غيّر أدواره من إعدادات المجموعة.'
        : 'This person comes through the group — change their roles in the group settings.';
    case 'ROLE_ASSIGN_FORBIDDEN':
      return ar
        ? 'لا يغيّر مدير النظام أو المدير أو المحاسب إلا من يدير الأدوار — اطلب ذلك من مدير النظام.'
        : 'Only someone who manages roles can change an Admin, Manager or Accountant — ask an Admin.';
    case 'USER_OUTSIDE_COMPANY':
      return ar
        ? 'هذا الشخص خارج الشركات التي تديرها — اطلب ذلك من مسؤول شركته.'
        : "This person is outside the companies you manage — ask their company's administrator.";
    case 'IDENTITY_SHARED':
      return ar
        ? 'هذا الشخص يعمل في شركات أخرى أيضًا، لذا يغيّر اسمه وبريده وكلمة مروره مسؤول المنصة فقط.'
        : 'This person also works in other companies, so only the platform administrator can change their name, email or password.';
    case 'SUPER_ADMIN_ONLY':
      return ar
        ? 'هذا الحساب يديره مسؤول المنصة فقط.'
        : 'Only the platform administrator can change this account.';
    default:
      return null;
  }
}
