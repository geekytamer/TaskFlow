/**
 * store.authz: roles, assignments, holding groups, record shares and the
 * permission audit, in TaskFlow's own database (migration 135_authz_v2).
 *
 * Tables (spec §4 "Data"):
 * - permission_groups = roles. v2 adds templateKey, holdingGroupId (non-null =
 *   a group-level role; companyId is then null), needsReview, convertedAt.
 * - role_permissions(groupId, key, scope, limitAmount) = a role's grants in
 *   catalogue keys. A separate table, not new columns on group_permissions:
 *   the legacy module:action rows keep answering today's readers (lock-out
 *   guard, /auth/permissions, OpenFGA projection, authz:compare) until Task 12
 *   removes them, and the two key spaces collide on the old primary key
 *   ('inventory:post' vs 'inventory.post').
 * - role_fields(groupId, field, canView, canEdit).
 * - user_group_assignments gains isMain, isActive, startsAt, endsAt,
 *   delegatedBy, reason, viaHoldingGroupId.
 * - holding_groups, companies.holdingGroupId, holding_group_admins,
 *   holding_group_assignments, record_shares, permission_audit.
 *
 * Ruling E: custom groups convert into add-on roles with needsReview = 1, and
 * their existing assignments are kept with isActive = 0 (the flag lives on the
 * assignment so the legacy screens, which hide inactive groups, are unchanged).
 * The evaluator counts an assignment only when isActive = 1 and its role has
 * needsReview = 0; reviewing a role (Task 9) clears needsReview and activates
 * its assignments.
 *
 * Every write runs in one transaction, bumps authz_version and writes a
 * permission_audit row, and does neither when nothing changed (which is what
 * makes the data migration idempotent).
 */
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { CATALOGUE, SCOPES, SENSITIVE_FIELDS, findAction, type Scope } from './catalogue';
import { TEMPLATES, TEMPLATE_KEYS, type TemplateField, type TemplateGrant, type TemplateKey } from './templates';
import { OLD_RULE_SCOPES, OLD_TO_FIELDS, OLD_TO_NEW } from './legacy-map';

export interface RoleView {
  id: string;
  companyId: string | null;
  holdingGroupId: string | null;
  key: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  needsReview: boolean;
  templateKey: string | null;
  grants: TemplateGrant[];
  fields: TemplateField[];
}

export interface RoleInput {
  id?: string;
  key?: string;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  templateKey?: string | null;
  grants: TemplateGrant[];
  fields: TemplateField[];
}

export interface AssignmentView {
  roleId: string;
  roleKey: string;
  roleName: string;
  isMain: boolean;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  delegatedBy: string | null;
  reason: string | null;
  viaHoldingGroupId: string | null;
}

export interface HoldingGroupView {
  id: string;
  name: string;
  nameAr: string | null;
  createdAt: string;
  companyIds: string[];
  adminUserIds: string[];
}

