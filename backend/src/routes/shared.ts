import type { NextFunction, Request, Response } from 'express';
import type { PermissionMap } from '../permissions/permission-service';
import type { SanitizedUser, UserRole } from '../types';

/** What route modules share with server.ts that does not depend on a running server. */

export type AuthedRequest = Request & {
  user?: SanitizedUser;
  /** Prefetched by authMiddleware when AUTHZ_ENGINE is not 'legacy'. */
  permissions?: PermissionMap;
};

/** Wraps a route so a thrown or rejected error reaches the error middleware. */
export const handler =
  (
    fn: (req: AuthedRequest, res: Response, next: NextFunction) => unknown | Promise<unknown>,
  ) =>
  (req: AuthedRequest, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export const companyManagementRoles: UserRole[] = ['Admin', 'Manager', 'Accountant'];
