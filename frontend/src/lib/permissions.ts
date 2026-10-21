/**
 * What the signed-in person may do in the selected company, read from the
 * server (GET /me/permissions). The staff app holds no rules of its own: every
 * gate asks `can(key)` with a catalogue key ('sales.view'), and every sensitive
 * value asks `field(key)`. Until the server has answered, every gate is closed.
 */

export type Scope = 'own' | 'team' | 'company' | 'group';
export type Engine = 'legacy' | 'shadow' | 'v2';

export interface Grant {
  key: string;
  scope?: Scope;
  limit?: number;
}

export interface FieldAccess {
  view: boolean;
  edit: boolean;
}

export interface MyPermissions {
  engine: Engine;
  version: number;
  companyId: string;
  superAdmin: boolean;
  member: boolean;
  grants: Grant[];
  fields: Array<{ key: string } & FieldAccess>;
  /** Legacy module keys the company switched off. */
  disabledModules: string[];
  academy: { lockedModules: string[] };
}

/** The sensitive fields of the catalogue (backend authz/catalogue.ts SENSITIVE_FIELDS). */
export const SENSITIVE_FIELDS = ['salary', 'personal_ids', 'bank_details', 'cost_prices', 'rate_cards', 'client_terms'] as const;
export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

const SCOPE_RANK: Record<Scope, number> = { own: 0, team: 1, company: 2, group: 3 };

export interface Access {
  /** False until the server has answered for the selected company: every gate is closed. */
  ready: boolean;
  /**
   * Holds `key`. With `scope`, the grant must reach at least that far
   * ('company' asks "everyone's records, not only mine"); an unscoped grant
   * answers true to any scope.
   */
  can: (key: string, opts?: { scope?: Scope }) => boolean;
  /** True when any of the keys is held. */
  canAny: (...keys: string[]) => boolean;
  /** The widest scope held for `key`; undefined when it is not held or not scoped. */
  scopeOf: (key: string) => Scope | undefined;
  /** The limit on `key` (amount or percent), when the role sets one. */
  limitOf: (key: string) => number | undefined;
  /** May the person see / change a sensitive field. Closed while loading. */
  field: (key: SensitiveField | string) => FieldAccess;
  superAdmin: boolean;
  /** A legacy module key the company switched off is off for everyone. */
  moduleOn: (module: string) => boolean;
  /** A module an unfinished Academy mission keeps read-only. */
  academyLocked: (module: string) => boolean;
  engine: Engine | undefined;
  version: number | undefined;
}

const CLOSED_FIELD: FieldAccess = { view: false, edit: false };

/**
 * Builds the gates from the server's answer. `null` (not loaded yet, failed,
 * no company) gives closed gates: nothing is shown on a guess. Modules the
 * company switched off may still be known from the company list
 * (`fallbackDisabledModules`), so a switched-off module stays hidden even then.
 */
export function buildAccess(feed: MyPermissions | null, fallbackDisabledModules: readonly string[] = []): Access {
  const disabled = new Set(feed?.disabledModules ?? fallbackDisabledModules);
  const moduleOn = (module: string) => !disabled.has(module);
  if (!feed) {
    return {
      ready: false,
      can: () => false,
      canAny: () => false,
      scopeOf: () => undefined,
      limitOf: () => undefined,
      field: () => CLOSED_FIELD,
      superAdmin: false,
      moduleOn,
      academyLocked: () => false,
      engine: undefined,
      version: undefined,
    };
  }

  const grants = new Map<string, Grant>();
  for (const grant of feed.grants) {
    const held = grants.get(grant.key);
    // Several roles may grant the same key: keep the widest scope.
    if (!held || (grant.scope && (!held.scope || SCOPE_RANK[grant.scope] > SCOPE_RANK[held.scope]))) {
      grants.set(grant.key, grant);
    }
  }
  const fields = new Map(feed.fields.map((f) => [f.key, { view: Boolean(f.view), edit: Boolean(f.edit) }]));
  const locked = new Set(feed.academy?.lockedModules ?? []);
  // The platform administrator is told apart (the platform pages), but in a
  // company the grants decide for them as for anyone: the server does the same.
  const superAdmin = Boolean(feed.superAdmin);

  const can = (key: string, opts?: { scope?: Scope }) => {
    const grant = grants.get(key);
    if (!grant) return false;
    if (!opts?.scope || !grant.scope) return true;
    return SCOPE_RANK[grant.scope] >= SCOPE_RANK[opts.scope];
  };

  return {
    ready: true,
    can,
    canAny: (...keys) => keys.some((k) => can(k)),
    scopeOf: (key) => grants.get(key)?.scope,
    limitOf: (key) => grants.get(key)?.limit,
    field: (key) => fields.get(key) ?? CLOSED_FIELD,
    superAdmin,
    moduleOn,
    academyLocked: (module) => locked.has(module),
    engine: feed.engine,
    version: feed.version,
  };
}
