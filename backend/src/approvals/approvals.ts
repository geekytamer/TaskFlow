import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * Approvals (spec 2026-11-03-approvals-design). A company sets, per document
 * type, a policy: ordered steps, each naming who decides (a team such as
 * Legal or Finance, a role, a person, or the requester's manager), whether
 * any one of them or all of them must approve, and the amount band it
 * applies to. A document needs every step whose band its amount falls in,
 * in order. One person decides at most one step (and one slot of an "all"
 * step); the requester never approves their own request unless the policy
 * allows it (converted pre-2026-11-03 rules do, as before). Any rejection
 * rejects; "send back" ends it as changes requested. A company with no
 * policy for a type uses its group's, and with none at all keeps its old
 * behaviour.
 */

export type ApprovalDocType =
  | 'purchase_order' | 'expense' | 'vendor_bill' | 'vendor_payment' | 'invoice' | 'credit_note'
  | 'quotation' | 'payroll_run' | 'document' | 'purchase_requisition' | 'leave_request';
export const APPROVAL_DOC_TYPES: ApprovalDocType[] = [
  'purchase_order', 'expense', 'vendor_bill', 'vendor_payment', 'invoice', 'credit_note',
  'quotation', 'payroll_run', 'document', 'purchase_requisition', 'leave_request',
];
/** A role approver. An Admin may act for any role step (as before 2026-11-03). */
export type ApproverRole = 'Manager' | 'Admin' | 'Accountant';
export const APPROVER_ROLES: ApproverRole[] = ['Manager', 'Accountant', 'Admin'];

export type Approver =
  | { kind: 'role'; id: ApproverRole }
  | { kind: 'team'; id: string }
  | { kind: 'user'; id: string }
  | { kind: 'manager' };
export type Need = 'any' | 'all';

/** What a step can route on besides amount (spec 2026-11-04, "Conditions other than amount"). */
export type ConditionField = 'supplier' | 'client' | 'category' | 'project' | 'department' | 'leaveType' | 'template';
export type ConditionOp = 'is' | 'is_not';
export interface StepCondition { field: ConditionField; op: ConditionOp; values: string[] }
/** The facts of one document that conditions are checked against. */
export type ApprovalFacts = Partial<Record<ConditionField, string | null | undefined>>;
/** Typed text, matched without regard to case or surrounding spaces (the others are record ids). */
export const TEXT_FIELDS: ConditionField[] = ['category', 'department'];
/** The fields each document records. */
export const CONDITION_FIELDS: Record<ApprovalDocType, ConditionField[]> = {
  purchase_order: ['supplier'], vendor_bill: ['supplier'], vendor_payment: ['supplier'],
  expense: ['category', 'project'], invoice: ['client'], quotation: ['client'], credit_note: ['client'],
  purchase_requisition: ['department', 'supplier'], leave_request: ['leaveType'], document: ['template'], payroll_run: [],
};

const norm = (field: ConditionField, v: string) => (TEXT_FIELDS.includes(field) ? v.trim().toLowerCase() : v);
/** Every condition holds for these facts: "is" needs the value among them; "is not" passes a missing value. */
export function conditionsHold(conditions: StepCondition[], facts: ApprovalFacts): boolean {
  return conditions.every((c) => {
    const raw = facts[c.field];
    const value = raw === null || raw === undefined || raw === '' ? null : norm(c.field, String(raw));
    const listed = value !== null && c.values.some((v) => norm(c.field, v) === value);
    return c.op === 'is' ? listed : !listed;
  });
}

export interface ApprovalRule {
  id: string; companyId: string; docType: ApprovalDocType; minAmount: number; maxAmount: number | null;
  /** The first role among the approvers, kept for older screens. */
  approverRole: ApproverRole;
  approvers: Approver[]; need: Need; position: number;
  /** On a group company: this step also runs, after their own, for documents of every company below. */
  alsoBelow: boolean;
  /** Besides the amount band, every condition must hold for the step to apply. */
  conditions: StepCondition[];
}
export type StepStatus = 'pending' | 'approved' | 'rejected';
export interface ApprovalStep {
  docType: ApprovalDocType; docId: string; level: number; minAmount: number; approverRole: ApproverRole;
  approvers: Approver[]; need: Need;
  /** Whose people decide this step: the document's company, or the group whose sign-off it is. */
  ownerCompanyId: string;
  status: StepStatus; decidedByUserId: string | null; decidedByName: string | null; decidedAt: string | null; note: string | null;
}
export type ApprovalOutcome = 'not_required' | 'pending' | 'approved' | 'rejected' | 'changes_requested';
export type TrailKind = 'started' | 'skipped' | 'noted' | 'approved' | 'rejected' | 'changes_requested' | 'reminded' | 'escalated' | 'restarted' | 'reassigned';
export interface TrailEntry {
  level: number | null; slot: number | null; kind: TrailKind; userId: string | null; userName: string | null;
  onBehalfOf: string | null; note: string | null; at: string;
}
export interface ApprovalTeam {
  id: string; companyId: string; name: string;
  members: Array<{ kind: 'role' | 'user'; value: string }>;
}
export interface ApprovalPolicy { allowSelf: boolean; reminderHours: number; escalateHours: number }

/** What the engine needs to know about people (supplied by the DataStore). */
export interface ApprovalPeople {
  roleOf: (userId: string, companyId: string) => string | undefined;
  /** The login of the person's HR line manager in this company, or null. */
  managerOf: (userId: string, companyId: string) => string | null;
  /** Logins holding exactly this role in the company. */
  usersWithRole: (companyId: string, role: string) => string[];
  nameOf: (userId: string) => string;
  /** Whether this person can work in the company at all (only then can they decide its documents). */
  reaches: (userId: string, companyId: string) => boolean;
}

/** Credit notes and vendor payments post when recorded, so with a policy they are held until approved. */
export type HoldDocType = 'credit_note' | 'vendor_payment';
export interface ApprovalHold {
  id: string; companyId: string; docType: HoldDocType; targetId: string | null;
  payload: Record<string, unknown>; amount: number; label: string; party: string | null;
  status: 'pending' | 'approved' | 'failed' | 'rejected' | 'withdrawn';
  resultId: string | null; error: string | null; note: string | null; requesterId: string | null;
  createdAt: string; endedAt: string | null;
}

export class ApprovalError extends Error {}

const parse = <T>(text: unknown, fallback: T): T => {
  if (typeof text !== 'string' || !text) return fallback;
  try { return JSON.parse(text) as T; } catch { return fallback; }
};
const legacyApprovers = (row: { approvers?: string | null; approverRole: string }): Approver[] =>
  parse<Approver[] | null>(row.approvers, null) ?? [{ kind: 'role', id: row.approverRole as ApproverRole }];
const firstRole = (approvers: Approver[]): ApproverRole =>
  (approvers.find((a): a is { kind: 'role'; id: ApproverRole } => a.kind === 'role')?.id) ?? 'Admin';

/** Which approver roles a company role can act as (an Admin for any role step). */
export function rolesActingAs(companyRole: string | undefined): ApproverRole[] {
  if (companyRole === 'Admin') return ['Admin', 'Manager', 'Accountant'];
  if (companyRole === 'Manager') return ['Manager'];
  if (companyRole === 'Accountant') return ['Accountant'];
  return [];
}

/** The steps a document of this amount needs, in order. */
export type ApprovalLevel = { minAmount: number; approverRole: ApproverRole; approvers: Approver[]; need: Need; ownerCompanyId?: string; alsoBelow?: boolean };
export function levelsFor(rules: ApprovalRule[], amount: number, facts: ApprovalFacts = {}): ApprovalLevel[] {
  return [...rules]
    .sort((a, b) => a.position - b.position || a.minAmount - b.minAmount)
    .filter((r) => amount >= r.minAmount && (r.maxAmount === null || amount <= r.maxAmount) && conditionsHold(r.conditions ?? [], facts))
    .map((r) => ({ minAmount: r.minAmount, approverRole: r.approverRole, approvers: r.approvers, need: r.need, alsoBelow: r.alsoBelow }));
}

export function outcomeOf(steps: ApprovalStep[]): ApprovalOutcome {
  if (steps.length === 0) return 'not_required';
  if (steps.some((s) => s.status === 'rejected')) return 'rejected';
  return steps.every((s) => s.status === 'approved') ? 'approved' : 'pending';
}

export class ApprovalStore {
  people: ApprovalPeople | null = null;

  constructor(private readonly db: Database.Database) {}

  private get who(): ApprovalPeople {
    if (!this.people) throw new Error('Approvals need the people directory.');
    return this.people;
  }

  // ── Policies (rules are their steps) ───────────────────────────────

  rules(companyId: string, docType?: ApprovalDocType): ApprovalRule[] {
    const rows = (docType
      ? this.db.prepare('SELECT * FROM approval_rules WHERE companyId = ? AND docType = ? ORDER BY position, minAmount').all(companyId, docType)
      : this.db.prepare('SELECT * FROM approval_rules WHERE companyId = ? ORDER BY docType, position, minAmount').all(companyId)) as Array<Record<string, any>>;
    return rows.map((r) => {
      const approvers = legacyApprovers(r as { approvers?: string; approverRole: string });
      return {
        id: r.id, companyId: r.companyId, docType: r.docType, minAmount: Number(r.minAmount) || 0,
        maxAmount: r.maxAmount === null || r.maxAmount === undefined ? null : Number(r.maxAmount),
        approverRole: firstRole(approvers), approvers, need: r.need === 'all' ? 'all' : 'any', position: Number(r.position) || 0,
        alsoBelow: Boolean(r.alsoBelow), conditions: parse<StepCondition[]>(r.conditions, []),
      };
    });
  }

  policy(companyId: string, docType: ApprovalDocType): ApprovalPolicy {
    const row = this.db.prepare('SELECT * FROM approval_policies WHERE companyId = ? AND docType = ?').get(companyId, docType) as
      | { allowSelf: number; reminderHours: number; escalateHours: number } | undefined;
    return { allowSelf: Boolean(row?.allowSelf), reminderHours: row?.reminderHours ?? 24, escalateHours: row?.escalateHours ?? 72 };
  }

  /** Replaces a document type's rules the old way (one role per level, by amount): today's behaviour kept. */
  setRules(companyId: string, docType: ApprovalDocType, rules: Array<{ minAmount: number; approverRole: ApproverRole }>): void {
    this.setPolicy(companyId, docType, {
      steps: [...rules].sort((a, b) => a.minAmount - b.minAmount).map((r) => ({ approvers: [{ kind: 'role', id: r.approverRole }], need: 'any' as Need, minAmount: r.minAmount })),
      allowSelf: true,
    });
  }

  /** Replaces a document type's policy. No steps: the company has none (and uses its group's, if any). */
  setPolicy(companyId: string, docType: ApprovalDocType, input: {
    steps: Array<{ approvers: Approver[]; need: Need; minAmount?: number | null; maxAmount?: number | null; alsoBelow?: boolean; conditions?: StepCondition[] }>;
    allowSelf?: boolean; reminderHours?: number; escalateHours?: number;
  }): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM approval_rules WHERE companyId = ? AND docType = ?').run(companyId, docType);
      this.db.prepare('DELETE FROM approval_policies WHERE companyId = ? AND docType = ?').run(companyId, docType);
      if (!input.steps.length) return;
      const insert = this.db.prepare(
        'INSERT INTO approval_rules (id, companyId, docType, minAmount, maxAmount, approverRole, approvers, need, position, alsoBelow, conditions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      input.steps.forEach((s, i) => insert.run(
        uuid(), companyId, docType, s.minAmount ?? 0, s.maxAmount ?? null, firstRole(s.approvers), JSON.stringify(s.approvers), s.need, i, s.alsoBelow ? 1 : 0,
        s.conditions?.length ? JSON.stringify(s.conditions) : null,
      ));
      this.db.prepare('INSERT INTO approval_policies (companyId, docType, allowSelf, reminderHours, escalateHours) VALUES (?, ?, ?, ?, ?)')
        .run(companyId, docType, input.allowSelf ? 1 : 0, input.reminderHours ?? 24, input.escalateHours ?? 72);
    })();
  }

  // ── Teams ──────────────────────────────────────────────────────────

  teams(companyId: string): ApprovalTeam[] {
    const teams = this.db.prepare('SELECT id, companyId, name FROM approval_teams WHERE companyId = ? ORDER BY name').all(companyId) as Array<{ id: string; companyId: string; name: string }>;
    return teams.map((t) => ({ ...t, members: this.membersOf(t.id) }));
  }

  team(id: string): ApprovalTeam | undefined {
    const t = this.db.prepare('SELECT id, companyId, name FROM approval_teams WHERE id = ?').get(id) as { id: string; companyId: string; name: string } | undefined;
    return t ? { ...t, members: this.membersOf(t.id) } : undefined;
  }

  private membersOf(teamId: string) {
    return this.db.prepare('SELECT kind, value FROM approval_team_members WHERE teamId = ? ORDER BY kind, value').all(teamId) as Array<{ kind: 'role' | 'user'; value: string }>;
  }

  saveTeam(companyId: string, input: { id?: string; name: string; members: Array<{ kind: 'role' | 'user'; value: string }> }): ApprovalTeam {
    const name = String(input.name ?? '').trim();
    if (!name) throw new ApprovalError('A team needs a name.');
    return this.db.transaction(() => {
      const id = input.id ?? uuid();
      if (input.id) {
        const existing = this.team(input.id);
        if (!existing || existing.companyId !== companyId) throw new ApprovalError('Team not found.');
        this.db.prepare('UPDATE approval_teams SET name = ? WHERE id = ?').run(name, id);
        this.db.prepare('DELETE FROM approval_team_members WHERE teamId = ?').run(id);
      } else {
        this.db.prepare('INSERT INTO approval_teams (id, companyId, name, createdAt) VALUES (?, ?, ?, ?)').run(id, companyId, name, new Date().toISOString());
      }
      const add = this.db.prepare('INSERT OR IGNORE INTO approval_team_members (teamId, kind, value) VALUES (?, ?, ?)');
      input.members.forEach((m) => add.run(id, m.kind, m.value));
      return this.team(id)!;
    })();
  }

  deleteTeam(companyId: string, id: string): void {
    const inUse = (this.db.prepare('SELECT approvers FROM approval_rules').all() as Array<{ approvers: string | null }>)
      .some((r) => parse<Approver[]>(r.approvers, []).some((a) => a.kind === 'team' && a.id === id));
    if (inUse) throw new ApprovalError('This team is in an approval policy. Take it out of the policy first.');
    this.db.prepare('DELETE FROM approval_teams WHERE id = ? AND companyId = ?').run(id, companyId);
  }

  // ── Delegation ─────────────────────────────────────────────────────

  delegation(userId: string): { toUserId: string; startsAt: string; endsAt: string } | null {
    return (this.db.prepare('SELECT toUserId, startsAt, endsAt FROM approval_delegations WHERE fromUserId = ?').get(userId) as
      { toUserId: string; startsAt: string; endsAt: string } | undefined) ?? null;
  }

  setDelegation(userId: string, input: { toUserId: string; startsAt: string; endsAt: string } | null): void {
    this.db.prepare('DELETE FROM approval_delegations WHERE fromUserId = ?').run(userId);
    if (!input) return;
    if (input.toUserId === userId) throw new ApprovalError('Hand your approvals to someone else.');
    if (input.endsAt < input.startsAt) throw new ApprovalError('The end can\'t be before the start.');
    this.db.prepare('INSERT INTO approval_delegations (fromUserId, toUserId, startsAt, endsAt) VALUES (?, ?, ?, ?)')
      .run(userId, input.toUserId, input.startsAt, input.endsAt);
  }

  /** People who have handed their approvals to this person right now. */
  private delegatorsOf(userId: string, now = new Date().toISOString()): string[] {
    return (this.db.prepare('SELECT fromUserId FROM approval_delegations WHERE toUserId = ? AND startsAt <= ? AND endsAt >= ?')
      .all(userId, now.slice(0, 10), now.slice(0, 10)) as Array<{ fromUserId: string }>).map((r) => r.fromUserId);
  }

  // ── Requests ───────────────────────────────────────────────────────

  steps(docType: ApprovalDocType, docId: string): ApprovalStep[] {
    const rows = this.db.prepare('SELECT * FROM approval_steps WHERE docType = ? AND docId = ? ORDER BY level').all(docType, docId) as Array<Record<string, any>>;
    return rows.map((r) => {
      const approvers = legacyApprovers(r as { approvers?: string; approverRole: string });
      return { ...(r as ApprovalStep), approvers, need: r.need === 'all' ? 'all' : 'any', approverRole: firstRole(approvers), ownerCompanyId: r.ownerCompanyId ?? r.companyId };
    });
  }

  private request(docType: ApprovalDocType, docId: string) {
    return this.db.prepare('SELECT * FROM approval_requests WHERE docType = ? AND docId = ?').get(docType, docId) as
      | { companyId: string; requesterId: string | null; status: ApprovalOutcome; policyCompanyId: string | null; managerUserId: string | null } | undefined;
  }

  /**
   * The requester's manager. A request may carry its own (leave recorded for
   * someone without a login: their HR line manager; '' means none), else the
   * requester's HR line manager in the document's company.
   */
  private managerFor(requesterId: string | null, docCompanyId: string, managerUserId?: string | null): string | null {
    if (typeof managerUserId === 'string') return managerUserId || null;
    return requesterId && this.people ? this.who.managerOf(requesterId, docCompanyId) : null;
  }

  /**
   * Starts (or restarts) a document's request from these steps. A step for
   * the requester's manager is left out, with a note, when they have none.
   * Returns not_required when no step is left.
   */
  start(
    companyId: string, docType: ApprovalDocType, docId: string,
    levels: Array<{ minAmount: number; approverRole: ApproverRole; approvers?: Approver[]; need?: Need; ownerCompanyId?: string; note?: string }>,
    requesterId: string | null = null, policyCompanyId: string | null = null,
    /** A fixed manager for this request ('' for none); leave it out to use the requester's. */
    managerUserId?: string | null,
  ): ApprovalOutcome {
    return this.db.transaction(() => {
      const restarting = Boolean(this.request(docType, docId));
      this.clear(docType, docId);
      const at = new Date().toISOString();
      const trail = this.db.prepare('INSERT INTO approval_decisions (docType, docId, level, slot, kind, userId, onBehalfOf, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const kept = levels.filter((l) => {
        const approvers = l.approvers ?? [{ kind: 'role', id: l.approverRole } as Approver];
        const needsManager = approvers.length === 1 && approvers[0].kind === 'manager';
        if (needsManager && !this.managerFor(requesterId, companyId, managerUserId)) {
          trail.run(docType, docId, null, null, 'skipped', null, null, 'The requester has no manager on record, so the manager step was left out.', at);
          return false;
        }
        return true;
      });
      const insert = this.db.prepare(
        "INSERT INTO approval_steps (companyId, docType, docId, level, minAmount, approverRole, approvers, need, ownerCompanyId, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
      );
      kept.forEach((l, i) => {
        const approvers = l.approvers ?? [{ kind: 'role', id: l.approverRole } as Approver];
        insert.run(companyId, docType, docId, i + 1, l.minAmount, firstRole(approvers), JSON.stringify(approvers), l.need ?? 'any', l.ownerCompanyId ?? companyId);
      });
      const status: ApprovalOutcome = kept.length ? 'pending' : 'not_required';
      this.db.prepare('INSERT OR REPLACE INTO approval_requests (docType, docId, companyId, requesterId, status, policyCompanyId, startedAt, managerUserId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(docType, docId, companyId, requesterId, status, policyCompanyId ?? companyId, at, typeof managerUserId === 'string' ? managerUserId : null);
      if (kept.length) trail.run(docType, docId, null, null, restarting ? 'restarted' : 'started', requesterId, null, null, at);
      // Notes on the steps (a group band in another currency) come after the start, once each.
      [...new Map(kept.map((l, i) => [l.note, i + 1] as const)).entries()].forEach(([note, level]) => {
        if (note) trail.run(docType, docId, level, null, 'noted', null, null, note, at);
      });
      return status;
    })();
  }

  /** The document is gone: its request and steps go (the trail stays for the record). */
  forget(docType: ApprovalDocType, docId: string): void {
    this.db.prepare('DELETE FROM approval_steps WHERE docType = ? AND docId = ?').run(docType, docId);
    this.db.prepare('DELETE FROM approval_requests WHERE docType = ? AND docId = ?').run(docType, docId);
  }

  clear(docType: ApprovalDocType, docId: string): void {
    this.db.prepare('DELETE FROM approval_steps WHERE docType = ? AND docId = ?').run(docType, docId);
  }

  trail(docType: ApprovalDocType, docId: string): TrailEntry[] {
    const rows = this.db.prepare('SELECT level, slot, kind, userId, onBehalfOf, note, at FROM approval_decisions WHERE docType = ? AND docId = ? ORDER BY id')
      .all(docType, docId) as Array<Omit<TrailEntry, 'userName'>>;
    return rows.map((r) => ({ ...r, userName: r.userId && this.people ? this.who.nameOf(r.userId) : null }));
  }

  outcome(docType: ApprovalDocType, docId: string): ApprovalOutcome {
    const req = this.request(docType, docId);
    if (req?.status === 'changes_requested') return 'changes_requested';
    return outcomeOf(this.steps(docType, docId));
  }

  // ── Who decides ────────────────────────────────────────────────────

  /** A readable name for an approver, for messages and the inbox. */
  label(a: Approver): string {
    if (a.kind === 'role') return a.id === 'Manager' ? 'a Manager' : `an ${a.id}`;
    if (a.kind === 'team') return this.team(a.id)?.name ?? 'a team';
    if (a.kind === 'user') return this.people ? this.who.nameOf(a.id) : 'a named person';
    return "the requester's manager";
  }

  /**
   * Whether this person fills this approver. `ownerId` is the company whose
   * people decide the step (the document's, or the group signing off): they
   * must work there, with their role there. The manager is the requester's,
   * in the document's company.
   */
  private qualifies(a: Approver, userId: string, ownerId: string, docCompanyId: string, requesterId: string | null, managerUserId?: string | null): boolean {
    if (!this.who.reaches(userId, ownerId)) return false;
    const role = this.who.roleOf(userId, ownerId);
    if (a.kind === 'role') return rolesActingAs(role).includes(a.id);
    if (a.kind === 'user') return a.id === userId;
    if (a.kind === 'manager') return this.managerFor(requesterId, docCompanyId, managerUserId) === userId;
    const team = this.team(a.id);
    return Boolean(team?.members.some((m) => (m.kind === 'user' ? m.value === userId : m.value === role)));
  }

  /** Everyone who could fill this approver now (empty: nobody can). */
  candidates(a: Approver, ownerId: string, requesterId: string | null, docCompanyId: string = ownerId, managerUserId?: string | null): string[] {
    return this.anyone(a, ownerId, requesterId, docCompanyId, managerUserId).filter((id) => this.who.reaches(id, ownerId));
  }

  private anyone(a: Approver, companyId: string, requesterId: string | null, docCompanyId: string, managerUserId?: string | null): string[] {
    if (a.kind === 'user') return [a.id];
    if (a.kind === 'manager') return [this.managerFor(requesterId, docCompanyId, managerUserId)].filter((x): x is string => Boolean(x));
    if (a.kind === 'role') {
      return [...new Set([...this.who.usersWithRole(companyId, a.id), ...this.who.usersWithRole(companyId, 'Admin')])];
    }
    const team = this.team(a.id);
    if (!team) return [];
    return [...new Set(team.members.flatMap((m) => (m.kind === 'user' ? [m.value] : this.who.usersWithRole(companyId, m.value))))];
  }

  /** The trail id of this request's latest start: decisions before it belong to an earlier round. */
  private roundStart(docType: ApprovalDocType, docId: string): number {
    const row = this.db.prepare("SELECT MAX(id) id FROM approval_decisions WHERE docType = ? AND docId = ? AND kind IN ('started', 'restarted')").get(docType, docId) as { id: number | null };
    return row.id ?? 0;
  }

  /** The slots of the current step still to be filled ("any": the whole step is one slot). */
  private openSlots(step: ApprovalStep): number[] {
    if (step.need === 'any') return [0];
    const filled = new Set((this.db.prepare("SELECT slot FROM approval_decisions WHERE docType = ? AND docId = ? AND level = ? AND kind = 'approved' AND id > ?")
      .all(step.docType, step.docId, step.level, this.roundStart(step.docType, step.docId)) as Array<{ slot: number }>).map((r) => r.slot));
    return step.approvers.map((_, i) => i).filter((i) => !filled.has(i));
  }

  private slotApprovers(step: ApprovalStep, slot: number): Approver[] {
    return step.need === 'any' ? step.approvers : [step.approvers[slot]];
  }

  /** Who already approved anything on this document (one person, one step). */
  private approvedBy(docType: ApprovalDocType, docId: string): Set<string> {
    return new Set((this.db.prepare("SELECT userId, onBehalfOf FROM approval_decisions WHERE docType = ? AND docId = ? AND kind = 'approved' AND id > ?")
      .all(docType, docId, this.roundStart(docType, docId)) as Array<{ userId: string; onBehalfOf: string | null }>).flatMap((r) => [r.userId, r.onBehalfOf].filter((x): x is string => Boolean(x))));
  }

  /**
   * The slot this person (or someone who handed them their approvals) may
   * fill on the current step, or why not.
   */
  private seat(docType: ApprovalDocType, docId: string, userId: string, decision: 'approve' | 'reject' | 'send_back' = 'approve'):
    | { ok: true; step: ApprovalStep; slot: number; onBehalfOf: string | null; companyId: string }
    | { ok: false; reason: string } {
    const req = this.request(docType, docId);
    const steps = this.steps(docType, docId);
    if (!req || req.status === 'changes_requested' || outcomeOf(steps) !== 'pending') return { ok: false, reason: 'Nothing is waiting for approval on this document.' };
    const step = steps.find((s) => s.status === 'pending')!;
    // A group's sign-off follows the group's own rules (self-approval), not the company's.
    const policy = this.policy(step.ownerCompanyId !== req.companyId ? step.ownerCompanyId : req.policyCompanyId ?? req.companyId, docType);
    const already = this.approvedBy(docType, docId);
    // One person, one approval: having approved an earlier step, they may still refuse a later one.
    if (decision === 'approve' && already.has(userId)) return { ok: false, reason: 'You approved an earlier step of this document; someone else must approve this one.' };
    let ownBlocked = false;
    for (const identity of [userId, ...this.delegatorsOf(userId)]) {
      const onBehalfOf = identity === userId ? null : identity;
      if (decision === 'approve' && onBehalfOf && already.has(onBehalfOf)) continue;
      if (!policy.allowSelf && req.requesterId && (identity === req.requesterId || userId === req.requesterId)) { ownBlocked = true; continue; }
      for (const slot of this.openSlots(step)) {
        if (this.slotApprovers(step, slot).some((a) => this.qualifies(a, identity, step.ownerCompanyId, req.companyId, req.requesterId, req.managerUserId))) {
          return { ok: true, step, slot, onBehalfOf, companyId: req.companyId };
        }
      }
    }
    if (ownBlocked) return { ok: false, reason: "You can't approve your own request." };
    const who = this.openSlots(step).flatMap((s) => this.slotApprovers(step, s)).map((a) => this.label(a));
    return { ok: false, reason: `Step ${step.level} needs ${[...new Set(who)].join(' or ')}.` };
  }

  /** Records one decision on the current step and returns where the document now stands. */
  decide(docType: ApprovalDocType, docId: string, user: { id: string; name: string }, decision: 'approve' | 'reject' | 'send_back', note?: string): ApprovalOutcome {
    const text = note?.trim() || null;
    if (decision === 'send_back' && !text) throw new ApprovalError('Say what needs changing: a reason is required to send it back.');
    const at = new Date().toISOString();
    return this.db.transaction(() => {
      // Checked inside the transaction: two decisions at once can't both take the same seat.
      const seat = this.seat(docType, docId, user.id, decision);
      if (!seat.ok) throw new ApprovalError(seat.reason);
      const { step, slot, onBehalfOf } = seat;
      const kind: TrailKind = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'changes_requested';
      this.db.prepare('INSERT INTO approval_decisions (docType, docId, level, slot, kind, userId, onBehalfOf, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(docType, docId, step.level, slot, kind, user.id, onBehalfOf, text, at);
      // "any": one approval ends the step; "all": the last open slot does.
      const finishes = decision !== 'approve' || step.need === 'any' || this.openSlots(step).length === 0;
      if (finishes) {
        this.db.prepare('UPDATE approval_steps SET status = ?, decidedByUserId = ?, decidedByName = ?, decidedAt = ?, note = ? WHERE docType = ? AND docId = ? AND level = ?')
          .run(decision === 'approve' ? 'approved' : 'rejected', user.id, user.name, at, text, docType, docId, step.level);
      }
      const outcome: ApprovalOutcome = decision === 'send_back' ? 'changes_requested' : outcomeOf(this.steps(docType, docId));
      this.db.prepare('UPDATE approval_requests SET status = ?, endedAt = ? WHERE docType = ? AND docId = ?')
        .run(outcome, outcome === 'pending' ? null : at, docType, docId);
      return outcome;
    })();
  }

  /** Whether this person is on this request: deciding its current step now, or having decided a step. */
  involves(docType: ApprovalDocType, docId: string, userId: string): boolean {
    if (this.seat(docType, docId, userId).ok) return true;
    return Boolean(this.db.prepare("SELECT 1 FROM approval_decisions WHERE docType = ? AND docId = ? AND (userId = ? OR onBehalfOf = ?) AND kind IN ('approved', 'rejected', 'changes_requested')")
      .get(docType, docId, userId, userId));
  }

  /** Whether this person (or someone they stand in for) can decide the current step now. */
  canDecide(docType: ApprovalDocType, docId: string, userId: string): boolean {
    return this.seat(docType, docId, userId).ok;
  }

  /** Whether this person decides the current step for someone else (a delegation), or for themselves. */
  actingFor(docType: ApprovalDocType, docId: string, userId: string): string | null {
    const seat = this.seat(docType, docId, userId);
    return seat.ok ? seat.onBehalfOf : null;
  }

  /** Documents of this company waiting at a step this person (or their delegator) may decide. */
  waitingFor(companyId: string, userId: string): Array<{ docType: ApprovalDocType; docId: string; level: number; onBehalfOf: string | null }> {
    // This company's documents, and documents below it waiting at this company's sign-off.
    const rows = this.db.prepare(
      `SELECT r.docType, r.docId FROM approval_requests r WHERE r.status = 'pending' AND (r.companyId = ?
          OR EXISTS (SELECT 1 FROM approval_steps s WHERE s.docType = r.docType AND s.docId = r.docId AND s.status = 'pending' AND s.ownerCompanyId = ?))`,
    ).all(companyId, companyId) as Array<{ docType: ApprovalDocType; docId: string }>;
    return rows.flatMap((r) => {
      const seat = this.seat(r.docType, r.docId, userId);
      return seat.ok ? [{ docType: r.docType, docId: r.docId, level: seat.step.level, onBehalfOf: seat.onBehalfOf }] : [];
    });
  }

  /** Requests this person started, newest first. */
  requestedBy(companyId: string, userId: string): Array<{ docType: ApprovalDocType; docId: string; status: ApprovalOutcome }> {
    return this.db.prepare('SELECT docType, docId, status FROM approval_requests WHERE companyId = ? AND requesterId = ? ORDER BY startedAt DESC LIMIT 200')
      .all(companyId, userId) as Array<{ docType: ApprovalDocType; docId: string; status: ApprovalOutcome }>;
  }

  /** Requests this person decided (for themselves or someone else), newest first. */
  decidedBy(companyId: string, userId: string): Array<{ docType: ApprovalDocType; docId: string; status: ApprovalOutcome }> {
    return this.db.prepare(
      `SELECT DISTINCT r.docType, r.docId, r.status FROM approval_requests r JOIN approval_decisions d ON d.docType = r.docType AND d.docId = r.docId
        WHERE (r.companyId = ? OR EXISTS (SELECT 1 FROM approval_steps s WHERE s.docType = d.docType AND s.docId = d.docId AND s.level = d.level AND s.ownerCompanyId = ?))
          AND d.userId = ? AND d.kind IN ('approved', 'rejected', 'changes_requested') ORDER BY d.at DESC LIMIT 200`,
    ).all(companyId, companyId, userId) as Array<{ docType: ApprovalDocType; docId: string; status: ApprovalOutcome }>;
  }

  /**
   * Nobody can decide this waiting step: no one fills an approver ("any":
   * every approver; "all": any one of them), counting that the requester
   * can't decide their own request unless its policy allows it.
   */
  private stuck(s: ApprovalStep, req: NonNullable<ReturnType<ApprovalStore['request']>>, docType: ApprovalDocType): boolean {
    if (s.status !== 'pending' || this.people === null) return false;
    const policy = this.policy(s.ownerCompanyId !== req.companyId ? s.ownerCompanyId : req.policyCompanyId ?? req.companyId, docType);
    const empty = (a: Approver) => this.candidates(a, s.ownerCompanyId, req.requesterId, req.companyId, req.managerUserId)
      .filter((id) => policy.allowSelf || id !== req.requesterId).length === 0;
    return s.need === 'all' ? s.approvers.some(empty) : s.approvers.every(empty);
  }

  /** The request as a reader sees it: steps with who and whether anyone can fill them, and the trail. */
  view(docType: ApprovalDocType, docId: string) {
    const req = this.request(docType, docId);
    const steps = this.steps(docType, docId).map((s) => ({
      level: s.level, status: s.status, need: s.need, minAmount: s.minAmount, ownerCompanyId: s.ownerCompanyId,
      approvers: s.approvers.map((a) => ({ ...a, label: this.label(a) })),
      stuck: req !== undefined && this.stuck(s, req, docType),
      decidedByName: s.decidedByName, decidedAt: s.decidedAt, note: s.note,
    }));
    return {
      status: this.outcome(docType, docId), requesterId: req?.requesterId ?? null, managerUserId: req?.managerUserId ?? null,
      companyId: req?.companyId ?? null, steps, trail: this.trail(docType, docId),
    };
  }

  /** Pending requests whose current step has waited past these hours and has not been told so yet. */
  overdue(kind: 'reminded' | 'escalated', now = Date.now()): Array<{ companyId: string; ownerCompanyId: string; docType: ApprovalDocType; docId: string; level: number }> {
    const rows = this.db.prepare("SELECT docType, docId, companyId, policyCompanyId, startedAt FROM approval_requests WHERE status = 'pending'").all() as Array<{ docType: ApprovalDocType; docId: string; companyId: string; policyCompanyId: string | null; startedAt: string }>;
    return rows.flatMap((r) => {
      const step = this.steps(r.docType, r.docId).find((s) => s.status === 'pending');
      if (!step) return [];
      const policy = this.policy(step.ownerCompanyId !== r.companyId ? step.ownerCompanyId : r.policyCompanyId ?? r.companyId, r.docType);
      const hours = kind === 'reminded' ? policy.reminderHours : policy.escalateHours;
      // Waiting since the last real move (a start or a decision), not since a reminder.
      const lastMove = this.db.prepare("SELECT MAX(at) at FROM approval_decisions WHERE docType = ? AND docId = ? AND kind NOT IN ('reminded', 'escalated')").get(r.docType, r.docId) as { at: string | null };
      const since = Date.parse(lastMove.at ?? r.startedAt);
      const told = this.db.prepare('SELECT 1 FROM approval_decisions WHERE docType = ? AND docId = ? AND level = ? AND kind = ? AND id > ?').get(r.docType, r.docId, step.level, kind, this.roundStart(r.docType, r.docId));
      return !told && now - since >= hours * 3_600_000 ? [{ companyId: r.companyId, ownerCompanyId: step.ownerCompanyId, docType: r.docType, docId: r.docId, level: step.level }] : [];
    });
  }

  /**
   * Hands the current step to one named person (an approvals administrator's
   * move, logged with its reason). They must reach the step's company, may not
   * be the requester (unless that policy allows your own) and may not have
   * approved this document already in this round.
   */
  reassign(docType: ApprovalDocType, docId: string, by: { id: string }, toUserId: string, reason: string): ApprovalStep {
    const text = reason?.trim();
    if (!text) throw new ApprovalError('Say why: a reason is required to hand a step to someone else.');
    return this.db.transaction(() => {
      const req = this.request(docType, docId);
      const steps = this.steps(docType, docId);
      if (!req || req.status === 'changes_requested' || outcomeOf(steps) !== 'pending') throw new ApprovalError('Nothing is waiting for approval on this document.');
      const step = steps.find((s) => s.status === 'pending')!;
      // Whoever hands a step on doesn't take it themselves: administrators reassign, they don't approve.
      if (toUserId === by.id || this.delegatorsOf(by.id).includes(toUserId)) throw new ApprovalError('You can\'t hand a step to yourself (or to someone whose approvals are handed to you); choose someone else.');
      if (!this.who.reaches(toUserId, step.ownerCompanyId)) throw new ApprovalError('That person can\'t open the company that decides this step.');
      const policy = this.policy(step.ownerCompanyId !== req.companyId ? step.ownerCompanyId : req.policyCompanyId ?? req.companyId, docType);
      if (!policy.allowSelf && toUserId === req.requesterId) throw new ApprovalError('The requester can\'t approve their own request.');
      if (this.approvedBy(docType, docId).has(toUserId)) throw new ApprovalError('That person already approved an earlier step of this document; choose someone else.');
      const approvers: Approver[] = [{ kind: 'user', id: toUserId }];
      this.db.prepare("UPDATE approval_steps SET approvers = ?, approverRole = ?, need = 'any' WHERE docType = ? AND docId = ? AND level = ?")
        .run(JSON.stringify(approvers), firstRole(approvers), docType, docId, step.level);
      this.db.prepare('INSERT INTO approval_decisions (docType, docId, level, slot, kind, userId, onBehalfOf, note, at) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?)')
        .run(docType, docId, step.level, 'reassigned', by.id, `Handed to ${this.who.nameOf(toUserId)}: ${text}`, new Date().toISOString());
      return this.steps(docType, docId).find((s) => s.level === step.level)!;
    })();
  }

  /** Every waiting request of this company, and those waiting at its sign-off (for whoever runs approvals). */
  openFor(companyId: string): Array<{ docType: ApprovalDocType; docId: string }> {
    return this.db.prepare(
      `SELECT r.docType, r.docId FROM approval_requests r WHERE r.status = 'pending' AND (r.companyId = ?
          OR EXISTS (SELECT 1 FROM approval_steps s WHERE s.docType = r.docType AND s.docId = r.docId AND s.status = 'pending' AND s.ownerCompanyId = ?))
        ORDER BY r.startedAt LIMIT 500`,
    ).all(companyId, companyId) as Array<{ docType: ApprovalDocType; docId: string }>;
  }

  /** Each document of this type with a request in this company: where it stands, for list chips. */
  statuses(companyId: string, docType: ApprovalDocType): Array<{ docId: string; status: ApprovalOutcome; level: number | null; levels: number; need: Need | null; approvers: Array<Approver & { label: string }>; stuck: boolean }> {
    const rows = this.db.prepare('SELECT docId FROM approval_requests WHERE companyId = ? AND docType = ?').all(companyId, docType) as Array<{ docId: string }>;
    return rows.map(({ docId }) => {
      const steps = this.steps(docType, docId);
      const status = this.outcome(docType, docId);
      const step = status === 'pending' ? steps.find((s) => s.status === 'pending') : undefined;
      const req = step ? this.request(docType, docId) : undefined;
      return {
        docId, status, level: step?.level ?? null, levels: steps.length, need: step?.need ?? null,
        approvers: step ? step.approvers.map((a) => ({ ...a, label: this.label(a) })) : [],
        stuck: Boolean(step && req && this.stuck(step, req, docType)),
      };
    }).filter((r) => r.status !== 'not_required');
  }

  note(docType: ApprovalDocType, docId: string, level: number, kind: 'reminded' | 'escalated'): void {
    this.db.prepare('INSERT INTO approval_decisions (docType, docId, level, slot, kind, userId, onBehalfOf, note, at) VALUES (?, ?, ?, NULL, ?, NULL, NULL, NULL, ?)')
      .run(docType, docId, level, kind, new Date().toISOString());
  }
}
