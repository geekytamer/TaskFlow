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
