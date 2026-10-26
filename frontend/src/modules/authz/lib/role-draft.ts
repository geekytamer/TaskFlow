/**
 * The role editor's state, as pure functions (tested in role-draft.test.ts).
 *
 * A role is a set of grants (permission key → optional scope and limit) and
 * the six sensitive-information switches. The editor shows one row per area
 * with a level: None / View / Edit / Full are the catalogue's presets for the
 * area (backend authz/describe.ts levelPresets); anything else is Custom.
 *
 * Scope: one picker per area. It shows the scope the area's scoped grants
 * hold, or "Mixed" when they differ (areaScopeMixed), and changing it sets
 * every scoped grant of the area. A role whose scoped grants differ inside
 * one area keeps them as they are until the picker is changed.
 */
import type { CatalogueArea, Level, RoleField, RoleGrant, RoleInput, Scope } from '@/services/authzService';

export const SCOPE_ORDER: readonly Scope[] = ['own', 'team', 'company', 'group'];
export const PRESET_LEVELS: readonly Level[] = ['none', 'view', 'edit', 'full'];
export type LevelChoice = Level | 'custom';

export interface GrantDraft { scope?: Scope; limit?: number }

export interface RoleDraft {
  name: string;
  nameAr: string;
  description: string;
  templateKey: string | null;
  grants: Record<string, GrantDraft>;
  fields: Record<string, { view: boolean; edit: boolean }>;
}

export interface EditorState {
  draft: RoleDraft;
  /** The draft as last saved; `dirty` compares against it. */
  saved: RoleDraft;
  /** Areas opened as Custom (their actions are shown even when they match a preset). */
  customOpen: string[];
}

const sameKeys = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((k) => set.has(k));
};

/** The keys of an area the draft holds. */
export function heldKeys(draft: RoleDraft, area: CatalogueArea): string[] {
  return area.actions.map((a) => a.key).filter((k) => k in draft.grants);
}

/** The preset the area's held keys match, or 'custom' (none of the presets). */
export function levelOf(area: CatalogueArea, held: readonly string[]): LevelChoice {
  for (const level of [...PRESET_LEVELS].reverse()) {
    if (sameKeys(area.levels[level] ?? [], held)) return level;
  }
  return 'custom';
}

/** Held actions of the area that carry a limit (Ruling S: such an area is always Custom). */
export function limitedActions(draft: RoleDraft, area: CatalogueArea) {
  return area.actions.filter((a) => draft.grants[a.key]?.limit !== undefined);
}

/**
 * What the level picker shows: Custom when opened as Custom or when any of the
 * area's actions has a limit (a preset never shows a limit it would hide);
 * else the matching preset.
 */
export function shownLevel(state: EditorState, area: CatalogueArea): LevelChoice {
  if (state.customOpen.includes(area.key)) return 'custom';
  if (limitedActions(state.draft, area).length) return 'custom';
  return levelOf(area, heldKeys(state.draft, area));
}

export const areaHasScope = (area: CatalogueArea) => area.scopes.length > 0 && area.actions.some((a) => a.scoped);

const widest = (scopes: Scope[]): Scope | undefined =>
  scopes.reduce<Scope | undefined>((w, s) => (w === undefined || SCOPE_ORDER.indexOf(s) > SCOPE_ORDER.indexOf(w) ? s : w), undefined);

/**
 * The scope the area's picker shows: the widest one its scoped grants hold;
 * with none held, 'company' when the area offers it (else its widest).
 */
export function areaScope(draft: RoleDraft, area: CatalogueArea): Scope | undefined {
  if (!areaHasScope(area)) return undefined;
  const held = area.actions
    .filter((a) => a.scoped)
    .map((a) => draft.grants[a.key]?.scope)
    .filter((s): s is Scope => Boolean(s));
  return widest(held) ?? (area.scopes.includes('company') ? 'company' : widest([...area.scopes]));
}

/**
 * M-5: the area's scoped grants hold different scopes (say, sees own, edits
 * company). The picker then shows "Mixed" instead of the widest; choosing a
 * scope sets them all.
 */
export function areaScopeMixed(draft: RoleDraft, area: CatalogueArea): boolean {
  if (!areaHasScope(area)) return false;
  const held = area.actions.filter((a) => a.scoped).map((a) => draft.grants[a.key]?.scope).filter((s): s is Scope => Boolean(s));
  return new Set(held).size > 1;
}

function grantFor(area: CatalogueArea, key: string, scope: Scope | undefined, previous?: GrantDraft): GrantDraft {
  const action = area.actions.find((a) => a.key === key);
  const out: GrantDraft = {};
  if (action?.scoped) out.scope = previous?.scope ?? scope;
  if (action?.limit && previous?.limit !== undefined) out.limit = previous.limit;
  return out;
}

/**
 * Replaces the area's grants by a preset's keys. Kept keys keep their scope;
 * every limit of the area is cleared (Ruling S: a preset has no limits).
 */
export function applyLevel(draft: RoleDraft, area: CatalogueArea, level: Level): RoleDraft {
  const scope = areaScope(draft, area);
  const grants = { ...draft.grants };
  const wanted = new Set(area.levels[level] ?? []);
  for (const action of area.actions) {
    if (wanted.has(action.key)) {
      const kept = grantFor(area, action.key, scope, draft.grants[action.key]);
      delete kept.limit;
      grants[action.key] = kept;
    } else delete grants[action.key];
  }
  return { ...draft, grants };
}

