import type { DataStore } from '../data/store';
import type { PermissionService } from './permission-service';
import { lookupRoutePermission, type RoutePermission } from './route-permissions';

export type RouteMapping = RoutePermission;

/**
 * Resolves an express route to the permission that governs it.
 *
 * Backed by a compiled map rather than a CSV read at runtime, so a deployment
 * cannot silently lose every mapping because a docs/ path failed to resolve.
 */
export function routeToPermission(method: string, routePath: string): RouteMapping | undefined {
  return lookupRoutePermission(method, routePath);
}

export function recordDivergence(
  store: DataStore,
  entry: {
    userId: string;
    companyId: string;
    module: string;
    action: string;
    route: string;
    legacyAllowed: boolean;
    openfgaAllowed: boolean;
  },
): void {
  if (entry.legacyAllowed === entry.openfgaAllowed) return;
  store.recordAuthzDivergence(entry);
}

/**
 * Fire-and-forget shadow comparison.
 *
 * Never awaited into the request path and never throws: shadow mode observes,
 * and must not be able to affect a live response. The legacy answer decides.
 */
export function recordShadowCheck(deps: {
  store: DataStore;
  service: PermissionService;
  userId: string;
  companyId: string;
  method: string;
  routePath: string;
  legacyAllowed: boolean;
}): void {
  const mapping = routeToPermission(deps.method, deps.routePath);
  if (!mapping) return;

  deps.service
    .has(deps.userId, deps.companyId, mapping.module, mapping.action)
    .then((openfgaAllowed) => {
      recordDivergence(deps.store, {
        userId: deps.userId,
        companyId: deps.companyId,
        module: mapping.module,
        action: mapping.action,
        route: `${deps.method.toUpperCase()} ${deps.routePath}`,
        legacyAllowed: deps.legacyAllowed,
        openfgaAllowed,
      });
    })
    .catch(() => {
      /* Observational only. A failure here must never surface to the caller. */
    });
}
