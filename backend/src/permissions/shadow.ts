import fs from 'fs';
import path from 'path';
import type { DataStore } from '../data/store';
import type { PermissionService } from './permission-service';

export interface RouteMapping {
  module: string;
  action: string;
}

let routeMap: Map<string, RouteMapping> | undefined;

/**
 * The route -> permission map comes from the same generated matrix the seed
 * data was built from, so shadow mode compares exactly the permission the
 * refactor will later enforce at that route.
 */
function loadRouteMap(): Map<string, RouteMapping> {
  if (routeMap) return routeMap;
  routeMap = new Map();
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv'),
    path.join(process.cwd(), '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv'),
  ];
  const csvPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!csvPath) return routeMap;

  fs.readFileSync(csvPath, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .forEach((line) => {
      const [method, route, module, action, , , gate] = line.split(',');
      if (gate === 'none') return;
      routeMap!.set(`${method.toUpperCase()} ${route}`, { module, action });
    });
  return routeMap;
}

export function routeToPermission(method: string, routePath: string): RouteMapping | undefined {
  return loadRouteMap().get(`${method.toUpperCase()} ${routePath}`);
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
