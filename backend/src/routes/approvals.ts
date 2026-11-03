import { APPROVAL_DOC_TYPES, APPROVER_ROLES, ApprovalError, type ApprovalDocType, type Approver, type ApproverRole } from '../approvals/approvals';
import { subtreeIds } from '../companies/tree';
import { HttpError } from '../http';
import { asRecord, enumValue, optionalString, requiredNumber } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Deciding a document stays in server.ts, where the purchase-order and expense routes use it too. */
export interface ApprovalDecisions {
  docSummary: (docType: ApprovalDocType, docId: string) => { companyId: string; number: string; amount: number; party: string | null; date: Date } | undefined;
  decideDocument: (req: AuthedRequest, docType: ApprovalDocType, docId: string, companyId: string, decision: 'approve' | 'reject' | 'send_back', note?: string) => object;
}

/** Document types wired in wave 1 (spec 2026-11-03-approvals-design, "As built"). */
const WIRED_DOC_TYPES: ApprovalDocType[] = ['purchase_order', 'expense', 'vendor_bill', 'invoice', 'quotation', 'payroll_run', 'document'];

/** The permission that lets someone decide a step, per kind of document (route-registry HANDLER_CHECKED). */
const DECISION_KEYS: Partial<Record<ApprovalDocType, string>> = {
  purchase_order: 'purchasing.approve_step',
  expense: 'finance.approve_expenses',
};

