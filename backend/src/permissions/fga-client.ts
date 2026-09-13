import { CredentialsMethod, OpenFgaClient } from '@openfga/sdk';

export type AuthzEngine = 'legacy' | 'shadow' | 'openfga';

const ENGINES: AuthzEngine[] = ['legacy', 'shadow', 'openfga'];

export interface FgaConfig {
  engine: AuthzEngine;
  apiUrl: string;
  storeId: string;
  modelId: string;
  apiToken: string;
}

/**
 * Reads the authorization engine configuration from the environment.
 *
 * A typo in AUTHZ_ENGINE throws rather than falling back to a default. Silently
 * defaulting would either lock everyone out or, worse, quietly pick a more
 * permissive engine than the operator intended.
 */
export function getFgaConfig(): FgaConfig {
  const raw = process.env.AUTHZ_ENGINE ?? 'legacy';
  if (!ENGINES.includes(raw as AuthzEngine)) {
    throw new Error(
      `AUTHZ_ENGINE must be one of ${ENGINES.join(' | ')}, received "${raw}".`,
    );
  }
  const engine = raw as AuthzEngine;
  const config: FgaConfig = {
    engine,
    apiUrl: process.env.FGA_API_URL ?? 'http://127.0.0.1:8080',
    storeId: process.env.FGA_STORE_ID ?? '',
    modelId: process.env.FGA_MODEL_ID ?? '',
    apiToken: process.env.FGA_API_TOKEN ?? '',
  };
  if (engine !== 'legacy') {
    if (!config.storeId) {
      throw new Error('FGA_STORE_ID is required when AUTHZ_ENGINE is not "legacy".');
    }
    if (!config.modelId) {
      throw new Error('FGA_MODEL_ID is required when AUTHZ_ENGINE is not "legacy".');
    }
  }
  return config;
}

function credentialsFor(apiToken: string) {
  return apiToken
    ? { method: CredentialsMethod.ApiToken as const, config: { token: apiToken } }
    : { method: CredentialsMethod.None as const };
}

let cached: OpenFgaClient | undefined;

export function getFgaClient(): OpenFgaClient {
  if (cached) return cached;
  const config = getFgaConfig();
  cached = new OpenFgaClient({
    apiUrl: config.apiUrl,
    storeId: config.storeId,
    authorizationModelId: config.modelId || undefined,
    credentials: credentialsFor(config.apiToken),
  });
  return cached;
}

/**
 * A client for creating the store, before any store or model exists.
 *
 * getFgaClient refuses to build a client without FGA_STORE_ID whenever the
 * engine is not legacy. That is right for serving requests and exactly wrong
 * for bootstrap, which runs precisely when there is no store yet. It is never
 * cached, so bootstrapping cannot repoint the shared client at a new store.
 */
export function createBootstrapFgaClient(): OpenFgaClient {
  return new OpenFgaClient({
    apiUrl: process.env.FGA_API_URL ?? 'http://127.0.0.1:8080',
    credentials: credentialsFor(process.env.FGA_API_TOKEN ?? ''),
  });
}

/** Test seam: drop the memoised client so a caller can change env and re-read it. */
export function resetFgaClient(): void {
  cached = undefined;
}

export async function fgaHealthy(): Promise<boolean> {
  try {
    await getFgaClient().readAuthorizationModels({ pageSize: 1 });
    return true;
  } catch {
    return false;
  }
}
