import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOGUE, SENSITIVE_FIELDS, permissionKey } from '../../../../../backend/src/authz/catalogue';
import { levelOf as serverLevelOf, levelPresets } from '../../../../../backend/src/authz/describe';
import { TEMPLATES, TEMPLATE_KEYS } from '../../../../../backend/src/authz/templates';
import type { CatalogueArea } from '@/services/authzService';
import {
  applyLevel,
  areaScope,
  areaScopeMixed,
  setAreaScope,
  draftFrom,
  editorReducer,
  heldKeys,
  initialEditor,
  isDirty,
  levelOf,
  setField,
  shownLevel,
  toInput,
  type EditorState,
} from './role-draft';
import { explainSummary } from './explain';

/** The catalogue exactly as GET /permissions/catalogue sends it (backend authz/routes.ts). */
const AREAS: CatalogueArea[] = CATALOGUE.map((area) => ({
  key: area.key,
  label: area.label,
  group: area.group,
  scopes: area.scopes ?? [],
  ownership: area.ownership ?? null,
  actions: area.actions.map((a) => ({
    key: permissionKey(area.key, a.key),
    action: a.key,
    label: a.label,
    scoped: Boolean(a.scoped),
    limit: a.limit ?? null,
  })),
  levels: levelPresets(area),
}));
const FIELD_KEYS = SENSITIVE_FIELDS.map((f) => f.key);
const area = (key: string) => AREAS.find((a) => a.key === key)!;
const blank = () => draftFrom({ name: 'R', grants: [], fields: [] }, FIELD_KEYS);

test('every preset, applied to an empty role, reads back as that level', () => {
  for (const a of AREAS) {
    for (const level of ['none', 'view', 'edit', 'full'] as const) {
      const draft = applyLevel(blank(), a, level);
      const held = heldKeys(draft, a);
      // Two presets can coincide (an area with only view actions): the widest wins, as on the server.
      const expected = serverLevelOf(CATALOGUE.find((c) => c.key === a.key)!, new Set(held));
      assert.equal(levelOf(a, held), expected, `${a.key} ${level}`);
      assert.deepEqual([...held].sort(), [...a.levels[level]].sort(), `${a.key} ${level} keys`);
    }
  }
});

test('every standard template reads with the same level per area as the server says', () => {
  for (const key of TEMPLATE_KEYS) {
    const draft = draftFrom({ name: key, grants: TEMPLATES[key].grants, fields: TEMPLATES[key].fields }, FIELD_KEYS);
    const held = new Set(Object.keys(draft.grants));
    for (const a of AREAS) {
      const def = CATALOGUE.find((c) => c.key === a.key)!;
      assert.equal(levelOf(a, heldKeys(draft, a)), serverLevelOf(def, held), `${key} / ${a.key}`);
    }
  }
});

test('a standard template survives the editor unchanged (load → payload)', () => {
  for (const key of TEMPLATE_KEYS) {
    const t = TEMPLATES[key];
    const input = toInput(draftFrom({ name: key, grants: t.grants, fields: t.fields }, FIELD_KEYS));
    const sortGrants = [...t.grants].sort((a, b) => a.key.localeCompare(b.key));
    assert.deepEqual(input.grants, sortGrants.map((g) => ({ key: g.key, ...(g.scope ? { scope: g.scope } : {}), ...(g.limit !== undefined ? { limit: g.limit } : {}) })), key);
  }
});

test('a level that adds scoped actions gives them the area scope; kept actions keep theirs', () => {
  const projects = area('projects');
  let draft = draftFrom({ name: 'R', grants: [{ key: 'projects.view', scope: 'own' }], fields: [] }, FIELD_KEYS);
  assert.equal(areaScope(draft, projects), 'own');
  draft = applyLevel(draft, projects, 'full');
  assert.equal(draft.grants['projects.view'].scope, 'own');
  assert.equal(draft.grants['projects.create'].scope, undefined, 'unscoped actions take no scope');
  // An empty scoped area starts at company.
  const tasks = area('tasks');
  draft = applyLevel(draft, tasks, 'edit');
  assert.equal(draft.grants['tasks.view'].scope, 'company');
  assert.equal(draft.grants['tasks.edit'].scope, 'company');
});