/** Gives or removes one action (Custom). A new scoped grant takes the area's scope. */
export function toggleAction(draft: RoleDraft, area: CatalogueArea, key: string, on: boolean): RoleDraft {
  const grants = { ...draft.grants };
  if (on) grants[key] = grantFor(area, key, areaScope(draft, area), draft.grants[key]);
  else delete grants[key];
  return { ...draft, grants };
}

/** Sets the scope of every scoped grant the area holds. */
export function setAreaScope(draft: RoleDraft, area: CatalogueArea, scope: Scope): RoleDraft {
  if (!area.scopes.includes(scope)) return draft;
  const grants = { ...draft.grants };
  for (const action of area.actions) {
    if (action.scoped && grants[action.key]) grants[action.key] = { ...grants[action.key], scope };
  }
  return { ...draft, grants };
}

/** A ceiling on a held action; null or a negative/non-number clears it (no limit). */
export function setLimit(draft: RoleDraft, key: string, limit: number | null): RoleDraft {
  const current = draft.grants[key];
  if (!current) return draft;
  const next: GrantDraft = { ...current };
  if (limit === null || !Number.isFinite(limit) || limit < 0) delete next.limit;
  else next.limit = limit;
  return { ...draft, grants: { ...draft.grants, [key]: next } };
}

/** Sensitive information: edit needs view, so edit on turns view on and view off turns edit off. */
export function setField(draft: RoleDraft, key: string, which: 'view' | 'edit', on: boolean): RoleDraft {
  const current = draft.fields[key] ?? { view: false, edit: false };
  const next = which === 'view'
    ? { view: on, edit: on ? current.edit : false }
    : { view: on ? true : current.view, edit: on };
  return { ...draft, fields: { ...draft.fields, [key]: next } };
}

export function draftFrom(
  role: { name: string; nameAr?: string | null; description?: string | null; templateKey?: string | null; grants: RoleGrant[]; fields: RoleField[] },
  fieldKeys: readonly string[],
): RoleDraft {
  const grants: Record<string, GrantDraft> = {};
  for (const g of role.grants) {
    grants[g.key] = {
      ...(g.scope ? { scope: g.scope } : {}),
      ...(typeof g.limit === 'number' ? { limit: g.limit } : {}),
    };
  }
  const fields: RoleDraft['fields'] = {};
  for (const key of fieldKeys) {
    const f = role.fields.find((x) => x.key === key);
    fields[key] = { view: Boolean(f?.view), edit: Boolean(f?.edit) };
  }
  return {
    name: role.name,
    nameAr: role.nameAr ?? '',
    description: role.description ?? '',
    templateKey: role.templateKey ?? null,
    grants,
    fields,
  };
}

/** The body the roles API takes (sorted, so equal drafts give equal bodies). */
export function toInput(draft: RoleDraft): RoleInput {
  return {
    name: draft.name.trim(),
    nameAr: draft.nameAr.trim() || null,
    description: draft.description.trim() || null,
    templateKey: draft.templateKey,
    grants: Object.keys(draft.grants).sort().map((key) => ({
      key,
      ...(draft.grants[key].scope ? { scope: draft.grants[key].scope } : {}),
      ...(draft.grants[key].limit !== undefined ? { limit: draft.grants[key].limit } : {}),
    })),
    fields: Object.keys(draft.fields).sort().map((key) => ({ key, view: draft.fields[key].view, edit: draft.fields[key].edit })),
  };
}

export const isDirty = (state: EditorState) => JSON.stringify(toInput(state.draft)) !== JSON.stringify(toInput(state.saved));

export type EditorAction =
  | { type: 'load'; draft: RoleDraft }
  | { type: 'saved'; draft: RoleDraft }
  | { type: 'reset' }
  | { type: 'text'; field: 'name' | 'nameAr' | 'description'; value: string }
  | { type: 'level'; area: CatalogueArea; level: LevelChoice }
  | { type: 'collapse'; area: CatalogueArea }
  | { type: 'toggle'; area: CatalogueArea; key: string; on: boolean }
  | { type: 'scope'; area: CatalogueArea; scope: Scope }
  | { type: 'limit'; key: string; limit: number | null }
  | { type: 'field'; key: string; which: 'view' | 'edit'; on: boolean };

export const emptyDraft = (): RoleDraft => ({ name: '', nameAr: '', description: '', templateKey: null, grants: {}, fields: {} });

export const initialEditor = (draft: RoleDraft = emptyDraft()): EditorState => ({ draft, saved: draft, customOpen: [] });

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load':
      return initialEditor(action.draft);
    case 'saved':
      return { ...state, draft: action.draft, saved: action.draft };
    case 'reset':
      return { ...state, draft: state.saved, customOpen: [] };
    case 'text':
      return { ...state, draft: { ...state.draft, [action.field]: action.value } };
    case 'level': {
      if (action.level === 'custom') {
        return state.customOpen.includes(action.area.key)
          ? state
          : { ...state, customOpen: [...state.customOpen, action.area.key] };
      }
      return {
        ...state,
        draft: applyLevel(state.draft, action.area, action.level),
        customOpen: state.customOpen.filter((k) => k !== action.area.key),
      };
    }
    case 'collapse':
      return { ...state, customOpen: state.customOpen.filter((k) => k !== action.area.key) };
    case 'toggle':
      return { ...state, draft: toggleAction(state.draft, action.area, action.key, action.on) };
    case 'scope':
      return { ...state, draft: setAreaScope(state.draft, action.area, action.scope) };
    case 'limit':
      return { ...state, draft: setLimit(state.draft, action.key, action.limit) };
    case 'field':
      return { ...state, draft: setField(state.draft, action.key, action.which, action.on) };
    default:
      return state;
  }
}
