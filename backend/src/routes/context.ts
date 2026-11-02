import type { NextFunction, Response } from 'express';
import type { DataStore } from '../data/store';
import type { PermissionsEngine } from '../authz/engine';
import type { Effective } from '../authz/evaluate';
import type { VisibleArea, VisibleOptions } from '../authz/visible';
import type { MaskEntity, SensitiveField } from '../authz/mask';
import type { RecordRuleName } from '../permissions/record-rules';
import type { InvoiceLineItem, Project, SalesOrderLineItem, SanitizedUser, UserRole } from '../types';
import type { AuthedRequest } from './shared';

/**
 * What createServer hands to route modules: the store and the request guards
 * that close over it. A module takes only what it uses.
 */
/**
 * Options of a field check. `self`: the record is the person's own.
 * `moduleLock`: a path the old field rules were asked on — a field whose
 * module is off stays hidden there (authz/mask.ts).
 */
export interface FieldOpts { self?: boolean; moduleLock?: boolean }

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
  /** A row without the sensitive properties the person may not see (authz/mask.ts); `self` = the person's own record. */
  maskFor: <T>(req: AuthedRequest, companyId: string, entity: MaskEntity, row: T, opts?: FieldOpts) => T;
  /** An activity event without metadata the person may not see. */
  maskEvent: <T extends { companyId: string; entityType: string; metadata?: Record<string, unknown> | null }>(req: AuthedRequest, event: T) => T;
  /** May the person see a sensitive field (CSV columns, files)? */
  seesField: (req: AuthedRequest, companyId: string, field: SensitiveField, opts?: FieldOpts) => boolean;
  /** 403 { permission: 'field:<key>' } unless the person may edit the field (v2; shadow records). */
  requireFieldEdit: (req: AuthedRequest, companyId: string, field: SensitiveField) => void;
  /** requireFieldEdit for each sensitive field a body changes (`existing`: the record, or 'create'). */
  requireFieldEdits: (req: AuthedRequest, companyId: string, entity: MaskEntity, body: Record<string, unknown> | null | undefined, existing?: object | 'create' | null) => void;
  /** One record of a scoped area, by the same rule as its list. */
  canSee: (req: AuthedRequest, area: VisibleArea, companyId: string, id: string, options?: VisibleOptions) => boolean;
  canViewProject: (req: AuthedRequest, project: Pick<Project, 'id' | 'companyId'>) => boolean;
  canViewTask: (req: AuthedRequest, task: { id: string; companyId: string }) => boolean;
  ensureClientBelongsToCompany: (clientId: string | undefined, companyId: string) => void;
  parseInvoiceLineItems: (value: unknown) => InvoiceLineItem[];
  parseSalesOrderItems: (value: unknown) => SalesOrderLineItem[];
  ensureSalesItemsBelongToCompany: (items: SalesOrderLineItem[], companyId: string) => void;
  requireSuperAdmin: (req: AuthedRequest) => void;
  /** Companies the person reaches: membership; under v2 also active group assignments (Ruling M). */
  accessibleCompanyIds: (user: SanitizedUser) => string[];
  uploadedImage: (value: unknown, fieldName: string) => string;
  logger: Pick<Console, 'info' | 'warn' | 'error'>;
}
