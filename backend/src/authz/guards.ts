/**
 * The two rules every change to who-holds-what follows, shared by the People
 * API (authz/routes.ts), the user form (PUT/DELETE /users in server.ts) and
 * the group API (authz/holding-routes.ts):
 *
 *   - No higher than me: nobody gives permissions they do not hold, nor
 *     changes someone who holds more than them (super admin exempt). The 403
 *     names only what exceeds the actor, with its scope (M-7).
 *   - Lock-out guard: a change that leaves a company with nobody able to
 *     manage roles is refused (409 LOCKOUT) and rolled back. Under v2 that is
 *     people.manage_roles; while legacy decides (legacy, shadow) it is the
 *     company's last Admin (C-1, an intended safety difference, spec §6).
 */
import { HttpError } from '../http';
import type { DataStore } from '../data/store';
import { getEffectiveRole } from '../http';
import type { PermissionsEngine } from './engine';
import { clearEffectiveCache, effective, effectiveLegacy, type CompanyEffective, type Effective } from './evaluate';
import { beyondDetail, excessList, type Excess } from './describe';
import type { TemplateField, TemplateGrant } from './templates';

/** 403 HIGHER_THAN_YOU naming what exceeds the actor (at most three, then "and N more"). */
export function higherThanYou(excess: readonly Excess[], where?: string): HttpError {
  const list = excessList(excess);
  return new HttpError(
    403,
    `You can't give permissions you don't have yourself${where ? ` in ${where}` : ''}: ${list.en}.`,
    { code: 'HIGHER_THAN_YOU', permission: excess[0]?.key ?? null, missing: excess.map((e) => e.key), excess, ...(where ? { where } : {}) },
  );
}

export function roleGuards(store: DataStore, engine: PermissionsEngine) {
  /** The Effective that answers for someone else, by the same rule as viewerOf (Ruling D). */
  const effectiveOf = (userId: string): Effective =>
    (engine === 'v2' ? effective(store, userId) : effectiveLegacy(store, userId));

  /** No higher than me against an actor's access in one company (the caller exempts the super admin). */
  const requireWithin = (
    actor: CompanyEffective | undefined,
    grants: readonly TemplateGrant[],
    fields: readonly TemplateField[],
    where?: string,
  ) => {
    const excess = beyondDetail(actor, grants, fields);
    if (excess.length) throw higherThanYou(excess, where);
  };

  /** Who keeps the company manageable: people.manage_roles holders (v2), else its Admins (legacy decides). */
  const holdersOf = (companyId: string) => store.listUsersByCompany(companyId).filter((u) => {
    if (u.isSuperAdmin) return false;
    if (engine === 'v2') return Boolean(effectiveOf(u.id).byCompany.get(companyId)?.grants.has('people.manage_roles'));
    return getEffectiveRole(u, companyId) === 'Admin';
  });

  /**
   * Runs a change in one transaction and refuses it (409 LOCKOUT, rolled
   * back) when it leaves any of the companies with nobody holding what
   * manages roles there, where someone did before.
   */
  const guarded = <T>(companyIds: string | readonly string[], fn: () => T): T => {
    const ids = [...new Set(typeof companyIds === 'string' ? [companyIds] : companyIds)];
    try {
      return store.transaction(() => {
        const before = new Map(ids.map((id) => [id, holdersOf(id).length]));
        const out = fn();
        clearEffectiveCache();
        for (const id of ids) {
          if ((before.get(id) ?? 0) > 0 && holdersOf(id).length === 0) {
            throw new HttpError(409, engine === 'v2'
              ? 'That change would leave this company with nobody able to manage roles.'
              : 'That change would leave this company with no Admin. Make someone else Admin first.', { code: 'LOCKOUT', ...(engine === 'v2' ? {} : { lastAdmin: true }) });
          }
        }
        return out;
      });
    } catch (error) {
      // Answers worked out inside the rolled-back change carry a version
      // number a later change will reuse: forget them.
      clearEffectiveCache();
      throw error;
    }
  };

  return { effectiveOf, requireWithin, holdersOf, guarded };
}
