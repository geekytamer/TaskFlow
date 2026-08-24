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

export interface FgaReader {
  listPermissions(userId: string, companyId: string): Promise<string[]>;
}

/**
 * Resolves a user's whole permission set for a company in one ListObjects call,
 * rather than one Check per gate. A request that touches several gates then
 * costs a single round trip at most, and usually none.
 */
export class OpenFgaReader implements FgaReader {
  async listPermissions(userId: string, companyId: string): Promise<string[]> {
    const response = await getFgaClient().listObjects({
      user: `user:${userId}`,
      relation: 'granted',
      type: 'permission',
    });
    const permissions: string[] = [];
    for (const object of response.objects ?? []) {
      const parsed = parsePermissionObject(object);
      if (parsed && parsed.companyId === companyId) {
        permissions.push(permissionKey(parsed.module, parsed.action));
      }
    }
    return permissions;
  }
}

interface CacheEntry {
  version: number;
  permissions: Set<string>;
}

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
   * The cache is keyed by the authz_version counter, which every group, grant
   * and assignment change bumps. Reading that counter is a local SQLite read
   * measured in microseconds, and under pm2 cluster mode every worker reads the
   * same counter, so all workers invalidate in lockstep.
   */
  async getPermissions(userId: string, companyId: string): Promise<Set<string>> {
    const cacheKey = `${userId}:${companyId}`;
    const version = this.store.getAuthzVersion();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.version === version) return cached.permissions;

    try {
      const permissions = new Set(await this.fga.listPermissions(userId, companyId));
      this.cache.set(cacheKey, { version, permissions });
      return permissions;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Serving a stale set beats locking everyone out. A cold cache has
      // nothing to fall back on, and that is the only case that fails — as a
      // 503, never a 403, because the user does hold the permission; we simply
      // cannot confirm it.
      if (cached) {
        this.onWarning?.(
          `OpenFGA unreachable (${message}); serving stale permissions for ${cacheKey}.`,
        );
        return cached.permissions;
      }
      this.onWarning?.(`OpenFGA unreachable (${message}); no cached permissions for ${cacheKey}.`);
      throw new AuthzUnavailableError();
    }
  }

  async has(
    userId: string,
    companyId: string,
    module: string,
    action: string,
  ): Promise<boolean> {
    const permissions = await this.getPermissions(userId, companyId);
    return permissions.has(permissionKey(module, action));
  }

  /** Test seam. */
  clearCache(): void {
    this.cache.clear();
  }
}
