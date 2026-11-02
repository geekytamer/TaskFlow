/**
 * "No higher than me" on the client, so the screens never offer a change the
 * server will refuse with HIGHER_THAN_YOU. Mirrors backend
 * authz/describe.ts beyond() exactly (tested side by side in beyond.test.ts):
 *   - a key I do not hold;
 *   - a wider scope than mine (an unscoped grant of mine counts as company);
 *   - a higher limit, or no limit, where mine has one;
 *   - a sensitive field's view / edit I do not have.
 * The platform super admin is exempt on the server, so `me = null` means
 * "nothing is beyond me".
 */
import type { Access } from '@/lib/permissions';
import type { RoleField, RoleGrant, Scope } from '@/services/authzService';

const SCOPES: readonly Scope[] = ['own', 'team', 'company', 'group'];

export interface Holder {
  grant: (key: string) => { scope?: Scope; limit?: number } | undefined;
  field: (key: string) => { view: boolean; edit: boolean };
}

/** What the signed-in person holds in the selected company; null for the super admin (exempt). */
export function holderFromAccess(access: Pick<Access, 'can' | 'scopeOf' | 'limitOf' | 'field' | 'superAdmin'>): Holder | null {
  if (access.superAdmin) return null;
  return {
    grant: (key) => (access.can(key) ? { scope: access.scopeOf(key), limit: access.limitOf(key) } : undefined),
    field: (key) => access.field(key),
  };
}

/** Permission names ('sales.view', 'field:salary') the grants and fields give beyond `me`. */
export function beyondMe(
  me: Holder | null,
  grants: ReadonlyArray<Pick<RoleGrant, 'key' | 'scope' | 'limit'>>,
  fields: ReadonlyArray<Pick<RoleField, 'key' | 'view' | 'edit'>> = [],
): string[] {
  if (!me) return [];
  const out: string[] = [];
  for (const g of grants) {
    const mine = me.grant(g.key);
    if (!mine) { out.push(g.key); continue; }
    if (g.scope && SCOPES.indexOf(g.scope) > SCOPES.indexOf(mine.scope ?? 'company')) { out.push(g.key); continue; }
    if (mine.limit !== undefined && (g.limit === undefined || g.limit === null || g.limit > mine.limit)) out.push(g.key);
  }
  for (const f of fields) {
    const mine = me.field(f.key);
    if ((f.view && !mine.view) || (f.edit && !mine.edit)) out.push(`field:${f.key}`);
  }
  return [...new Set(out)];
}

/** One grant (or field switch) within what I hold. */
export const within = (me: Holder | null, grant: Pick<RoleGrant, 'key' | 'scope' | 'limit'>) => beyondMe(me, [grant]).length === 0;

/** A Holder from the group detail's `me.access` (C-2): what someone holds in every company of the group. */
export function holderFromFloor(
  access: { grants: ReadonlyArray<Pick<RoleGrant, 'key' | 'scope' | 'limit'>>; fields: ReadonlyArray<Pick<RoleField, 'key' | 'view' | 'edit'>> } | null | undefined,
): Holder | null {
  if (!access) return null;
  const grants = new Map(access.grants.map((g) => [g.key, g]));
  const fields = new Map(access.fields.map((f) => [f.key, f]));
  return {
    grant: (key) => {
      const g = grants.get(key);
      return g ? { scope: g.scope ?? undefined, limit: g.limit ?? undefined } : undefined;
    },
    field: (key) => ({ view: Boolean(fields.get(key)?.view), edit: Boolean(fields.get(key)?.edit) }),
  };
}
