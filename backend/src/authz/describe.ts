/**
 * Words for people: the level presets a role editor offers per area, the
 * plain-language summary of what someone may do, and the "no higher than me"
 * comparison. All of it is derived from the catalogue (no per-area text here).
 *
 * Levels (spec §5: None / View / Edit / Full / Custom), per area:
 *   - view: the area's `view` and `view_*` actions and `print`;
 *   - edit: view plus the everyday working actions (create, edit, send,
 *     export, invoice, use_workspace, handle_requests);
 *   - full: every action of the area.
 * Anything else (delete, approve, pay, void, cancel, post, manage, settings,
 * overrides) only comes with Full or Custom. A set of actions matching no
 * preset is Custom.
 */
import { CATALOGUE, SCOPES, SENSITIVE_FIELDS, findAction, permissionKey, type AreaDef, type Label, type Scope } from './catalogue';
import type { CompanyEffective } from './evaluate';
import type { TemplateField, TemplateGrant } from './templates';

export const LEVELS = ['none', 'view', 'edit', 'full'] as const;
export type Level = (typeof LEVELS)[number];

const EDIT_ACTIONS = new Set(['create', 'edit', 'send', 'export', 'invoice', 'use_workspace', 'handle_requests']);

const isViewAction = (action: string) => action === 'view' || action.startsWith('view_') || action === 'print';

/** Which permission keys each level means for an area. */
export function levelPresets(area: AreaDef): Record<Level, string[]> {
  const keys = (pick: (action: string) => boolean) =>
    area.actions.filter((a) => pick(a.key)).map((a) => permissionKey(area.key, a.key));
  return {
    none: [],
    view: keys(isViewAction),
    edit: keys((a) => isViewAction(a) || EDIT_ACTIONS.has(a)),
    full: keys(() => true),
  };
}

/** The level a set of held keys amounts to in an area, or 'custom'. */
export function levelOf(area: AreaDef, held: ReadonlySet<string>): Level | 'custom' {
  const mine = area.actions.map((a) => permissionKey(area.key, a.key)).filter((k) => held.has(k)).sort();
  const presets = levelPresets(area);
  for (const level of [...LEVELS].reverse()) {
    const preset = [...presets[level]].sort();
    if (preset.length === mine.length && preset.every((k, i) => k === mine[i])) return level;
  }
  return 'custom';
}

export const SCOPE_LABELS: Readonly<Record<Scope, Label>> = {
  own: { en: 'Own', ar: 'الخاصة' },
  team: { en: 'Team', ar: 'الفريق' },
  company: { en: 'Whole company', ar: 'كامل الشركة' },
  group: { en: 'Whole group', ar: 'كامل المجموعة' },
};

const scopePhrase: Readonly<Record<Scope, Label>> = {
  own: { en: ' (own records)', ar: ' (سجلاته فقط)' },
  team: { en: ' (own and team)', ar: ' (سجلاته وسجلات فريقه)' },
  company: { en: '', ar: '' },
  group: { en: ' (every company of the group)', ar: ' (كل شركات المجموعة)' },
};

/** First letter only: the catalogue's own capitals stay ("employees and HR"). */
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const LEVEL_PHRASE: Readonly<Record<'view' | 'edit' | 'full' | 'custom', (area: Label) => Label>> = {
  view: (a) => ({ en: `Sees ${lower(a.en)}`, ar: `يطّلع على ${a.ar}` }),
  edit: (a) => ({ en: `Works on ${lower(a.en)}`, ar: `يعمل على ${a.ar}` }),
  full: (a) => ({ en: `Full access to ${lower(a.en)}`, ar: `صلاحية كاملة على ${a.ar}` }),
  custom: (a) => ({ en: `Some access to ${lower(a.en)}`, ar: `صلاحيات محددة على ${a.ar}` }),
};


/**
 * One line per area the person has anything in ("Sees sales", "Full access to
 * purchasing"), the widest scope of the area's scoped grants, then each limited
 * approve-style action ("Approve ... up to 5000"), then one line naming the
 * sensitive information they cannot see. English and Arabic side by side.
 */
export function summaryLines(company: CompanyEffective | undefined): Label[] {
  const grants = company?.grants ?? new Map();
  const held = new Set(grants.keys());
  const lines: Label[] = [];
  for (const area of CATALOGUE) {
    if (!area.actions.some((a) => held.has(permissionKey(area.key, a.key)))) continue;
    const level = levelOf(area, held);
    if (level === 'none') continue;
    const scopes = area.actions
      .filter((a) => a.scoped)
      .map((a) => grants.get(permissionKey(area.key, a.key))?.scope as Scope | undefined)
      .filter((s): s is Scope => Boolean(s));
    const widest = scopes.length ? scopes.reduce((a, b) => (SCOPES.indexOf(b) > SCOPES.indexOf(a) ? b : a)) : 'company';
    const line = LEVEL_PHRASE[level](area.label);
    lines.push({ en: line.en + scopePhrase[widest].en, ar: line.ar + scopePhrase[widest].ar });
    for (const action of area.actions) {
      const grant = grants.get(permissionKey(area.key, action.key));
      if (!action.limit || grant?.limit === undefined) continue;
      const amount = action.limit === 'percent' ? `${grant.limit}%` : String(grant.limit);
      lines.push({ en: `${action.label.en} up to ${amount}`, ar: `${action.label.ar} حتى ${amount}` });
    }
  }
  const hidden = SENSITIVE_FIELDS.filter((f) => !company?.fields.get(f.key)?.view);
  if (hidden.length) {
    lines.push({
      en: `Can't see ${hidden.map((f) => lower(f.label.en)).join('; ')}`,
      ar: `لا يرى ${hidden.map((f) => f.label.ar).join('؛ ')}`,
    });
  }
  return lines;
}

/**
 * What a role (or set of roles) gives beyond what the actor holds in the
 * company: missing keys, a wider scope, a higher (or no) limit, a sensitive
 * field view/edit. Returned as permission names ('sales.view', 'field:salary').
 */
export function beyond(
  actor: CompanyEffective | undefined,
  grants: readonly TemplateGrant[],
  fields: readonly TemplateField[],
): string[] {
  const out: string[] = [];
  for (const g of grants) {
    const mine = actor?.grants.get(g.key);
    if (!mine) { out.push(g.key); continue; }
    if (g.scope && SCOPES.indexOf(g.scope) > SCOPES.indexOf(mine.scope ?? 'company')) { out.push(g.key); continue; }
    if (mine.limit !== undefined && (g.limit === undefined || g.limit === null || g.limit > mine.limit)) out.push(g.key);
  }
  for (const f of fields) {
    const mine = actor?.fields.get(f.key);
    if ((f.view && !mine?.view) || (f.edit && !mine?.edit)) out.push(`field:${f.key}`);
  }
  return [...new Set(out)];
}

/** A permission name for people: the action's or the field's English label. */
export function permissionLabel(name: string): Label {
  if (name.startsWith('field:')) {
    const f = SENSITIVE_FIELDS.find((x) => x.key === name.slice(6));
    if (f) return f.label;
  }
  const found = findAction(name);
  return found ? found.action.label : { en: name, ar: name };
}
