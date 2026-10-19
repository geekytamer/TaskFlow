/**
 * Questions asked of an Effective (evaluate.ts).
 *
 * can(): does the person hold `key` in the company, does a record fall inside
 * the grant's scope, and is an amount within its limit.
 *   - No record context (ownerUserId undefined): the permission alone decides.
 *   - ownerUserId null: the record has no owner; only company/group scope (or
 *     a share) reaches it.
 *   - own: I own it or it is shared with me. team: the owner is me or in my
 *     manager line, or it is shared with me. company and group: every record
 *     of that company (group differs from company only in reaching every
 *     company of a holding group, which evaluate.ts already expanded).
 *   - Unscoped actions ignore the record.
 */
import type { Scope } from './catalogue';
import type { Effective } from './evaluate';

export interface CanContext {
  companyId: string;
  ownerUserId?: string | null;
  sharedWith?: readonly string[];
  amount?: number;
}

export interface CanResult {
  allowed: boolean;
  reason?: 'no_permission' | 'out_of_scope' | 'over_limit';
}

export function can(eff: Effective, key: string, ctx: CanContext): CanResult {
  const grant = eff.byCompany.get(ctx.companyId)?.grants.get(key);
  if (!grant) return { allowed: false, reason: 'no_permission' };
  if (ctx.ownerUserId !== undefined && grant.scope && !inScope(eff, grant.scope, ctx)) {
    return { allowed: false, reason: 'out_of_scope' };
  }
  if (ctx.amount !== undefined && grant.limit !== undefined && ctx.amount > grant.limit) {
    return { allowed: false, reason: 'over_limit' };
  }
  return { allowed: true };
}

function inScope(eff: Effective, scope: Scope, ctx: CanContext): boolean {
  if (scope === 'company' || scope === 'group') return true;
  if (ctx.sharedWith?.includes(eff.userId)) return true;
  const owner = ctx.ownerUserId;
  if (!owner) return false;
  if (owner === eff.userId) return true;
  return scope === 'team' && eff.team(ctx.companyId).has(owner);
}

/**
 * The scope a person holds `key` with in a company: null when they do not hold
 * it; 'company' for an action that takes no scope (it applies company-wide).
 */
export function scopeOf(eff: Effective, key: string, companyId: string): Scope | null {
  const grant = eff.byCompany.get(companyId)?.grants.get(key);
  if (!grant) return null;
  return grant.scope ?? 'company';
}