export interface HoldingAssignmentRow {
  holdingGroupId: string;
  userId: string;
  roleKey: string;
  isMain: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export interface ShareRow { companyId: string; area: string; recordId: string; userId: string; sharedBy: string | null; createdAt: string }

export interface AuditRow {
  id: number;
  companyId: string | null;
  holdingGroupId: string | null;
  actorUserId: string | null;
  entity: string;
  entityId: string;
  before: any;
  after: any;
  at: string;
}

interface RoleRow {
  id: string; companyId: string | null; holdingGroupId: string | null; key: string; name: string;
  nameAr: string | null; description: string | null; isSystem: number; isActive: number;
  needsReview: number; templateKey: string | null; convertedAt: string | null; createdAt: string;
}

const LEGACY_ROLE_KEYS = new Set(['admin', 'manager', 'accountant', 'employee']);

function scopeRank(scope: Scope): number {
  return SCOPES.indexOf(scope);
}

/**
 * Old module:action grants → catalogue grants and field switches.
 *
 * OLD_TO_NEW grants keys; OLD_TO_FIELDS turns fields on (view and edit);
 * OLD_RULE_SCOPES only raise keys already granted to `company` and never add
 * one. A scoped key without its rule gets the narrowest scope its area offers
 * (`own` everywhere today). Old keys in none of the tables are returned as
 * `unmapped`.
 */
export function convertLegacyGrants(oldKeys: readonly string[]): {
  grants: TemplateGrant[]; fields: TemplateField[]; unmapped: string[];
} {
  const held = new Set<string>();
  const fieldsOn = new Set<string>();
  const raised = new Set<string>();
  const unmapped: string[] = [];
  for (const old of oldKeys) {
    if (OLD_TO_NEW[old]) OLD_TO_NEW[old].forEach((k) => held.add(k));
    else if (OLD_TO_FIELDS[old]) OLD_TO_FIELDS[old].forEach((f) => fieldsOn.add(f));
    else if (OLD_RULE_SCOPES[old]) OLD_RULE_SCOPES[old].keys.forEach((k) => raised.add(k));
    else unmapped.push(old);
  }
  const grants: TemplateGrant[] = [...held].sort().map((key) => {
    const found = findAction(key);
    if (!found?.action.scoped) return { key };
    const offered = [...(found.area.scopes ?? [])].sort((a, b) => scopeRank(a) - scopeRank(b));
    const scope: Scope = raised.has(key) && offered.includes('company') ? 'company' : (offered[0] ?? 'own');
    return { key, scope };
  });
  const fields = SENSITIVE_FIELDS.map(({ key }) => ({ key, view: fieldsOn.has(key), edit: fieldsOn.has(key) }));
  return { grants, fields, unmapped: unmapped.sort() };
}

/** Throws unless every grant and field is valid against the catalogue. */
export function validateRole(grants: readonly TemplateGrant[], fields: readonly TemplateField[]): void {
  const seen = new Set<string>();
  for (const grant of grants) {
    const found = findAction(grant.key);
    if (!found) throw new Error(`Unknown permission: ${grant.key}`);
    if (seen.has(grant.key)) throw new Error(`Permission listed twice: ${grant.key}`);
    seen.add(grant.key);
    if (found.action.scoped) {
      if (!grant.scope) throw new Error(`${grant.key} needs a scope`);
      if (!(found.area.scopes ?? []).includes(grant.scope)) throw new Error(`${grant.key} does not offer scope ${grant.scope}`);
    } else if (grant.scope) {
      throw new Error(`${grant.key} takes no scope`);
    }
    if (grant.limit !== undefined) {
      if (!found.action.limit) throw new Error(`${grant.key} takes no limit`);
      if (!Number.isFinite(grant.limit) || grant.limit < 0) throw new Error(`${grant.key} limit must be a non-negative number`);
    }
  }
  const fieldKeys = new Set(SENSITIVE_FIELDS.map((f) => f.key));
  const seenFields = new Set<string>();
  for (const field of fields) {
    if (!fieldKeys.has(field.key)) throw new Error(`Unknown sensitive field: ${field.key}`);
    if (seenFields.has(field.key)) throw new Error(`Sensitive field listed twice: ${field.key}`);
    seenFields.add(field.key);
    if (field.edit && !field.view) throw new Error(`${field.key}: edit needs view`);
  }
}

const normGrants = (grants: readonly TemplateGrant[]): TemplateGrant[] =>
  [...grants]
    .map((g) => ({ key: g.key, ...(g.scope ? { scope: g.scope } : {}), ...(g.limit !== undefined && g.limit !== null ? { limit: g.limit } : {}) }))
    .sort((a, b) => a.key.localeCompare(b.key));

/** Every sensitive field, in catalogue order; unlisted ones are off. */
const normFields = (fields: readonly TemplateField[]): TemplateField[] =>
  SENSITIVE_FIELDS.map(({ key }) => {
    const f = fields.find((x) => x.key === key);
    return { key, view: Boolean(f?.view), edit: Boolean(f?.edit) };
  });

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class AuthzStore {
  private isReady = false;

  constructor(private readonly db: Database.Database) {}

  /** Whether migration 135 has created the v2 tables (false while older migrations run). */
  ready(): boolean {
    if (this.isReady) return true;
    this.isReady = Boolean(
      this.db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'permission_audit'`).get(),
    );
    return this.isReady;
  }

  // ── Plumbing ───────────────────────────────────────────────────────

  private bump(): void {
    this.db.prepare('UPDATE authz_version SET version = version + 1 WHERE id = 1').run();
  }

  private writeAudit(entry: {
    companyId?: string | null; holdingGroupId?: string | null; actorUserId: string | null;
    entity: string; entityId: string; before: unknown; after: unknown;
  }): void {
    this.db
      .prepare(
        `INSERT INTO permission_audit (companyId, holdingGroupId, actorUserId, entity, entityId, before, after, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.companyId ?? null, entry.holdingGroupId ?? null, entry.actorUserId, entry.entity, entry.entityId,
        entry.before === null || entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === null || entry.after === undefined ? null : JSON.stringify(entry.after),
        new Date().toISOString(),
      );
  }

  /** Records a change (audit + version bump) only when before and after differ. Returns whether it did. */
  private changed(entry: Parameters<AuthzStore['writeAudit']>[0]): boolean {
    if (same(entry.before ?? null, entry.after ?? null)) return false;
    this.writeAudit(entry);
    this.bump();
    return true;
  }

  private tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ── Roles ──────────────────────────────────────────────────────────

  private roleRow(id: string): RoleRow | undefined {
    return this.db.prepare('SELECT * FROM permission_groups WHERE id = ?').get(id) as RoleRow | undefined;
  }

  private grantsOf(groupId: string): TemplateGrant[] {
    const rows = this.db
      .prepare('SELECT key, scope, limitAmount FROM role_permissions WHERE groupId = ? ORDER BY key')
      .all(groupId) as Array<{ key: string; scope: Scope | null; limitAmount: number | null }>;
    return normGrants(rows.map((r) => ({ key: r.key, scope: r.scope ?? undefined, limit: r.limitAmount ?? undefined })));
  }

  private fieldsOf(groupId: string): TemplateField[] {
    const rows = this.db
      .prepare('SELECT field, canView, canEdit FROM role_fields WHERE groupId = ?')
      .all(groupId) as Array<{ field: string; canView: number; canEdit: number }>;
    return normFields(rows.map((r) => ({ key: r.field, view: Boolean(r.canView), edit: Boolean(r.canEdit) })));
  }

  private view(row: RoleRow): RoleView {
    return {
      id: row.id,
      companyId: row.companyId,
      holdingGroupId: row.holdingGroupId,
      key: row.key,
      name: row.name,
      nameAr: row.nameAr,
      description: row.description,
      isSystem: Boolean(row.isSystem),
      isActive: Boolean(row.isActive),
      needsReview: Boolean(row.needsReview),
      templateKey: row.templateKey,
      grants: this.grantsOf(row.id),
      fields: this.fieldsOf(row.id),
    };
  }

  /** The audited shape of a role: what it is and what it grants. */
  private auditShape(role: RoleView | undefined) {
    if (!role) return null;
    const { id: _id, ...rest } = role;
    return rest;
  }

  private writeGrants(groupId: string, grants: readonly TemplateGrant[], fields: readonly TemplateField[]): void {
    this.db.prepare('DELETE FROM role_permissions WHERE groupId = ?').run(groupId);
    this.db.prepare('DELETE FROM role_fields WHERE groupId = ?').run(groupId);
    const g = this.db.prepare('INSERT INTO role_permissions (groupId, key, scope, limitAmount) VALUES (?, ?, ?, ?)');
    normGrants(grants).forEach((grant) => g.run(groupId, grant.key, grant.scope ?? null, grant.limit ?? null));
    const f = this.db.prepare('INSERT INTO role_fields (groupId, field, canView, canEdit) VALUES (?, ?, ?, ?)');
    normFields(fields).forEach((field) => f.run(groupId, field.key, field.view ? 1 : 0, field.edit ? 1 : 0));
  }

  listRoles(companyId: string): RoleView[] {
    const rows = this.db
      .prepare('SELECT * FROM permission_groups WHERE companyId = ? ORDER BY isSystem DESC, name ASC')
      .all(companyId) as RoleRow[];
    return rows.map((row) => this.view(row));
  }

  getRole(id: string): RoleView | undefined {
    const row = this.roleRow(id);
    return row ? this.view(row) : undefined;
  }

  /** Creates (no id) or updates a company role. Validates against the catalogue. */
  saveRole(companyId: string, input: RoleInput, actorId: string | null): RoleView {
    validateRole(input.grants, input.fields);
    const name = String(input.name ?? '').trim();
    if (!name) throw new Error('A role needs a name.');
    if (input.templateKey && !(TEMPLATE_KEYS as readonly string[]).includes(input.templateKey)) {
      throw new Error(`Unknown template: ${input.templateKey}`);
    }
    return this.tx(() => {
      let id = input.id;
      const existing = id ? this.roleRow(id) : undefined;
      if (id && !existing) throw new Error('Role not found.');
      if (existing && existing.companyId !== companyId) throw new Error('That role belongs to another company.');
      const before = existing ? this.view(existing) : undefined;
      if (!existing) {
        id = uuid();
        const key = this.uniqueKey(companyId, input.key || name);
        this.db
          .prepare(
            `INSERT INTO permission_groups
               (id, companyId, key, name, nameAr, description, isSystem, isActive, createdAt, templateKey, needsReview, convertedAt)
             VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 0, ?)`,
          )
          .run(id, companyId, key, name, input.nameAr ?? null, input.description ?? null,
            new Date().toISOString(), input.templateKey ?? null, new Date().toISOString());
      } else {
        this.db
          .prepare('UPDATE permission_groups SET name = ?, nameAr = ?, description = ?, templateKey = ? WHERE id = ?')
          .run(name, input.nameAr ?? null, input.description ?? null,
            input.templateKey === undefined ? existing.templateKey : input.templateKey, id);
      }
      this.writeGrants(id!, input.grants, input.fields);
      const after = this.getRole(id!)!;
      this.changed({ companyId, actorUserId: actorId, entity: 'role', entityId: id!, before: this.auditShape(before), after: this.auditShape(after) });
      return after;
    });
  }

  private uniqueKey(companyId: string, base: string): string {
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'role';
    const taken = (k: string) => Boolean(this.db.prepare('SELECT 1 FROM permission_groups WHERE companyId = ? AND key = ?').get(companyId, k));
    let key = slug;
    for (let n = 2; taken(key) || (TEMPLATE_KEYS as readonly string[]).includes(key); n += 1) key = `${slug}_${n}`;
    return key;
  }

  /** Deletes a role nobody holds. */
  deleteRole(id: string, actorId: string | null): void {
    this.tx(() => {
      const row = this.roleRow(id);
      if (!row) throw new Error('Role not found.');
      const members = (this.db.prepare('SELECT COUNT(*) n FROM user_group_assignments WHERE groupId = ?').get(id) as { n: number }).n;
      if (members > 0) throw new Error(`This role is assigned to ${members} person(s); move them first.`);
      const before = this.view(row);
      this.db.prepare('DELETE FROM group_implications WHERE parentGroupId = ? OR childGroupId = ?').run(id, id);
      this.db.prepare('DELETE FROM group_permissions WHERE groupId = ?').run(id);
      this.db.prepare('DELETE FROM role_permissions WHERE groupId = ?').run(id);
      this.db.prepare('DELETE FROM role_fields WHERE groupId = ?').run(id);
      this.db.prepare('DELETE FROM permission_groups WHERE id = ?').run(id);
      if (row.isSystem && row.companyId) {
        // Same record the legacy delete keeps, so seeding does not bring it back.
        this.db
          .prepare('INSERT OR REPLACE INTO permission_group_deletions (companyId, key, deletedAt) VALUES (?, ?, ?)')
          .run(row.companyId, row.key, new Date().toISOString());
      }
      this.changed({ companyId: row.companyId, holdingGroupId: row.holdingGroupId, actorUserId: actorId, entity: 'role', entityId: id, before: this.auditShape(before), after: null });
    });
  }

  // ── Assignments ────────────────────────────────────────────────────

  assignments(userId: string, companyId: string): AssignmentView[] {
    const rows = this.db
      .prepare(
        `SELECT uga.*, pg.key roleKey, pg.name roleName FROM user_group_assignments uga
           JOIN permission_groups pg ON pg.id = uga.groupId
          WHERE uga.userId = ? AND uga.companyId = ?
          ORDER BY uga.isMain DESC, pg.name ASC`,
      )
      .all(userId, companyId) as Array<Record<string, any>>;
    return rows.map((r) => ({
      roleId: r.groupId,
      roleKey: r.roleKey,
      roleName: r.roleName,
      isMain: Boolean(r.isMain),
      isActive: Boolean(r.isActive),
      startsAt: r.startsAt ?? null,
      endsAt: r.endsAt ?? null,
      delegatedBy: r.delegatedBy ?? null,
      reason: r.reason ?? null,
      viaHoldingGroupId: r.viaHoldingGroupId ?? null,
    }));
  }

  private assignmentShape(userId: string, companyId: string) {
    return this.assignments(userId, companyId).map((a) => ({
      roleId: a.roleId, roleKey: a.roleKey, isMain: a.isMain, isActive: a.isActive,
      startsAt: a.startsAt, endsAt: a.endsAt, delegatedBy: a.delegatedBy, reason: a.reason, viaHoldingGroupId: a.viaHoldingGroupId,
    })).sort((a, b) => a.roleId.localeCompare(b.roleId));
  }

  /**
   * Replaces a person's direct, permanent roles in one company: one main role
   * plus add-ons. Temporary/delegated (endsAt set) and group-derived rows are
   * left alone. An add-on whose role still needs review is kept inactive.
   */
  setAssignments(
    userId: string, companyId: string,
    input: { mainRoleId: string | null; addOnRoleIds: string[] },
    actorId: string | null,
  ): void {
    this.tx(() => {
      const ids = [...new Set([input.mainRoleId, ...input.addOnRoleIds].filter((x): x is string => Boolean(x)))];
      const roles = new Map<string, RoleRow>();
      for (const id of ids) {
        const row = this.roleRow(id);
        if (!row) throw new Error('Role not found.');
        if (row.companyId !== companyId) throw new Error('That role belongs to another company.');
        roles.set(id, row);
      }
      const before = this.assignmentShape(userId, companyId);
      const previous = new Map(
        (this.db
          .prepare('SELECT groupId, isActive FROM user_group_assignments WHERE userId = ? AND companyId = ? AND viaHoldingGroupId IS NULL AND endsAt IS NULL')
          .all(userId, companyId) as Array<{ groupId: string; isActive: number }>).map((r) => [r.groupId, r.isActive]),
      );
      this.db
        .prepare('DELETE FROM user_group_assignments WHERE userId = ? AND companyId = ? AND viaHoldingGroupId IS NULL AND endsAt IS NULL')
        .run(userId, companyId);
      // Only one main per person and company, whatever its origin.
      if (input.mainRoleId) {
        this.db.prepare('UPDATE user_group_assignments SET isMain = 0 WHERE userId = ? AND companyId = ?').run(userId, companyId);
      }
      const insert = this.db.prepare(
        `INSERT OR REPLACE INTO user_group_assignments (userId, companyId, groupId, isMain, isActive)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const id of ids) {
        const role = roles.get(id)!;
        const active = role.needsReview ? 0 : (previous.get(id) ?? 1);
        insert.run(userId, companyId, id, id === input.mainRoleId ? 1 : 0, active);
      }
      this.changed({ companyId, actorUserId: actorId, entity: 'assignments', entityId: userId, before, after: this.assignmentShape(userId, companyId) });
    });
  }

  /**
   * Marks the system role matching the person's legacy role (users.companyRoles)
   * as their main role in that company, and every other assignment as an
   * add-on. Legacy remains the truth during shadow, so the main assignment
   * follows it. Returns whether anything changed.
   */
  syncMainAssignment(userId: string, companyId: string, actorId: string | null = null): boolean {
    if (!this.ready()) return false;
    const legacyKey = this.legacyRoleKey(userId, companyId);
    const target = legacyKey
      ? (this.db.prepare('SELECT id FROM permission_groups WHERE companyId = ? AND key = ? AND isSystem = 1').get(companyId, legacyKey) as { id: string } | undefined)
      : undefined;
    const rows = this.db
      .prepare('SELECT groupId, isMain FROM user_group_assignments WHERE userId = ? AND companyId = ?')
      .all(userId, companyId) as Array<{ groupId: string; isMain: number }>;
    if (!target || !rows.some((r) => r.groupId === target.id)) return false;
    const wrong = rows.some((r) => Boolean(r.isMain) !== (r.groupId === target.id));
    if (!wrong) return false;
    const before = this.assignmentShape(userId, companyId);
    this.db.prepare('UPDATE user_group_assignments SET isMain = 0 WHERE userId = ? AND companyId = ?').run(userId, companyId);
    this.db.prepare('UPDATE user_group_assignments SET isMain = 1 WHERE userId = ? AND companyId = ? AND groupId = ?').run(userId, companyId, target.id);
    return this.changed({ companyId, actorUserId: actorId, entity: 'assignments', entityId: userId, before, after: this.assignmentShape(userId, companyId) });
  }

  /** The legacy role key (admin/manager/...) a person holds in a company, from users.companyRoles. */
  private legacyRoleKey(userId: string, companyId: string): string | undefined {
    const row = this.db.prepare('SELECT role, companyIds, companyRoles FROM users WHERE id = ?').get(userId) as
      | { role: string; companyIds: string | null; companyRoles: string | null } | undefined;
    if (!row) return undefined;
    const parse = <T>(s: string | null): T | undefined => { try { return s ? JSON.parse(s) as T : undefined; } catch { return undefined; } };
    const roles = parse<Array<{ companyId: string; role: string }>>(row.companyRoles) ?? [];
    // Mirrors http.ts getEffectiveRole on the sanitized user: the company's
    // companyRoles entry, else the user's role when companyIds lists the
    // company. sanitizeUser derives companyIds from companyRoles whenever that
    // list is non-empty, so the companyIds fallback only applies when
    // companyRoles is empty (a raw companyIds entry beside a non-empty
    // companyRoles grants no access today).
    const companyIds = roles.length ? roles.map((r) => r.companyId) : (parse<string[]>(row.companyIds) ?? []);
    const role = roles.find((r) => r.companyId === companyId)?.role
      ?? (companyIds.includes(companyId) ? row.role : undefined);
    const key = String(role ?? '').toLowerCase();
    return LEGACY_ROLE_KEYS.has(key) ? key : undefined;
  }

  // ── Data migration (135) ───────────────────────────────────────────

  /**
   * Brings one company's roles to v2. System roles get their template's grants
   * and fields (and the Owner role is created); custom groups become add-on
   * roles converted from their old grants, needing review, with their
   * assignments inactive. Each role is converted once (convertedAt).
   * `custom: false` (the legacy company seeding) converts system roles only, so
   * custom groups convert at one well-defined moment: migrateAll().
   * Returns the number of roles changed.
   */
  migrateCompanyRoles(companyId: string, options: { custom?: boolean } = {}): number {
    if (!this.ready()) return 0;
    const custom = options.custom ?? true;
    let changed = 0;
    const now = new Date().toISOString();
    const deleted = new Set(
      (this.db.prepare('SELECT key FROM permission_group_deletions WHERE companyId = ?').all(companyId) as Array<{ key: string }>)
        .map((r) => r.key),
    );
    if (!deleted.has('owner')) {
      // Converted with the pending roles below (convertedAt is null).
      this.db
        .prepare(
          `INSERT OR IGNORE INTO permission_groups
             (id, companyId, key, name, nameAr, isSystem, isActive, createdAt, templateKey, needsReview)
           VALUES (?, ?, 'owner', ?, ?, 1, 1, ?, 'owner', 0)`,
        )
        .run(uuid(), companyId, TEMPLATES.owner.label.en, TEMPLATES.owner.label.ar, now);
    }
    const pending = this.db
      .prepare(`SELECT * FROM permission_groups WHERE companyId = ? AND convertedAt IS NULL
                  ${custom ? '' : 'AND isSystem = 1'} ORDER BY createdAt, id`)
      .all(companyId) as RoleRow[];
    for (const row of pending) {
      const legacy = (this.db
        .prepare('SELECT module, action FROM group_permissions WHERE groupId = ? ORDER BY module, action')
        .all(row.id) as Array<{ module: string; action: string }>).map((p) => `${p.module}:${p.action}`);
      const before = { ...this.auditShape(this.view(row)), legacyGrants: legacy };
      const isTemplate = Boolean(row.isSystem) && (TEMPLATE_KEYS as readonly string[]).includes(row.key);
      if (isTemplate) {
        const template = TEMPLATES[row.key as TemplateKey];
        this.writeGrants(row.id, template.grants, template.fields);
        this.db
          .prepare('UPDATE permission_groups SET templateKey = ?, nameAr = COALESCE(nameAr, ?), needsReview = 0, convertedAt = ? WHERE id = ?')
          .run(row.key, template.label.ar, now, row.id);
        this.changed({ companyId, actorUserId: null, entity: 'role', entityId: row.id, before, after: this.auditShape(this.getRole(row.id)) });
      } else {
        const converted = convertLegacyGrants(legacy);
        this.writeGrants(row.id, converted.grants, converted.fields);
        this.db
          .prepare('UPDATE permission_groups SET templateKey = NULL, needsReview = 1, convertedAt = ? WHERE id = ?')
          .run(now, row.id);
        // Ruling E: kept, but inactive until an administrator reviews the role.
        this.db.prepare('UPDATE user_group_assignments SET isActive = 0, isMain = 0 WHERE groupId = ?').run(row.id);
        this.writeAudit({
          companyId, actorUserId: null, entity: 'role', entityId: row.id, before,
          after: { ...this.auditShape(this.getRole(row.id)), unmapped: converted.unmapped },
        });
        this.bump();
      }
      changed += 1;
    }
    return changed;
  }

  /** Main-role flags for every company a person belongs to. Returns the number of changes. */
  migrateUserAssignments(userId: string): number {
    if (!this.ready()) return 0;
    const companies = (this.db
      .prepare('SELECT DISTINCT companyId FROM user_group_assignments WHERE userId = ? ORDER BY companyId')
      .all(userId) as Array<{ companyId: string }>).map((r) => r.companyId);
    return companies.reduce((n, companyId) => n + (this.syncMainAssignment(userId, companyId) ? 1 : 0), 0);
  }

  /** The whole data migration. Idempotent: a second run returns 0 and writes nothing. */
  migrateAll(): number {
    if (!this.ready()) return 0;
    return this.tx(() => {
      let n = 0;
      (this.db.prepare('SELECT id FROM companies ORDER BY id').all() as Array<{ id: string }>)
        .forEach(({ id }) => { n += this.migrateCompanyRoles(id); });
      (this.db.prepare('SELECT id FROM users ORDER BY id').all() as Array<{ id: string }>)
        .forEach(({ id }) => { n += this.migrateUserAssignments(id); });
      return n;
    });
  }

  // ── Holding groups ─────────────────────────────────────────────────

  holdingGroups(): HoldingGroupView[] {
    const groups = this.db.prepare('SELECT * FROM holding_groups ORDER BY name').all() as Array<{ id: string; name: string; nameAr: string | null; createdAt: string }>;
    return groups.map((g) => this.holdingView(g));
  }

  private holdingView(g: { id: string; name: string; nameAr: string | null; createdAt: string }): HoldingGroupView {
    return {
      ...g,
      companyIds: (this.db.prepare('SELECT id FROM companies WHERE holdingGroupId = ? ORDER BY id').all(g.id) as Array<{ id: string }>).map((r) => r.id),
      adminUserIds: (this.db.prepare('SELECT userId FROM holding_group_admins WHERE holdingGroupId = ? ORDER BY userId').all(g.id) as Array<{ userId: string }>).map((r) => r.userId),
    };
  }

  private holdingRow(id: string) {
    const row = this.db.prepare('SELECT * FROM holding_groups WHERE id = ?').get(id) as
      | { id: string; name: string; nameAr: string | null; createdAt: string } | undefined;
    if (!row) throw new Error('Group not found.');
    return row;
  }

  createHoldingGroup(input: { name: string; nameAr?: string | null }, actorId: string | null): HoldingGroupView {
    const name = String(input.name ?? '').trim();
    if (!name) throw new Error('A group needs a name.');
    return this.tx(() => {
      const row = { id: uuid(), name, nameAr: input.nameAr ?? null, createdAt: new Date().toISOString() };
      this.db.prepare('INSERT INTO holding_groups (id, name, nameAr, createdAt) VALUES (@id, @name, @nameAr, @createdAt)').run(row);
      this.changed({ holdingGroupId: row.id, actorUserId: actorId, entity: 'holding_group', entityId: row.id, before: null, after: row });
      return this.holdingView(row);
    });
  }

  /** A company belongs to at most one group. */
  attachCompany(holdingGroupId: string, companyId: string, actorId: string | null): void {
    this.tx(() => {
      this.holdingRow(holdingGroupId);
      const company = this.db.prepare('SELECT id, holdingGroupId FROM companies WHERE id = ?').get(companyId) as
        | { id: string; holdingGroupId: string | null } | undefined;
      if (!company) throw new Error('Company not found.');
      if (company.holdingGroupId && company.holdingGroupId !== holdingGroupId) {
        throw new Error('That company already belongs to another group.');
      }
      this.db.prepare('UPDATE companies SET holdingGroupId = ? WHERE id = ?').run(holdingGroupId, companyId);
      this.changed({
        companyId, holdingGroupId, actorUserId: actorId, entity: 'holding_company', entityId: companyId,
        before: { holdingGroupId: company.holdingGroupId }, after: { holdingGroupId },
      });
    });
  }

  detachCompany(companyId: string, actorId: string | null): void {
    this.tx(() => {
      const company = this.db.prepare('SELECT id, holdingGroupId FROM companies WHERE id = ?').get(companyId) as
        | { id: string; holdingGroupId: string | null } | undefined;
      if (!company) throw new Error('Company not found.');
      this.db.prepare('UPDATE companies SET holdingGroupId = NULL WHERE id = ?').run(companyId);
      this.changed({
        companyId, holdingGroupId: company.holdingGroupId, actorUserId: actorId, entity: 'holding_company', entityId: companyId,
        before: { holdingGroupId: company.holdingGroupId }, after: { holdingGroupId: null },
      });
    });
  }

  setHoldingAdmins(holdingGroupId: string, userIds: string[], actorId: string | null): void {
    this.tx(() => {
      this.holdingRow(holdingGroupId);
      const before = this.holdingView(this.holdingRow(holdingGroupId)).adminUserIds;
      this.db.prepare('DELETE FROM holding_group_admins WHERE holdingGroupId = ?').run(holdingGroupId);
      const insert = this.db.prepare('INSERT OR IGNORE INTO holding_group_admins (holdingGroupId, userId) VALUES (?, ?)');
      [...new Set(userIds)].forEach((id) => insert.run(holdingGroupId, id));
      const after = this.holdingView(this.holdingRow(holdingGroupId)).adminUserIds;
      this.changed({ holdingGroupId, actorUserId: actorId, entity: 'holding_admins', entityId: holdingGroupId, before, after });
    });
  }

  holdingAssignments(holdingGroupId: string): HoldingAssignmentRow[] {
    const rows = this.db
      .prepare('SELECT * FROM holding_group_assignments WHERE holdingGroupId = ? ORDER BY userId, isMain DESC, roleKey')
      .all(holdingGroupId) as Array<Record<string, any>>;
    return rows.map((r) => ({
      holdingGroupId: r.holdingGroupId, userId: r.userId, roleKey: r.roleKey, isMain: Boolean(r.isMain),
      startsAt: r.startsAt ?? null, endsAt: r.endsAt ?? null,
    }));
  }

  /**
   * Replaces a person's group-wide roles: a template key or a group-level role
   * key, applying in every company of the group.
   */
  setHoldingAssignment(
    holdingGroupId: string, userId: string,
    input: { mainRoleKey: string | null; addOnRoleKeys: string[] },
    actorId: string | null,
  ): void {
    this.tx(() => {
      this.holdingRow(holdingGroupId);
      const keys = [...new Set([input.mainRoleKey, ...input.addOnRoleKeys].filter((x): x is string => Boolean(x)))];
      for (const key of keys) {
        const known = (TEMPLATE_KEYS as readonly string[]).includes(key)
          || Boolean(this.db.prepare('SELECT 1 FROM permission_groups WHERE holdingGroupId = ? AND companyId IS NULL AND key = ?').get(holdingGroupId, key));
        if (!known) throw new Error(`Unknown group role: ${key}`);
      }
      const shape = () => this.holdingAssignments(holdingGroupId).filter((r) => r.userId === userId);
      const before = shape();
      this.db.prepare('DELETE FROM holding_group_assignments WHERE holdingGroupId = ? AND userId = ? AND endsAt IS NULL').run(holdingGroupId, userId);
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO holding_group_assignments (holdingGroupId, userId, roleKey, isMain) VALUES (?, ?, ?, ?)',
      );
      keys.forEach((key) => insert.run(holdingGroupId, userId, key, key === input.mainRoleKey ? 1 : 0));
      this.changed({ holdingGroupId, actorUserId: actorId, entity: 'holding_assignments', entityId: userId, before, after: shape() });
    });
  }

  // ── Record shares ──────────────────────────────────────────────────

  shares(area: string, recordId: string): ShareRow[] {
    return this.db
      .prepare('SELECT * FROM record_shares WHERE area = ? AND recordId = ? ORDER BY userId')
      .all(area, recordId) as ShareRow[];
  }

  private assertArea(area: string): void {
    if (!CATALOGUE.some((a) => a.key === area)) throw new Error(`Unknown area: ${area}`);
  }

  share(companyId: string, area: string, recordId: string, userId: string, actorId: string | null): void {
    this.assertArea(area);
    this.tx(() => {
      const added = this.db
        .prepare('INSERT OR IGNORE INTO record_shares (companyId, area, recordId, userId, sharedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
        .run(companyId, area, recordId, userId, actorId, new Date().toISOString()).changes;
      if (!added) return;
      this.changed({ companyId, actorUserId: actorId, entity: 'share', entityId: `${area}:${recordId}`, before: null, after: { userId } });
    });
  }

  unshare(companyId: string, area: string, recordId: string, userId: string, actorId: string | null): void {
    this.assertArea(area);
    this.tx(() => {
      const removed = this.db
        .prepare('DELETE FROM record_shares WHERE companyId = ? AND area = ? AND recordId = ? AND userId = ?')
        .run(companyId, area, recordId, userId).changes;
      if (!removed) return;
      this.changed({ companyId, actorUserId: actorId, entity: 'share', entityId: `${area}:${recordId}`, before: { userId }, after: null });
    });
  }

  // ── Evaluator reads (evaluate.ts, team.ts) ─────────────────────────

  /**
   * A person's direct assignments that can count (Ruling G): the assignment is
   * active and its role does not need review. The time window is checked by
   * the caller. Group-derived rows (viaHoldingGroupId) are skipped: group
   * assignments are resolved from holding_group_assignments instead.
   */
  directAssignmentsFor(userId: string): Array<{
    companyId: string; roleId: string; roleName: string; isMain: boolean; startsAt: string | null; endsAt: string | null;
  }> {
    if (!this.ready()) return [];
    const rows = this.db
      .prepare(
        `SELECT uga.companyId, uga.groupId, uga.isMain, uga.startsAt, uga.endsAt, pg.name
           FROM user_group_assignments uga JOIN permission_groups pg ON pg.id = uga.groupId
          WHERE uga.userId = ? AND uga.isActive = 1 AND pg.needsReview = 0 AND uga.viaHoldingGroupId IS NULL`,
      )
      .all(userId) as Array<{ companyId: string; groupId: string; isMain: number; startsAt: string | null; endsAt: string | null; name: string }>;
    return rows.map((r) => ({
      companyId: r.companyId, roleId: r.groupId, roleName: r.name, isMain: Boolean(r.isMain), startsAt: r.startsAt, endsAt: r.endsAt,
    }));
  }

  /** A person's group-wide assignments, with the companies currently in each group. */
  holdingAssignmentsFor(userId: string): Array<HoldingAssignmentRow & { companyIds: string[] }> {
    if (!this.ready()) return [];
    const rows = this.db
      .prepare('SELECT * FROM holding_group_assignments WHERE userId = ?')
      .all(userId) as Array<Record<string, any>>;
    const companies = this.db.prepare('SELECT id FROM companies WHERE holdingGroupId = ? ORDER BY id');
    return rows.map((r) => ({
      holdingGroupId: r.holdingGroupId, userId: r.userId, roleKey: r.roleKey, isMain: Boolean(r.isMain),
      startsAt: r.startsAt ?? null, endsAt: r.endsAt ?? null,
      companyIds: (companies.all(r.holdingGroupId) as Array<{ id: string }>).map((c) => c.id),
    }));
  }

  /**
   * The role a group assignment's key stands for in one company (Ruling H):
   * the company's own role with that key, else the group-level role row.
   * Null when neither exists; 'needs_review' when the role found needs review
   * (the caller must grant nothing, not fall back).
   */
  holdingRoleFor(companyId: string, holdingGroupId: string, roleKey: string): { id: string; name: string } | 'needs_review' | null {
    const row = (this.db.prepare('SELECT id, name, needsReview FROM permission_groups WHERE companyId = ? AND key = ?').get(companyId, roleKey)
      ?? this.db.prepare('SELECT id, name, needsReview FROM permission_groups WHERE companyId IS NULL AND holdingGroupId = ? AND key = ?').get(holdingGroupId, roleKey)) as
      | { id: string; name: string; needsReview: number } | undefined;
    if (!row) return null;
    if (row.needsReview) return 'needs_review';
    return { id: row.id, name: row.name };
  }

  /** A role's v2 grants and sensitive-field switches. */
  roleContent(roleId: string): { grants: TemplateGrant[]; fields: TemplateField[] } {
    return { grants: this.grantsOf(roleId), fields: this.fieldsOf(roleId) };
  }

  /** The system role row a legacy role maps to in a company, if it exists. */
  systemRole(companyId: string, key: string): { id: string; name: string } | undefined {
    if (!this.ready()) return undefined;
    return this.db.prepare('SELECT id, name FROM permission_groups WHERE companyId = ? AND key = ? AND isSystem = 1').get(companyId, key) as
      | { id: string; name: string } | undefined;
  }

  /** Each company's legacy role key (admin/manager/accountant/employee) from users.companyRoles. */
  legacyRolesFor(userId: string): Array<{ companyId: string; key: TemplateKey }> {
    const row = this.db.prepare('SELECT companyIds, companyRoles FROM users WHERE id = ?').get(userId) as
      | { companyIds: string | null; companyRoles: string | null } | undefined;
    if (!row) return [];
    const parse = <T>(s: string | null): T | undefined => { try { return s ? JSON.parse(s) as T : undefined; } catch { return undefined; } };
    const ids = new Set([
      ...(parse<Array<{ companyId: string }>>(row.companyRoles) ?? []).map((r) => r.companyId),
      ...(parse<string[]>(row.companyIds) ?? []),
    ]);
    const out: Array<{ companyId: string; key: TemplateKey }> = [];
    for (const companyId of ids) {
      const key = this.legacyRoleKey(userId, companyId);
      if (key) out.push({ companyId, key: key as TemplateKey });
    }
    return out;
  }

  /** The users.companyRoles signature, so a cached legacy answer notices a role change. */
  legacySignature(userId: string): string {
    const row = this.db.prepare('SELECT role, companyIds, companyRoles FROM users WHERE id = ?').get(userId) as
      | { role: string; companyIds: string | null; companyRoles: string | null } | undefined;
    return row ? `${row.role}|${row.companyIds}|${row.companyRoles}` : '';
  }

  /** Employee manager edges in a company, for the team line. */
  employeeLines(companyId: string): Array<{ id: string; userId: string | null; managerId: string | null; status: string }> {
    return this.db.prepare('SELECT id, userId, managerId, status FROM employees WHERE companyId = ?').all(companyId) as
      Array<{ id: string; userId: string | null; managerId: string | null; status: string }>;
  }

  /** Moves whenever an employee row in the company changes line (triggers, migration 136). */
  teamVersion(companyId: string): number {
    const row = this.db.prepare('SELECT version FROM team_versions WHERE companyId = ?').get(companyId) as { version: number } | undefined;
    return row?.version ?? 0;
  }

  // ── Audit ──────────────────────────────────────────────────────────

  audit(filter: { companyId?: string; holdingGroupId?: string; entity?: string; entityId?: string; limit?: number } = {}): AuditRow[] {
    const where: string[] = [];
    const params: unknown[] = [];
    for (const col of ['companyId', 'holdingGroupId', 'entity', 'entityId'] as const) {
      if (filter[col] !== undefined) { where.push(`${col} = ?`); params.push(filter[col]); }
    }
    const limit = Math.min(Math.max(Number(filter.limit) || 500, 1), 5000);
    const rows = this.db
      .prepare(`SELECT * FROM permission_audit ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${limit}`)
      .all(...params) as Array<Record<string, any>>;
    return rows.map((r) => ({
      id: r.id, companyId: r.companyId, holdingGroupId: r.holdingGroupId, actorUserId: r.actorUserId,
      entity: r.entity, entityId: r.entityId,
      before: r.before === null ? null : JSON.parse(r.before),
      after: r.after === null ? null : JSON.parse(r.after),
      at: r.at,
    }));
  }
}
