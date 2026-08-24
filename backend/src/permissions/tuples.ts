import type { DataStore } from '../data/store';

export interface TupleKey {
  user: string;
  relation: string;
  object: string;
}

/**
 * Permission objects are keyed `<companyId>/<module>/<action>`.
 *
 * `/` is the separator because OpenFGA's own documentation demonstrates it
 * inside object ids (`repository:auth0/express-jwt`), whereas whether a `:` is
 * legal inside the id portion is undocumented — the type/id split is on the
 * first colon, and relying on that is not worth the risk.
 */
export function permissionObject(companyId: string, module: string, action: string): string {
  return `permission:${companyId}/${module}/${action}`;
}

/** Parses a permission object id back into its parts, or undefined if malformed. */
export function parsePermissionObject(
  object: string,
): { companyId: string; module: string; action: string } | undefined {
  if (!object.startsWith('permission:')) return undefined;
  const parts = object.slice('permission:'.length).split('/');
  if (parts.length !== 3) return undefined;
  const [companyId, module, action] = parts;
  if (!companyId || !module || !action) return undefined;
  return { companyId, module, action };
}

/**
 * Every tuple implied by the current SQL state. The reconciler diffs OpenFGA
 * against this, so it is the definition of "correct" for the tuple store.
 */
export function tuplesForStore(store: DataStore): TupleKey[] {
  const tuples: TupleKey[] = [];

  store.listAllGroupAssignments().forEach((a) => {
    tuples.push({
      user: `user:${a.userId}`,
      relation: 'direct_member',
      object: `group:${a.groupId}`,
    });
  });

  // parent implies child: members of the parent inherit the child's grants.
  store.listAllGroupImplications().forEach((i) => {
    tuples.push({
      user: `group:${i.parentGroupId}`,
      relation: 'implied_by',
      object: `group:${i.childGroupId}`,
    });
  });

  const owners = new Set<string>();
  store.listAllGroupGrants().forEach((g) => {
    const object = permissionObject(g.companyId, g.module, g.action);
    tuples.push({ user: `group:${g.groupId}#member`, relation: 'granted', object });
    if (!owners.has(object)) {
      owners.add(object);
      tuples.push({ user: `company:${g.companyId}`, relation: 'owner', object });
    }
  });

  // Platform staff pass ordinary permission checks without being assigned to
  // every company's groups. Separate from requireSuperAdmin, which stays a hard
  // gate on /admin/* and is never expressible as a grant.
  store.listSuperAdminCompanyPairs().forEach((pair) => {
    tuples.push({
      user: `user:${pair.userId}`,
      relation: 'super_admin',
      object: `company:${pair.companyId}`,
    });
  });

  return tuples;
}
