import type { DataStore } from '../data/store';
import { getFgaClient } from './fga-client';
import { permissionKey } from './catalogue';
import { parsePermissionObject } from './tuples';

export class AuthzUnavailableError extends Error {
  status = 503;

  constructor(message = 'Authorization service is unavailable.') {
    super(message);
    this.name = 'AuthzUnavailableError';
  }
}

/** Permissions for one user, grouped by company. */
export type PermissionMap = Map<string, Set<string>>;

export interface FgaReader {
  /** Every permission object granted to the user, across all companies. */
  listGrantedObjects(userId: string): Promise<string[]>;
}

export class OpenFgaReader implements FgaReader {
  async listGrantedObjects(userId: string): Promise<string[]> {
    const response = await getFgaClient().listObjects({
      user: `user:${userId}`,
      relation: 'granted',
      type: 'permission',
    });
    return response.objects ?? [];
  }
}

interface CacheEntry {
  version: number;
  permissions: PermissionMap;
}

/**
 * Upper bound on cached users. The cache exists to spare a network round trip
 * per request, not to hold every user who has ever signed in — without a bound
 * it grows for the life of the process. Eviction is oldest-first, which for a
 * Map means insertion order.
 */
const MAX_CACHED_USERS = 500;

/**
 * Resolves permissions for a user in a single round trip covering every company
 * they belong to, then serves synchronous lookups from the result.
 *
 * That shape is deliberate. The 233 existing gates are synchronous calls buried
 * inside route handlers; making them async would mean touching every one. So
 * the whole map is prefetched once per request in middleware, and the gates
 * stay synchronous reads against it.
 */
export class PermissionService {
  private readonly store: DataStore;

  private readonly fga: FgaReader;

  private readonly cache = new Map<string, CacheEntry>();

  private readonly onWarning?: (message: string) => void;

  constructor(deps: {
    store: DataStore;
    fga?: FgaReader;
    onWarning?: (message: string) => void;
  }) {
    this.store = deps.store;
    this.fga = deps.fga ?? new OpenFgaReader();
    this.onWarning = deps.onWarning;
  }

  /**
   * Cached against the authz_version counter, which every group, grant and
   * assignment change bumps. Reading it is a local SQLite read measured in
   * microseconds, and under pm2 cluster mode all workers read the same counter,
   * so they invalidate in lockstep.
   */
  async getAllPermissions(userId: string): Promise<PermissionMap> {
    const version = this.store.getAuthzVersion();
    const cached = this.cache.get(userId);
    if (cached && cached.version === version) return cached.permissions;

    try {
      const objects = await this.fga.listGrantedObjects(userId);
      const permissions: PermissionMap = new Map();
      for (const object of objects) {
        const parsed = parsePermissionObject(object);
        if (!parsed) continue;
        if (!permissions.has(parsed.companyId)) permissions.set(parsed.companyId, new Set());
        permissions.get(parsed.companyId)!.add(permissionKey(parsed.module, parsed.action));
      }
      this.cache.set(userId, { version, permissions });
      this.evictIfOversized();
      return permissions;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A stale set beats locking everyone out. A cold cache has nothing to
      // fall back on, and that is the only case that fails — as 503, never 403,
      // because the user may well hold the permission; we cannot confirm it.
      if (cached) {
        this.onWarning?.(`OpenFGA unreachable (${message}); serving stale permissions for ${userId}.`);
        return cached.permissions;
      }
      this.onWarning?.(`OpenFGA unreachable (${message}); no cached permissions for ${userId}.`);
      throw new AuthzUnavailableError();
    }
  }

  async getPermissions(userId: string, companyId: string): Promise<Set<string>> {
    return (await this.getAllPermissions(userId)).get(companyId) ?? new Set();
  }

  async has(userId: string, companyId: string, module: string, action: string): Promise<boolean> {
    return (await this.getPermissions(userId, companyId)).has(permissionKey(module, action));
  }

  /** Synchronous check against an already-resolved map. Used by the gates. */
  static allows(
    permissions: PermissionMap | undefined,
    companyId: string,
    module: string,
    action: string,
  ): boolean {
    return permissions?.get(companyId)?.has(permissionKey(module, action)) ?? false;
  }

  private evictIfOversized(): void {
    while (this.cache.size > MAX_CACHED_USERS) {
      const oldest = this.cache.keys().next();
      if (oldest.done) return;
      this.cache.delete(oldest.value);
    }
  }

  /** Test seam. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Test seam. */
  get cacheSize(): number {
    return this.cache.size;
  }
}
