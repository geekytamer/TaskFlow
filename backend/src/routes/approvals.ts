import { APPROVAL_DOC_TYPES, APPROVER_ROLES, rolesActingAs, type ApprovalDocType, type ApproverRole } from '../approvals/approvals';
import { HttpError, getEffectiveRole } from '../http';
import { asRecord, enumValue, optionalString, requiredNumber } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Deciding a document stays in server.ts, where the purchase-order and expense routes use it too. */
export interface ApprovalDecisions {
  docSummary: (docType: ApprovalDocType, docId: string) => { companyId: string; number: string; amount: number; party: string | null; date: Date } | undefined;
  decideDocument: (req: AuthedRequest, docType: ApprovalDocType, docId: string, companyId: string, decision: 'approve' | 'reject', note?: string) => object;
}

/** Approval chains. */
export function registerApprovalRoutes(app: Express, ctx: RouteContext, { docSummary, decideDocument }: ApprovalDecisions): void {
  const { store, authMiddleware, requireCompanyRoles, allowsRule } = ctx;

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
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      // Who signs off what is the company's administration, not day-to-day finance.
      if (!allowsRule(req, req.params.companyId, 'ADMINISTRATION')) throw new HttpError(403, 'Only an administrator can change approval rules.');
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
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const roles = rolesActingAs(getEffectiveRole(req.user!, req.params.companyId) ?? undefined);
      const items = store.approvals.waiting(req.params.companyId, roles).map((w) => {
        const steps = store.approvals.steps(w.docType, w.docId);
        return {
          ...w, ...docSummary(w.docType, w.docId), levels: steps.length,
          // Someone who approved an earlier level cannot approve this one.
          canDecide: !steps.some((s) => s.status === 'approved' && s.decidedByUserId === req.user!.id),
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
      requireCompanyRoles(req, doc.companyId, companyManagementRoles);
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
      requireCompanyRoles(req, doc.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const decision = enumValue(body.decision, 'decision', ['approve', 'reject'] as const) as 'approve' | 'reject';
      res.json(decideDocument(req, docType, req.params.docId, doc.companyId, decision, optionalString(body.note)));
    }),
  );
}