/** Approval chains. */
export function registerApprovalRoutes(app: Express, ctx: RouteContext, { docSummary, decideDocument }: ApprovalDecisions): void {
  const { store, authMiddleware, requireCompanyRoles, requireCompanyAccess, allowsRule, requirePermission, forbidden } = ctx;

  app.get(
    '/companies/:companyId/approvals/rules',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.approvals.rules(req.params.companyId));
    }),
  );

  app.put(
    '/companies/:companyId/approvals/rules',
    authMiddleware,
    handler((req, res) => {
      // The management gate is the rules' read permission; ADMINISTRATION (settings.manage_approvals) decides the change.
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles, 'settings.view_approvals');
      // Who signs off what is the company's administration, not day-to-day finance.
      if (!allowsRule(req, req.params.companyId, 'ADMINISTRATION')) {
        if (ctx.permissionsEngine === 'v2') throw forbidden(req.params.companyId, 'settings.manage_approvals');
        throw new HttpError(403, 'Only an administrator can change approval rules.', { code: 'FORBIDDEN', permission: 'settings.manage_approvals' });
      }
      const body = asRecord(req.body, 'body');
      const docType = enumValue(body.docType, 'docType', APPROVAL_DOC_TYPES) as ApprovalDocType;
      if (!Array.isArray(body.rules) || body.rules.length > 10) throw new HttpError(400, 'rules must be a list of up to 10 levels.');
      const rules = (body.rules as unknown[]).map((raw, i) => {
        const r = asRecord(raw, `rules[${i}]`);
        const minAmount = requiredNumber(r.minAmount, `rules[${i}].minAmount`);
        if (!(minAmount > 0)) throw new HttpError(400, 'Each level starts above zero.');
        return { minAmount, approverRole: enumValue(r.approverRole, `rules[${i}].approverRole`, APPROVER_ROLES) as ApproverRole };
      });
      if (new Set(rules.map((r) => r.minAmount)).size !== rules.length) throw new HttpError(400, 'Two levels start at the same amount.');
      store.approvals.setRules(req.params.companyId, docType, rules);
      res.json(store.approvals.rules(req.params.companyId));
    }),
  );

  /** Who signs off what is the company's administration (settings.manage_approvals). */
  const requireManageApprovals = (req: AuthedRequest, companyId: string) => {
    requireCompanyRoles(req, companyId, companyManagementRoles, 'settings.view_approvals');
    if (!allowsRule(req, companyId, 'ADMINISTRATION')) {
      if (ctx.permissionsEngine === 'v2') throw forbidden(companyId, 'settings.manage_approvals');
      throw new HttpError(403, 'Only an administrator can change approvals.', { code: 'FORBIDDEN', permission: 'settings.manage_approvals' });
    }
  };
  const runApprovals = <T>(fn: () => T): T => {
    try { return fn(); } catch (e) { if (e instanceof ApprovalError) throw new HttpError(409, e.message); throw e; }
  };
  /**
   * The document's company, or, while its current step is a group's sign-off,
   * that group: a group's people decide its sign-off without a place below.
   */
  const requireDocOrStepAccess = (req: AuthedRequest, docType: ApprovalDocType, docId: string, companyId: string) => {
    const owners = new Set(store.approvals.steps(docType, docId).map((x) => x.ownerCompanyId).filter((id) => id !== companyId));
    if (!owners.size) return requireCompanyAccess(req, companyId);
    try {
      requireCompanyAccess(req, companyId);
    } catch (error) {
      // Only "not a member here" falls through to the group; any other refusal stands.
      const code = (error as { details?: { code?: string } }).details?.code;
      if (!(error instanceof HttpError) || error.status !== 403 || code !== 'NO_COMPANY_ACCESS') throw error;
      // Through the group: only someone on this request (deciding now, or who decided a step).
      if (!store.approvals.involves(docType, docId, req.user!.id)) throw error;
      const owner = [...owners].find((id) => { try { requireCompanyAccess(req, id); return true; } catch { return false; } });
      if (!owner) throw error;
    }
  };

  /** This company and the group companies above it: whose teams a policy may name. */
  const lineage = (companyId: string): string[] => {
    const nodes = store.companyTreeNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const out: string[] = [];
    for (let id: string | null = companyId; id && out.length < 32; id = byId.get(id)?.parentCompanyId ?? null) out.push(id);
    return out;
  };
  const parseApprovers = (companyId: string, raw: unknown, where: string, groupSignOff = false): Approver[] => {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) throw new HttpError(400, `${where}: name 1 to 10 approvers.`);
    const teamsHere = new Set(lineage(companyId));
    const tree = new Set(subtreeIds(store.companyTreeNodes(), companyId));
    return raw.map((item, i) => {
      const a = asRecord(item, `${where}[${i}]`);
      const kind = enumValue(a.kind, `${where}[${i}].kind`, ['role', 'team', 'user', 'manager'] as const);
      if (kind === 'manager') return { kind } as Approver;
      const id = typeof a.id === 'string' ? a.id : '';
      if (kind === 'role') return { kind, id: enumValue(id, `${where}[${i}].id`, APPROVER_ROLES) as ApproverRole };
      if (kind === 'team') {
        const team = store.approvals.team(id);
        if (!team || !teamsHere.has(team.companyId)) throw new HttpError(400, 'That team is not one of this company\'s (or its group\'s).');
        return { kind, id };
      }
      const user = store.getUserById(id);
      // A group's sign-off is decided by the group's own people.
      const where_ = groupSignOff ? [companyId] : [...tree];
      const reaches = user && where_.some((c) => (user.companyIds ?? []).includes(c) || user.companyRoles?.some((r) => r.companyId === c));
      if (!reaches) {
        throw new HttpError(400, groupSignOff
          ? 'A group sign-off is decided by people who work in the group company itself.'
          : 'That person does not work in this company or its group.');
      }
      return { kind, id };
    });
  };

  app.get('/companies/:companyId/approvals/teams', authMiddleware, handler((req, res) => {
    requireCompanyAccess(req, req.params.companyId);
    // A policy may name this company's teams and its group's.
    res.json(lineage(req.params.companyId).flatMap((id) => store.approvals.teams(id)));
  }));

  app.put('/companies/:companyId/approvals/teams', authMiddleware, handler((req, res) => {
    requireManageApprovals(req, req.params.companyId);
    const body = asRecord(req.body, 'body');
    if (!Array.isArray(body.members) || body.members.length > 100) throw new HttpError(400, 'members must be a list of up to 100.');
    const members = (body.members as unknown[]).map((raw, i) => {
      const m = asRecord(raw, `members[${i}]`);
      const kind = enumValue(m.kind, `members[${i}].kind`, ['role', 'user'] as const);
      const value = kind === 'role'
        ? enumValue(m.value, `members[${i}].value`, ['Admin', 'Manager', 'Accountant', 'Employee'] as const)
        : String(m.value ?? '');
      if (kind === 'user') {
        // A team is people of this company's group, never someone from elsewhere.
        const user = store.getUserById(value);
        const tree = new Set(subtreeIds(store.companyTreeNodes(), lineage(req.params.companyId).at(-1)!));
        const inGroup = user && [...tree].some((c) => (user.companyIds ?? []).includes(c) || user.companyRoles?.some((r) => r.companyId === c));
        if (!inGroup) throw new HttpError(400, `members[${i}]: that person does not work in this company or its group.`);
      }
      return { kind, value };
    });
    res.json(runApprovals(() => store.approvals.saveTeam(req.params.companyId, {
      id: typeof body.id === 'string' ? body.id : undefined, name: String(body.name ?? ''), members,
    })));
  }));

  app.delete('/companies/:companyId/approvals/teams/:teamId', authMiddleware, handler((req, res) => {
    requireManageApprovals(req, req.params.companyId);
    runApprovals(() => store.approvals.deleteTeam(req.params.companyId, req.params.teamId));
    res.status(204).end();
  }));

  /** Every document type's policy as it applies here: own, or the group's (inheritedFrom). */
  app.get('/companies/:companyId/approvals/policies', authMiddleware, handler((req, res) => {
    requireCompanyAccess(req, req.params.companyId);
    const out: Record<string, unknown> = {};
    for (const docType of APPROVAL_DOC_TYPES) {
      const from = store.approvalPolicyCompany(req.params.companyId, docType);
      const rules = store.approvals.rules(from, docType);
      out[docType] = {
        ...store.approvals.policy(from, docType),
        inheritedFrom: from !== req.params.companyId && rules.length ? { id: from, name: store.getCompanyById(from)?.name ?? from } : null,
        steps: rules
          // A fallback to the group's policy shows its ordinary steps; its sign-off is listed below.
          .filter((r) => from === req.params.companyId || !r.alsoBelow)
          .map((r) => ({ approvers: r.approvers.map((a) => ({ ...a, label: store.approvals.label(a) })), need: r.need, minAmount: r.minAmount || null, maxAmount: r.maxAmount, alsoBelow: r.alsoBelow })),
        // Whether this company has companies below (its steps may be their group sign-off).
        hasCompaniesBelow: subtreeIds(store.companyTreeNodes(), req.params.companyId).length > 1,
        // What each group above adds after this company's own steps.
        groupSignOff: lineage(req.params.companyId).slice(1).flatMap((groupId) => {
          const signOff = store.approvals.rules(groupId, docType).filter((r) => r.alsoBelow);
          return signOff.length ? [{
            companyId: groupId, name: store.getCompanyById(groupId)?.name ?? groupId,
            steps: signOff.map((r) => ({ approvers: r.approvers.map((a) => ({ ...a, label: store.approvals.label(a) })), need: r.need, minAmount: r.minAmount || null, maxAmount: r.maxAmount })),
          }] : [];
        }),
      };
    }
    res.json(out);
  }));

  app.put('/companies/:companyId/approvals/policies/:docType', authMiddleware, handler((req, res) => {
    requireManageApprovals(req, req.params.companyId);
    // Only document types whose next step actually waits for approval take a policy.
    const docType = enumValue(req.params.docType, 'docType', WIRED_DOC_TYPES) as ApprovalDocType;
    const body = asRecord(req.body, 'body');
    if (!Array.isArray(body.steps) || body.steps.length > 10) throw new HttpError(400, 'steps must be a list of up to 10.');
    const steps = (body.steps as unknown[]).map((raw, i) => {
      const st = asRecord(raw, `steps[${i}]`);
      const num = (v: unknown, f: string) => (v === null || v === undefined || v === '' ? null : requiredNumber(v, f));
      const minAmount = num(st.minAmount, `steps[${i}].minAmount`);
      const maxAmount = num(st.maxAmount, `steps[${i}].maxAmount`);
      if (minAmount !== null && maxAmount !== null && maxAmount < minAmount) throw new HttpError(400, `Step ${i + 1}: the "up to" amount is below the "from" amount.`);
      return {
        approvers: parseApprovers(req.params.companyId, st.approvers, `steps[${i}].approvers`, st.alsoBelow === true),
        need: enumValue(st.need ?? 'any', `steps[${i}].need`, ['any', 'all'] as const),
        minAmount, maxAmount, alsoBelow: st.alsoBelow === true,
      };
    });
    const hours = (v: unknown, fallback: number) => {
      const n = v === undefined || v === null ? fallback : Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 24 * 30) throw new HttpError(400, 'Hours are a whole number from 1 to 720.');
      return n;
    };
    store.approvals.setPolicy(req.params.companyId, docType, {
      steps, allowSelf: body.allowSelf === true,
      reminderHours: hours(body.reminderHours, 24), escalateHours: hours(body.escalateHours, 72),
    });
    res.json({ ok: true });
  }));

  app.get('/me/approval-delegation', authMiddleware, handler((req, res) => {
    res.json(store.approvals.delegation(req.user!.id));
  }));

  app.put('/me/approval-delegation', authMiddleware, handler((req, res) => {
    const body = asRecord(req.body, 'body');
    if (body.toUserId === null || body.toUserId === undefined) {
      store.approvals.setDelegation(req.user!.id, null);
      return res.json(null);
    }
    const toUserId = String(body.toUserId);
    if (!store.getUserById(toUserId)) throw new HttpError(400, 'No such person.');
    const date = (v: unknown, f: string) => {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `${f} is a date (YYYY-MM-DD).`);
      return v;
    };
    try {
      store.approvals.setDelegation(req.user!.id, { toUserId, startsAt: date(body.startsAt, 'startsAt'), endsAt: date(body.endsAt, 'endsAt') });
    } catch (e) {
      if (e instanceof ApprovalError) throw new HttpError(400, e.message);
      throw e;
    }
    res.json(store.approvals.delegation(req.user!.id));
  }));

  app.get(
    '/companies/:companyId/approvals',
    authMiddleware,
    handler((req, res) => {
      // Anyone can be on a step (a Legal team member may be an Employee): the
      // inbox lists only what this person, or someone they stand in for, decides.
      requireCompanyAccess(req, req.params.companyId);
      const box = req.query.box === 'mine' || req.query.box === 'decided' ? req.query.box : 'waiting';
      const me = req.user!.id;
      const list = box === 'waiting'
        ? store.approvalsWaitingFor(req.params.companyId, me)
        : box === 'mine' ? store.approvals.requestedBy(req.params.companyId, me) : store.approvals.decidedBy(req.params.companyId, me);
      const items = list.map((w) => {
        const view = store.approvalView(w.docType, w.docId);
        return {
          ...w, ...docSummary(w.docType, w.docId), levels: view.steps.length,
          status: view.status, steps: view.steps, requesterId: view.requesterId,
          canDecide: box === 'waiting',
        };
      }).filter((w) => w.number !== undefined);
      res.json(items);
    }),
  );

  app.get(
    '/approvals/:docType/:docId',
    authMiddleware,
    handler((req, res) => {
      const docType = enumValue(req.params.docType, 'docType', APPROVAL_DOC_TYPES) as ApprovalDocType;
      const doc = docSummary(docType, req.params.docId);
      if (!doc) throw new HttpError(404, 'Document not found.');
      requireDocOrStepAccess(req, docType, req.params.docId, doc.companyId);
      res.json(store.approvals.steps(docType, req.params.docId));
    }),
  );

  app.post(
    '/approvals/:docType/:docId/decision',
    authMiddleware,
    handler((req, res) => {
      const docType = enumValue(req.params.docType, 'docType', APPROVAL_DOC_TYPES) as ApprovalDocType;
      const doc = docSummary(docType, req.params.docId);
      if (!doc) throw new HttpError(404, 'Document not found.');
      const key = DECISION_KEYS[docType];
      // A step of roles (the classic chain) keeps the step permission; a step
      // naming a team, a person or the manager is decided by being on it.
      const current = store.approvals.steps(docType, req.params.docId).find((x) => x.status === 'pending');
      const roleStep = !current || current.approvers.every((a) => a.kind === 'role');
      // A delegate decides for the person they stand in for: that person's role counts (the engine checks it).
      const standingIn = Boolean(store.approvals.actingFor(docType, req.params.docId, req.user!.id));
      // A group's sign-off is decided by the group's people with their roles in the group, not the company's gate.
      const groupStep = Boolean(current && current.ownerCompanyId !== doc.companyId);
      if (key && roleStep && !standingIn && !groupStep) {
        // Purchase orders and expenses keep their step permission (v2) and its limit.
        requireCompanyRoles(req, doc.companyId, companyManagementRoles, key);
        requirePermission(req, doc.companyId, key, undefined, { amount: doc.amount });
      } else {
        // Elsewhere the policy is the permission: being on the current step decides (checked by the engine).
        requireDocOrStepAccess(req, docType, req.params.docId, doc.companyId);
      }
      const body = asRecord(req.body, 'body');
      const decision = enumValue(body.decision, 'decision', ['approve', 'reject', 'send_back'] as const) as 'approve' | 'reject' | 'send_back';
      res.json(decideDocument(req, docType, req.params.docId, doc.companyId, decision, optionalString(body.note)));
    }),
  );
}
