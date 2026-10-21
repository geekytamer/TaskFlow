import type { Express, Response } from 'express';
import type { RecordRuleName } from './record-rules';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';

export interface PermissionRoutesDeps {
  app: Express;
  store: DataStore;
  authMiddleware: unknown;
  handler: (fn: (req: any, res: Response) => unknown) => any;
  requireCompanyRoles: (req: any, companyId: string, roles: any[]) => void;
  /** Which engine decides access (PERMISSIONS_ENGINE); the permission feed passes it on to the UI. */
  permissionsEngine: 'legacy' | 'shadow' | 'v2';
  /** Company access plus a record rule (permissions/record-rules.ts). */
  requireCompanyRule: (req: any, companyId: string, rule: RecordRuleName) => void;
  managementRoles: any[];
  logger: Pick<Console, 'info' | 'warn' | 'error'>;
}

export function registerPermissionRoutes(deps: PermissionRoutesDeps): void {
  const { app, store, authMiddleware, handler, permissionsEngine } = deps;
  // ── Catalogue ──────────────────────────────────────────────────────
  // GET /permissions/catalogue moved to authz/routes.ts (Task 9), which still
  // sends `modules` and `alwaysOnModules` for today's screens.

  // ── The current user's own permissions ─────────────────────────────
  app.get('/auth/permissions', authMiddleware as never, handler((req, res) => {
    const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    if (!companyId) throw new HttpError(400, 'companyId is required.');
    const disabledModules = store.getDisabledModules(companyId);
    res.json({
      version: store.getAuthzVersion(),
      companyId,
      // The UI follows `permissions` only under an engine that no
      // longer exists, so it keeps its role fallback under every engine. Under
      // v2 that is safe: the system templates answer exactly as the roles did,
      // and only reviewed add-ons can differ (the server allows; the UI may
      // hide an entry point). Task 9 adds /me/permissions and Task 10 moves the
      // UI onto it.
      engine: permissionsEngine,
      // Switched off for this company: off for everyone, whatever groups grant.
      // Listed separately too, because the UI hides these modules under every
      // engine, while it ignores `permissions`.
      disabledModules,
      permissions: store
        .getEffectivePermissions(req.user!.id, companyId)
        .filter((permission) => !disabledModules.includes(permission.slice(0, permission.indexOf(':'))))
        .sort(),
    });
  }));

  // The old permission-group API (groups, grants, inheritance, assignments)
  // is gone: roles and people are managed through authz/routes.ts, which
  // holds every change to no higher than me, audits it and refuses lockouts.

  // ── Shadow-mode divergences ────────────────────────────────────────
  app.get('/admin/authz/divergences', authMiddleware as never, handler((req, res) => {
    if (!req.user?.isSuperAdmin) throw new HttpError(403, 'Super-admin access required.');
    res.json(store.listAuthzDivergences(500));
  }));
}

