const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CATALOGUE,
  SCOPES,
  SENSITIVE_FIELDS,
  permissionKey,
  areaOf,
  findAction,
  allPermissionKeys,
} = require('../dist/authz/catalogue');
const {
  TEMPLATES, TEMPLATE_KEYS, templateGrants, templateFields, checkTables, LEGACY_HOLDERS, FIELD_HOLDERS,
} = require('../dist/authz/templates');
const { RECORD_RULES } = require('../dist/permissions/record-rules');

const KEY_SHAPE = /^[a-z][a-z-]*\.[a-z][a-z_]*$/;
const hasText = (label) => typeof label?.en === 'string' && label.en.trim() !== ''
  && typeof label?.ar === 'string' && label.ar.trim() !== '';
const ARABIC = /[؀-ۿ]/;

test('area keys are unique and every area has actions', () => {
  const keys = CATALOGUE.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate area key');
  assert.ok(CATALOGUE.length >= 20, `expected ~25 areas, got ${CATALOGUE.length}`);
  for (const area of CATALOGUE) {
    assert.ok(area.actions.length > 0, `${area.key} has no actions`);
    assert.ok(['operations', 'finance', 'crm', 'hr', 'core'].includes(area.group), `${area.key} group`);
  }
});

test('every permission key is unique and shaped area.action', () => {
  const keys = allPermissionKeys();
  assert.equal(new Set(keys).size, keys.length, 'duplicate permission key');
  for (const key of keys) assert.match(key, KEY_SHAPE, key);
  assert.equal(permissionKey('purchasing', 'approve'), 'purchasing.approve');
  assert.equal(areaOf('purchasing.approve'), 'purchasing');
  assert.equal(areaOf('vendor-bills.pay'), 'vendor-bills');
});

test('every area, action and sensitive field has an English and an Arabic label', () => {
  for (const area of CATALOGUE) {
    assert.ok(hasText(area.label), `area ${area.key}`);
    assert.match(area.label.ar, ARABIC, `area ${area.key} ar is not Arabic`);
    for (const action of area.actions) {
      const key = permissionKey(area.key, action.key);
      assert.ok(hasText(action.label), key);
      assert.match(action.label.ar, ARABIC, `${key} ar is not Arabic`);
      // Written for people, not scraped from a path.
      assert.doesNotMatch(action.label.en, /[·/:]|\bcompanyId\b/, `${key} label looks path-derived`);
    }
  }
  for (const field of SENSITIVE_FIELDS) {
    assert.ok(hasText(field.label), `field ${field.key}`);
    assert.ok(CATALOGUE.some((a) => a.key === field.area), `field ${field.key} names unknown area ${field.area}`);
  }
});

test('scoped actions live only on areas that declare scopes', () => {
  for (const area of CATALOGUE) {
    const scoped = area.actions.filter((a) => a.scoped);
    if (scoped.length) {
      assert.ok(area.scopes && area.scopes.length > 0, `${area.key} has scoped actions but no scopes`);
      for (const s of area.scopes) assert.ok(SCOPES.includes(s), `${area.key} scope ${s}`);
    } else {
      assert.equal(area.scopes, undefined, `${area.key} declares scopes but no scoped action`);
    }
  }
});

test('sensitive fields are exactly the six from the spec', () => {
  assert.deepEqual(
    SENSITIVE_FIELDS.map((f) => f.key).sort(),
    ['bank_details', 'client_terms', 'cost_prices', 'personal_ids', 'rate_cards', 'salary'],
  );
});

test('every template grant names a catalogue key with a valid scope and limit', () => {
  assert.deepEqual([...TEMPLATE_KEYS], ['owner', 'admin', 'manager', 'accountant', 'employee']);
  for (const key of TEMPLATE_KEYS) {
    const tpl = TEMPLATES[key];
    assert.ok(hasText(tpl.label), `template ${key} label`);
    const seen = new Set();
    for (const grant of tpl.grants) {
      assert.ok(!seen.has(grant.key), `${key}: ${grant.key} granted twice`);
      seen.add(grant.key);
      const found = findAction(grant.key);
      assert.ok(found, `${key}: unknown permission ${grant.key}`);
      if (found.action.scoped) {
        assert.ok(grant.scope, `${key}: ${grant.key} is scoped but has no scope`);
        assert.ok(found.area.scopes.includes(grant.scope), `${key}: ${grant.key} scope ${grant.scope}`);
      } else {
        assert.equal(grant.scope, undefined, `${key}: ${grant.key} is not scoped`);
      }
      if (grant.limit !== undefined) {
        assert.ok(found.action.limit, `${key}: ${grant.key} takes no limit`);
        assert.ok(typeof grant.limit === 'number' && grant.limit >= 0, `${key}: ${grant.key} limit`);
      }
    }
    const fieldKeys = tpl.fields.map((f) => f.key).sort();
    assert.deepEqual(fieldKeys, SENSITIVE_FIELDS.map((f) => f.key).sort(), `${key}: every field decided once`);
    for (const f of tpl.fields) {
      assert.equal(typeof f.view, 'boolean');
      assert.equal(typeof f.edit, 'boolean');
      assert.ok(f.view || !f.edit, `${key}: ${f.key} editable but hidden`);
    }
  }
});