test('reducer: Custom opens the actions without changing grants; a preset closes it', () => {
  const sales = area('sales');
  let state: EditorState = initialEditor(applyLevel(blank(), sales, 'view'));
  state = editorReducer(state, { type: 'level', area: sales, level: 'custom' });
  assert.equal(shownLevel(state, sales), 'custom');
  assert.equal(isDirty(state), false, 'opening Custom is not a change');
  state = editorReducer(state, { type: 'toggle', area: sales, key: 'sales.create', on: true });
  assert.equal(levelOf(sales, heldKeys(state.draft, sales)), 'custom');
  assert.equal(isDirty(state), true);
  state = editorReducer(state, { type: 'level', area: sales, level: 'edit' });
  assert.equal(shownLevel(state, sales), 'edit');
  assert.deepEqual(heldKeys(state.draft, sales).sort(), [...sales.levels.edit].sort());
  state = editorReducer(state, { type: 'reset' });
  assert.equal(shownLevel(state, sales), 'view');
  assert.equal(isDirty(state), false);
});

test('reducer: scope changes every scoped grant of the area only', () => {
  const tasks = area('tasks');
  let state = initialEditor(applyLevel(applyLevel(blank(), tasks, 'full'), area('projects'), 'view'));
  state = editorReducer(state, { type: 'scope', area: tasks, scope: 'team' });
  for (const a of tasks.actions) {
    if (a.scoped) assert.equal(state.draft.grants[a.key].scope, 'team', a.key);
    else assert.equal(state.draft.grants[a.key].scope, undefined, a.key);
  }
  assert.equal(state.draft.grants['projects.view'].scope, 'company');
  // A scope the area does not offer is ignored.
  const sales = area('sales');
  const before = state.draft;
  state = editorReducer(state, { type: 'scope', area: sales, scope: 'own' });
  assert.equal(state.draft, before);
});

test('reducer: limits apply to held actions only; empty clears', () => {
  const purchasing = area('purchasing');
  let state = initialEditor(applyLevel(blank(), purchasing, 'full'));
  state = editorReducer(state, { type: 'limit', key: 'purchasing.approve', limit: 5000 });
  assert.equal(state.draft.grants['purchasing.approve'].limit, 5000);
  assert.deepEqual(toInput(state.draft).grants.find((g) => g.key === 'purchasing.approve'), { key: 'purchasing.approve', limit: 5000 });
  state = editorReducer(state, { type: 'limit', key: 'purchasing.approve', limit: null });
  assert.equal(state.draft.grants['purchasing.approve'].limit, undefined);
  state = editorReducer(state, { type: 'limit', key: 'purchasing.approve', limit: -3 });
  assert.equal(state.draft.grants['purchasing.approve'].limit, undefined, 'negative is no limit');
  state = editorReducer(state, { type: 'limit', key: 'sales.view', limit: 10 });
  assert.equal(state.draft.grants['sales.view'], undefined, 'not held: nothing to limit');
  // Dropping to a level and back loses the limit with the grant.
  state = editorReducer(state, { type: 'limit', key: 'purchasing.approve', limit: 100 });
  state = editorReducer(state, { type: 'level', area: purchasing, level: 'edit' });
  state = editorReducer(state, { type: 'level', area: purchasing, level: 'full' });
  assert.equal(state.draft.grants['purchasing.approve'].limit, undefined);
});

test('sensitive information: edit needs view', () => {
  let draft = blank();
  draft = setField(draft, 'salary', 'edit', true);
  assert.deepEqual(draft.fields.salary, { view: true, edit: true });
  draft = setField(draft, 'salary', 'view', false);
  assert.deepEqual(draft.fields.salary, { view: false, edit: false });
  draft = setField(draft, 'salary', 'view', true);
  assert.deepEqual(draft.fields.salary, { view: true, edit: false });
  assert.equal(Object.keys(draft.fields).length, FIELD_KEYS.length, 'all six are always sent');
});

test('saved resets the baseline; the payload trims names', () => {
  let state = initialEditor(blank());
  state = editorReducer(state, { type: 'text', field: 'name', value: '  Sales lead ' });
  assert.equal(isDirty(state), true);
  assert.equal(toInput(state.draft).name, 'Sales lead');
  state = editorReducer(state, { type: 'saved', draft: state.draft });
  assert.equal(isDirty(state), false);
});

