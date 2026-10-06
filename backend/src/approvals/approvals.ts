import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * Approval chains. A company sets, per document type, the amounts from which
 * a role must approve: purchase orders from 1,000 by a Manager, from 10,000 by
 * an Admin as well. A document needs every level its amount reaches, approved
 * in order from the lowest. One person cannot approve two levels of the same
 * document. Any level rejecting rejects the document. A company with no rules
 * for a type keeps its old behaviour (for purchase orders, the single
 * threshold in finance settings).
 */

export type ApprovalDocType = 'purchase_order' | 'expense';
export const APPROVAL_DOC_TYPES: ApprovalDocType[] = ['purchase_order', 'expense'];
/** Who may approve a level. Admin may approve any level; Manager any Manager level. */
export type ApproverRole = 'Manager' | 'Admin' | 'Accountant';
export const APPROVER_ROLES: ApproverRole[] = ['Manager', 'Accountant', 'Admin'];

export interface ApprovalRule { id: string; companyId: string; docType: ApprovalDocType; minAmount: number; approverRole: ApproverRole }
export type StepStatus = 'pending' | 'approved' | 'rejected';
export interface ApprovalStep {
  docType: ApprovalDocType; docId: string; level: number; minAmount: number; approverRole: ApproverRole;
  status: StepStatus; decidedByUserId: string | null; decidedByName: string | null; decidedAt: string | null; note: string | null;
}
export type ApprovalOutcome = 'not_required' | 'pending' | 'approved' | 'rejected';

export class ApprovalStore {
  constructor(private readonly db: Database.Database) {}

  rules(companyId: string, docType?: ApprovalDocType): ApprovalRule[] {
    const rows = docType
      ? this.db.prepare('SELECT * FROM approval_rules WHERE companyId = ? AND docType = ? ORDER BY minAmount').all(companyId, docType)
      : this.db.prepare('SELECT * FROM approval_rules WHERE companyId = ? ORDER BY docType, minAmount').all(companyId);
    return rows as ApprovalRule[];
  }

  /** Replaces a document type's rules. */
  setRules(companyId: string, docType: ApprovalDocType, rules: Array<{ minAmount: number; approverRole: ApproverRole }>): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM approval_rules WHERE companyId = ? AND docType = ?').run(companyId, docType);
      const insert = this.db.prepare('INSERT INTO approval_rules (id, companyId, docType, minAmount, approverRole) VALUES (?, ?, ?, ?, ?)');
      rules.forEach((r) => insert.run(uuid(), companyId, docType, r.minAmount, r.approverRole));
    })();
  }

  steps(docType: ApprovalDocType, docId: string): ApprovalStep[] {
    return this.db.prepare('SELECT * FROM approval_steps WHERE docType = ? AND docId = ? ORDER BY level').all(docType, docId) as ApprovalStep[];
  }

  /** Starts (or restarts) a document's chain from these levels. */
  start(companyId: string, docType: ApprovalDocType, docId: string, levels: Array<{ minAmount: number; approverRole: ApproverRole }>): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM approval_steps WHERE docType = ? AND docId = ?').run(docType, docId);
      const insert = this.db.prepare(
        "INSERT INTO approval_steps (companyId, docType, docId, level, minAmount, approverRole, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
      );
      levels.forEach((l, i) => insert.run(companyId, docType, docId, i + 1, l.minAmount, l.approverRole));
    })();
  }

  clear(docType: ApprovalDocType, docId: string): void {
    this.db.prepare('DELETE FROM approval_steps WHERE docType = ? AND docId = ?').run(docType, docId);
  }

  decideStep(docType: ApprovalDocType, docId: string, level: number, status: 'approved' | 'rejected', by: { id: string; name: string }, note: string | null): void {
    this.db.prepare(
      'UPDATE approval_steps SET status = ?, decidedByUserId = ?, decidedByName = ?, decidedAt = ?, note = ? WHERE docType = ? AND docId = ? AND level = ?',
    ).run(status, by.id, by.name, new Date().toISOString(), note, docType, docId, level);
  }

  /** Documents with a level waiting for one of these roles, for an approver's inbox. */
  waiting(companyId: string, roles: ApproverRole[]): Array<{ docType: ApprovalDocType; docId: string; level: number; approverRole: ApproverRole }> {
    if (roles.length === 0) return [];
    const rows = this.db.prepare(
      `SELECT s.docType, s.docId, s.level, s.approverRole FROM approval_steps s
        WHERE s.companyId = ? AND s.status = 'pending'
          AND s.level = (SELECT MIN(level) FROM approval_steps x WHERE x.docType = s.docType AND x.docId = s.docId AND x.status = 'pending')
          AND NOT EXISTS (SELECT 1 FROM approval_steps r WHERE r.docType = s.docType AND r.docId = s.docId AND r.status = 'rejected')`,
    ).all(companyId) as Array<{ docType: ApprovalDocType; docId: string; level: number; approverRole: ApproverRole }>;
    return rows.filter((r) => roles.includes(r.approverRole));
  }
}

/** The levels a document of this amount needs, lowest first. */
export function levelsFor(rules: ApprovalRule[], amount: number): Array<{ minAmount: number; approverRole: ApproverRole }> {
  return rules.filter((r) => amount >= r.minAmount).sort((a, b) => a.minAmount - b.minAmount)
    .map((r) => ({ minAmount: r.minAmount, approverRole: r.approverRole }));
}

/** Which approver roles a company role can act as. */
export function rolesActingAs(companyRole: string | undefined): ApproverRole[] {
  if (companyRole === 'Admin') return ['Admin', 'Manager', 'Accountant'];
  if (companyRole === 'Manager') return ['Manager'];
  if (companyRole === 'Accountant') return ['Accountant'];
  return [];
}

export function outcomeOf(steps: ApprovalStep[]): ApprovalOutcome {
  if (steps.length === 0) return 'not_required';
  if (steps.some((s) => s.status === 'rejected')) return 'rejected';
  return steps.every((s) => s.status === 'approved') ? 'approved' : 'pending';
}

export class ApprovalError extends Error {}

/**
 * Records one person's decision on the lowest level still waiting. They must
 * hold that level's role (an Admin may act for any), and must not have
 * approved an earlier level of the same document.
 */
export function decide(store: ApprovalStore, docType: ApprovalDocType, docId: string, user: { id: string; name: string; companyRole?: string }, decision: 'approve' | 'reject', note?: string): ApprovalOutcome {
  const steps = store.steps(docType, docId);
  if (outcomeOf(steps) !== 'pending') throw new ApprovalError('Nothing is waiting for approval on this document.');
  const current = steps.find((s) => s.status === 'pending')!;
  if (!rolesActingAs(user.companyRole).includes(current.approverRole)) {
    throw new ApprovalError(`Level ${current.level} needs ${current.approverRole === 'Admin' ? 'an Admin' : `a ${current.approverRole}`}.`);
  }
  if (decision === 'approve' && steps.some((s) => s.status === 'approved' && s.decidedByUserId === user.id)) {
    throw new ApprovalError('You approved an earlier level of this document; someone else must approve this one.');
  }
  store.decideStep(docType, docId, current.level, decision === 'approve' ? 'approved' : 'rejected', user, note?.trim() || null);
  return outcomeOf(store.steps(docType, docId));
}
