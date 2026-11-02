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
  return match[1].split(/, | or /).map((r) => r.trim().replace(/^an? /, '')).filter(Boolean);
}

/** One permission given beyond the actor (backend authz/describe.ts Excess). */
interface Excess { key: string; scope?: string; limit?: number | null }

const SCOPE_PHRASE: Record<string, Label> = {
  own: { en: ' (own records)', ar: ' (سجلاته فقط)' },
  team: { en: ' (own and team)', ar: ' (سجلاته وسجلات فريقه)' },
  group: { en: ' (every company of the group)', ar: ' (كل شركات المجموعة)' },
};

/** M-7: what exceeds, with its scope or limit; at most three, then "and N more". */
function excessText(excess: Excess[], labels: CatalogueLabels | null, lang: Lang): string {
  const ar = lang === 'ar';
  const one = (e: Excess) => {
    const name = e.key.startsWith('field:')
      ? labels?.fields[e.key.slice(6)]?.[lang] ?? e.key
      : labels?.permissions[e.key]?.[lang] ?? e.key;
    if (e.scope && SCOPE_PHRASE[e.scope]) return name + SCOPE_PHRASE[e.scope][lang];
    if (e.limit === null) return `${name} ${ar ? '(بلا حد)' : '(no limit)'}`;
    if (typeof e.limit === 'number') return `${name} ${ar ? `(حتى ${e.limit.toLocaleString('en-US')})` : `(up to ${e.limit.toLocaleString('en-US')})`}`;
    return name;
  };
  const shown = excess.slice(0, 3).map(one);
  const more = excess.length - shown.length;
  return shown.join(ar ? '؛ ' : '; ') + (more > 0 ? (ar ? `؛ و${more} أخرى` : `; and ${more} more`) : '');
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
    const article = (name: string) => (/^[aeiou]/i.test(name) ? 'an' : 'a');
    // Past three names the server ends with "an Admin" (M-6): its own article.
    const named = roles.length > 3
      ? [...roles.slice(0, -1), `${article(roles[roles.length - 1])} ${roles[roles.length - 1]}`]
      : roles;
    return `ask ${article(roles[0])} ${joinList(named, 'en')}`;
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
      if ((body as { target?: unknown }).target === true) {
        return ar
          ? 'لديه صلاحيات لا تملكها، لذا لا يمكنك تغيير أدواره — اطلب ذلك من مدير النظام.'
          : "They have access you don't, so you can't change their roles — ask an Admin.";
      }
      const raw = (body as { excess?: unknown }).excess;
      const excess: Excess[] = Array.isArray(raw)
        ? raw.filter((e): e is Excess => Boolean(e) && typeof (e as Excess).key === 'string')
        : (Array.isArray(body.missing) ? body.missing.filter((k): k is string => typeof k === 'string').map((key) => ({ key })) : []);
      const list = excessText(excess, labels, lang);
      const where = typeof (body as { where?: unknown }).where === 'string' ? (body as { where: string }).where : '';
      return ar
        ? `لا يمكنك منح صلاحيات لا تملكها بنفسك${where ? ` في ${where}` : ''}${list ? `: ${list}` : ''}.`
        : `You can't give permissions you don't have yourself${where ? ` in ${where}` : ''}${list ? `: ${list}` : ''}.`;
    }
    case 'OVER_LIMIT': {
      const b = body as { limit?: unknown; amount?: unknown; currency?: unknown };
      const money = (n: unknown) => `${typeof n === 'number' ? n.toLocaleString('en-US') : '?'}${typeof b.currency === 'string' ? ` ${b.currency}` : ''}`;
      return ar
        ? `حدّ موافقتك ${money(b.limit)} وهذا المبلغ ${money(b.amount)} — اطلب الموافقة ممن لديه حدّ أعلى.`
        : `Your approval limit is ${money(b.limit)} and this is ${money(b.amount)} — ask someone with a higher limit.`;
    }
    case 'SELF_ASSIGN':
      return ar
        ? 'لا يمكنك تغيير أدوارك على مستوى المجموعة — اطلب ذلك من مسؤول المنصة.'
        : "You can't change your own group-wide roles — ask the platform administrator.";
    case 'NO_COMPANY_ACCESS':
      return ar
        ? 'ليس لديك وصول إلى هذه الشركة — اطلب من مسؤولها إضافتك.'
        : "You don't have access to this company — ask its administrator to add you.";
    case 'LOCKOUT':
      if ((body as { lastAdmin?: unknown }).lastAdmin === true) {
        return ar
          ? 'هذا التغيير يترك الشركة بلا مدير نظام — اجعل شخصًا آخر مدير نظام أولًا.'
          : 'This change would leave the company with no Admin — make someone else Admin first.';
      }
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