test('limits are declared only on approve-style actions, and templates set none in 1a', () => {
  for (const key of TEMPLATE_KEYS) {
    for (const grant of TEMPLATES[key].grants) assert.equal(grant.limit, undefined, `${key}: ${grant.key}`);
  }
  const limited = allPermissionKeys().filter((k) => findAction(k).action.limit);
  assert.ok(limited.includes('purchasing.approve'));
  assert.ok(limited.includes('invoices.override_credit'));
  assert.ok(limited.includes('finance.approve_expenses'));
  for (const k of limited) assert.ok(['amount', 'percent'].includes(findAction(k).action.limit), k);
});

test('admin holds every permission at company scope', () => {
  for (const key of allPermissionKeys()) {
    const grant = templateGrants('admin', key);
    assert.ok(grant, `admin lacks ${key}`);
    if (findAction(key).action.scoped) assert.equal(grant.scope, 'company', key);
  }
  for (const f of templateFields('admin')) assert.ok(f.view && f.edit, `admin field ${f.key}`);
});

test('owner holds everything admin holds, at group scope where scoped', () => {
  const rank = { own: 0, team: 1, company: 2, group: 3 };
  for (const grant of TEMPLATES.admin.grants) {
    const o = templateGrants('owner', grant.key);
    assert.ok(o, `owner lacks ${grant.key}`);
    if (grant.scope) {
      assert.equal(o.scope, 'group', grant.key);
      assert.ok(rank[o.scope] >= rank[grant.scope]);
    }
  }
  for (const f of templateFields('admin')) {
    const o = templateFields('owner').find((x) => x.key === f.key);
    assert.ok(o.view >= f.view && o.edit >= f.edit, f.key);
  }
});

// Record rules from the legacy engine, re-expressed as catalogue grants.
// [rule, every permission key the rule feeds, scope a holder gets (non-holders get `own` or nothing)]
const RULE_MAP = [
  ['PROJECTS_ALL_READ', ['projects.view'], 'company'],
  // requireTaskViewAccess also gates editing and deleting a task.
  ['TASKS_ALL_READ', ['tasks.view', 'tasks.edit', 'tasks.delete'], 'company'],
  ['TIME_ENTRIES_DELETE_OTHERS', ['tasks.delete_time']],
  // Conversations follow contact visibility.
  ['CONTACTS_PRIVATE_READ', ['contacts.view', 'inbox.view'], 'company'],
  ['CONTACTS_ALL_WRITE', ['contacts.edit'], 'company'],
  ['PORTAL_ACCESS_MANAGE', ['portal.view', 'portal.manage_access', 'portal.handle_requests', 'portal.manage_catalogue', 'portal.approve', 'influencers.review']],
  ['GAMES_MANAGE', ['games.view', 'games.manage']],
  ['DISCOVER_MANAGE', ['discover.view', 'discover.manage']],
  ['INVOICES_CREDIT_OVERRIDE', ['invoices.override_credit']],
  ['CRM_ALL_READ', ['crm.view'], 'company'],
  ['CRM_ALL_WRITE', ['crm.edit', 'crm.delete'], 'company'],
  ['CAMPAIGNS_ALL_READ', ['campaigns.view'], 'company'],
  ['CAMPAIGNS_ALL_WRITE', ['campaigns.edit'], 'company'],
  ['COMMISSIONS_ALL_READ', ['commissions.view'], 'company'],
  ['WHATSAPP_PRIVATE_READ', ['whatsapp.view'], 'company'],
  ['DASHBOARD_OPERATIONS_READ', ['dashboard.view_operations']],
  ['DASHBOARD_FINANCE_READ', ['dashboard.view_finance']],
  ['USERS_WRITE', ['people.manage']],
  ['ADMINISTRATION', ['people.manage_roles', 'settings.manage_approvals']],
  ['GROUPS_READ', ['people.view_roles']],
];
const FIELD_RULE_MAP = [
  ['PAYROLL_PAY_READ', ['salary', 'personal_ids', 'bank_details']],
  ['CONTACTS_PRICING_READ', ['rate_cards', 'client_terms']],
];
const ROLE_OF = { admin: 'Admin', manager: 'Manager', accountant: 'Accountant', employee: 'Employee' };

test('every legacy record rule is mapped', () => {
  const mapped = new Set([...RULE_MAP.map((r) => r[0]), ...FIELD_RULE_MAP.map((r) => r[0])]);
  assert.deepEqual([...mapped].sort(), Object.keys(RECORD_RULES).sort());
});

