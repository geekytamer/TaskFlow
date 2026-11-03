import { APPROVAL_DOC_TYPES, APPROVER_ROLES, type ApprovalDocType, type ApproverRole } from '../approvals/approvals';
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
      requireCompanyAccess(req, doc.companyId);
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
      if (key && roleStep) {
        // Purchase orders and expenses keep their step permission (v2) and its limit.
        requireCompanyRoles(req, doc.companyId, companyManagementRoles, key);
        requirePermission(req, doc.companyId, key, undefined, { amount: doc.amount });
      } else {
        // Elsewhere the policy is the permission: being on the current step decides (checked by the engine).
        requireCompanyAccess(req, doc.companyId);
      }
      const body = asRecord(req.body, 'body');
      const decision = enumValue(body.decision, 'decision', ['approve', 'reject', 'send_back'] as const) as 'approve' | 'reject' | 'send_back';
      res.json(decideDocument(req, docType, req.params.docId, doc.companyId, decision, optionalString(body.note)));
    }),
  );
}
