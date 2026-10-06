import type { NextFunction, Response } from 'express';
import type { ApprovalDocType } from '../approvals/approvals';
import type { DataStore } from '../data/store';
import type { AuthzEngine } from '../permissions/fga-client';
import type { RecordRuleName } from '../permissions/record-rules';
import type { InvoiceLineItem, Project, UserRole } from '../types';
import type { AuthedRequest } from './shared';

/**
 * What createServer hands to route modules: the store and the request guards
 * that close over it. A module takes only what it uses.
 */
export interface RouteContext {
  store: DataStore;
  authzEngine: AuthzEngine;
  authMiddleware: (req: AuthedRequest, res: Response, next: NextFunction) => void | Promise<void>;
  requireCompanyAccess: (req: AuthedRequest, companyId: string) => void;
  requireCompanyRoles: (req: AuthedRequest, companyId: string, roles: UserRole[]) => void;
  allowsRule: (req: AuthedRequest, companyId: string, name: RecordRuleName) => boolean;
  withActor: <T>(req: AuthedRequest, fn: () => T) => T;
  canViewProject: (req: AuthedRequest, project: Project) => boolean;
  canViewTask: (req: AuthedRequest, task: { companyId: string; projectId?: string | null; assignedUserIds?: string[]; ownerId?: string | null; isPrivate?: boolean }) => boolean;
  ensureClientBelongsToCompany: (clientId: string | undefined, companyId: string) => void;
  parseInvoiceLineItems: (value: unknown) => InvoiceLineItem[];
  docSummary: (docType: ApprovalDocType, docId: string) => { companyId: string; number: string; amount: number; party: string | null; date: Date } | undefined;
  decideDocument: (req: AuthedRequest, docType: ApprovalDocType, docId: string, companyId: string, decision: 'approve' | 'reject', note?: string) => object;
}