test('templates reproduce the legacy record rules exactly', () => {
  for (const [rule, keys, scope] of RULE_MAP) {
    for (const key of keys) {
      assert.ok(findAction(key), `${rule} feeds unknown ${key}`);
      for (const [tpl, role] of Object.entries(ROLE_OF)) {
        const holds = RECORD_RULES[rule].roles.includes(role);
        const grant = templateGrants(tpl, key);
        if (scope) {
          // A scoped rule: holders see the company, everyone else only their own or nothing.
          if (holds) assert.equal(grant?.scope, scope, `${tpl} ${key} (${rule})`);
          else assert.ok(grant === undefined || grant.scope === 'own', `${tpl} ${key} (${rule}) must be own or nothing, got ${grant?.scope}`);
        } else {
          assert.equal(Boolean(grant), holds, `${tpl} ${key} (${rule})`);
        }
      }
    }
  }
  for (const [rule, fields] of FIELD_RULE_MAP) {
    for (const [tpl, role] of Object.entries(ROLE_OF)) {
      const holds = RECORD_RULES[rule].roles.includes(role);
      for (const field of fields) {
        const f = templateFields(tpl).find((x) => x.key === field);
        assert.equal(f.view, holds, `${tpl} ${field} view (${rule})`);
      }
    }
  }
});

test('employee scoped views fall back to own where legacy showed own records', () => {
  for (const key of ['crm.view', 'campaigns.view', 'commissions.view', 'projects.view', 'tasks.view', 'contacts.view', 'inbox.view']) {
    assert.equal(templateGrants('employee', key)?.scope, 'own', key);
  }
  // Employees have no WhatsApp today.
  assert.equal(templateGrants('employee', 'whatsapp.view'), undefined);
  assert.equal(templateGrants('accountant', 'whatsapp.view')?.scope, 'own');
});

test('cost prices are visible to every template (unrestricted today)', () => {
  for (const key of TEMPLATE_KEYS) {
    const f = templateFields(key).find((x) => x.key === 'cost_prices');
    assert.ok(f.view && f.edit, key);
  }
});

test('the holders table is checked when it loads: scopes the area accepts, no editable hidden field', () => {
  assert.doesNotThrow(() => checkTables(LEGACY_HOLDERS, FIELD_HOLDERS));
  // A scope the area does not offer.
  const narrowArea = CATALOGUE.find((a) => a.scopes && a.scopes.length < 4);
  if (narrowArea) {
    const key = permissionKey(narrowArea.key, narrowArea.actions.find((x) => x.scoped).key);
    const bad = SCOPES.find((s) => !narrowArea.scopes.includes(s));
    assert.throws(() => checkTables({ ...LEGACY_HOLDERS, [key]: [bad, bad, bad, bad] }, FIELD_HOLDERS), /scope/);
  }
  assert.throws(() => checkTables({ ...LEGACY_HOLDERS, 'projects.view': ['company', 'company', 'company', 'department'] }, FIELD_HOLDERS), /scope/);
  // Editable but not visible.
  const yes = [true, true, true, true];
  const no = [false, false, false, false];
  assert.throws(() => checkTables(LEGACY_HOLDERS, { ...FIELD_HOLDERS, salary: [no, yes] }), /edit.*view|view.*edit/);
  // Unknown and missing keys.
  assert.throws(() => checkTables({ ...LEGACY_HOLDERS, 'sales.fly': yes }, FIELD_HOLDERS), /unknown/);
  const { 'sales.view': _dropped, ...withoutSalesView } = LEGACY_HOLDERS;
  assert.throws(() => checkTables(withoutSalesView, FIELD_HOLDERS), /missing/);
});

test('review renames and additions are in place', () => {
  for (const key of ['finance.edit_settings', 'inbox.edit_settings', 'influencers.use_workspace', 'sales.cancel', 'settings.view_numbering']) {
    assert.ok(findAction(key), `missing ${key}`);
  }
  for (const key of ['finance.settings', 'inbox.settings', 'influencers.workspace']) assert.equal(findAction(key), undefined, key);
  assert.equal(findAction('purchasing.approve_step').action.limit, 'amount');
  const hr = CATALOGUE.find((a) => a.key === 'hr');
  assert.deepEqual(hr.label, { en: 'Employees and HR', ar: 'الموظفون والموارد البشرية' });
  const ar = JSON.stringify(CATALOGUE.map((a) => a.actions.map((x) => x.label.ar)));
  assert.ok(!ar.includes('الوصفات') && ar.includes('قوائم المواد'), 'recipes are قوائم المواد');
  assert.ok(!ar.includes('الدفعات') && ar.includes('التشغيلات'), 'lots are التشغيلات');
});