test('explainSummary pairs each summary line with the roles behind it', () => {
  const src = (kind: 'main' | 'addon', roleName: string) => ({ kind, roleId: roleName, roleName });
  const person = {
    summary: [
      { en: 'Sees sales', ar: '' },
      { en: 'Full access to purchasing', ar: '' },
      { en: 'Approve or reject purchase orders and requisitions up to 5000', ar: '' },
      { en: "Can't see salaries", ar: '' },
    ],
    grants: [
      { key: 'sales.view', label: { en: '', ar: '' }, sources: [src('main', 'Accountant')] },
      ...area('purchasing').actions.map((a) => ({
        key: a.key,
        label: a.label,
        ...(a.action === 'approve' ? { limit: 5000 } : {}),
        sources: a.action === 'approve' ? [src('addon', 'PO approver'), src('main', 'Accountant')] : [src('main', 'Accountant')],
      })),
    ],
  };
  const lines = explainSummary(person, AREAS);
  assert.deepEqual(lines.map((l) => l.kind), ['area', 'area', 'limit', 'hidden']);
  assert.deepEqual(lines[1].why.map((s) => s.roleName), ['Accountant', 'PO approver'], 'main role first');
  assert.deepEqual(lines[2].why.map((s) => s.roleName), ['Accountant', 'PO approver']);
  assert.deepEqual(lines[3].why, []);
  // Counts that do not line up: no reasons rather than wrong ones.
  const off = explainSummary({ ...person, summary: person.summary.slice(0, 1) }, AREAS);
  assert.deepEqual(off.map((l) => l.why), [[]]);
});

test('reducer: collapse hides the actions; the level still reads from the grants', () => {
  const sales = area('sales');
  let state = initialEditor(blank());
  state = editorReducer(state, { type: 'level', area: sales, level: 'custom' });
  state = editorReducer(state, { type: 'toggle', area: sales, key: 'sales.view', on: true });
  state = editorReducer(state, { type: 'collapse', area: sales });
  assert.equal(state.customOpen.includes('sales'), false);
  assert.equal(shownLevel(state, sales), 'view', 'a preset again once collapsed');
  state = editorReducer(state, { type: 'toggle', area: sales, key: 'sales.delete', on: true });
  assert.equal(shownLevel(state, sales), 'custom');
});

test('Ruling S: an area with a limit reads Custom; a preset clears the limits', () => {
  const purchasing = area('purchasing');
  // Full with a ceiling, as a saved role arrives (not opened).
  const role = draftFrom({ name: 'R', grants: purchasing.levels.full.map((key) => (key === 'purchasing.approve' ? { key, limit: 5000 } : { key })), fields: [] }, FIELD_KEYS);
  let state = initialEditor(role);
  assert.equal(levelOf(purchasing, heldKeys(state.draft, purchasing)), 'full', 'the keys alone are Full');
  assert.equal(shownLevel(state, purchasing), 'custom', 'but the limit makes it Custom');
  state = editorReducer(state, { type: 'level', area: purchasing, level: 'full' });
  assert.equal(state.draft.grants['purchasing.approve'].limit, undefined, 'Full clears the limit');
  assert.equal(shownLevel(state, purchasing), 'full');
  assert.equal(isDirty(state), true);
  // Collapsing a limited area still reads Custom.
  state = editorReducer(state, { type: 'level', area: purchasing, level: 'custom' });
  state = editorReducer(state, { type: 'limit', key: 'purchasing.approve', limit: 10 });
  state = editorReducer(state, { type: 'collapse', area: purchasing });
  assert.equal(shownLevel(state, purchasing), 'custom');
});

test('M-5: an area whose actions hold different scopes is Mixed until one scope is chosen', () => {
  const contacts = area('contacts');
  const draft = draftFrom({ name: 'Acct', grants: [{ key: 'contacts.view', scope: 'own' }, { key: 'contacts.edit', scope: 'company' }], fields: [] }, FIELD_KEYS);
  assert.equal(areaScopeMixed(draft, contacts), true);
  const unified = setAreaScope(draft, contacts, 'team');
  assert.equal(areaScopeMixed(unified, contacts), false);
  assert.equal(unified.grants['contacts.view'].scope, 'team');
  assert.equal(unified.grants['contacts.edit'].scope, 'team');
});
