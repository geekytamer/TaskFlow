import type { NextFunction, Response } from 'express';
import type { DataStore } from '../data/store';
import type { PermissionsEngine } from '../authz/engine';
import type { Effective } from '../authz/evaluate';
import type { VisibleArea, VisibleOptions } from '../authz/visible';
import type { RecordRuleName } from '../permissions/record-rules';
import type { InvoiceLineItem, Project, SalesOrderLineItem, UserRole } from '../types';
import type { TupleKey } from '../permissions/tuples';
import type { AuthedRequest } from './shared';

/**
 * What createServer hands to route modules: the store and the request guards
 * that close over it. A module takes only what it uses.
 */
export interface RouteContext {
  store: DataStore;
  permissionsEngine: PermissionsEngine;
  authMiddleware: (req: AuthedRequest, res: Response, next: NextFunction) => void | Promise<void>;
  requireCompanyAccess: (req: AuthedRequest, companyId: string) => void;
  /** The route gate; `key` names the permission where the handler decides between several. */
  requireCompanyRoles: (req: AuthedRequest, companyId: string, roles: UserRole[], key?: string) => void;
  allowsRule: (req: AuthedRequest, companyId: string, name: RecordRuleName, ctx?: { amount?: number }) => boolean;
  /** Holds a catalogue key (v2), or one of `legacyRoles` (legacy; none = true). */
  allowsKey: (req: AuthedRequest, companyId: string, key: string, legacyRoles?: readonly UserRole[], ctx?: { ownerUserId?: string | null; amount?: number }) => boolean;
  /** allowsKey or 403 { code: 'FORBIDDEN', permission, message }. */
  requirePermission: (req: AuthedRequest, companyId: string, key: string, legacyRoles?: readonly UserRole[], ctx?: { ownerUserId?: string | null; amount?: number }) => void;
  /** The 403 for a refused permission: { code: 'FORBIDDEN', permission, message }. */
  forbidden: (companyId: string, key: string | undefined) => Error;
  withActor: <T>(req: AuthedRequest, fn: () => T) => T;
  /** The Effective that decides what the person sees (authz/visible.ts; Ruling D picks it per engine). */
  viewerOf: (req: AuthedRequest) => Effective;
  /** One record of a scoped area, by the same rule as its list. */
  canSee: (req: AuthedRequest, area: VisibleArea, companyId: string, id: string, options?: VisibleOptions) => boolean;
  canViewProject: (req: AuthedRequest, project: Pick<Project, 'id' | 'companyId'>) => boolean;
  canViewTask: (req: AuthedRequest, task: { id: string; companyId: string }) => boolean;
  ensureClientBelongsToCompany: (clientId: string | undefined, companyId: string) => void;
  parseInvoiceLineItems: (value: unknown) => InvoiceLineItem[];
  parseSalesOrderItems: (value: unknown) => SalesOrderLineItem[];
  ensureSalesItemsBelongToCompany: (items: SalesOrderLineItem[], companyId: string) => void;
  requireSuperAdmin: (req: AuthedRequest) => void;
  uploadedImage: (value: unknown, fieldName: string) => string;
  /** No-ops kept for callers until Task 12 (OpenFGA no longer decides). */
  snapshotAuthz: (companyIds: Iterable<string>) => Map<string, TupleKey[]>;
  publishAuthzChange: (before: Map<string, TupleKey[]>) => Promise<void>;
  logger: Pick<Console, 'info' | 'warn' | 'error'>;
}
