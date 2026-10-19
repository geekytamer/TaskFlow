import { CredentialsMethod, OpenFgaClient } from '@openfga/sdk';

export interface FgaConfig {
  apiUrl: string;
  storeId: string;
  modelId: string;
  apiToken: string;
}

/**
 * OpenFGA connection settings, for the remaining ops commands (fga:*) only.
 * OpenFGA decides nothing any more (PERMISSIONS_ENGINE, authz/engine.ts), so
 * none of these is required to start the server. Removed in Task 12.
 */
export function getFgaConfig(): FgaConfig {
  return {
    apiUrl: process.env.FGA_API_URL ?? 'http://127.0.0.1:8080',
    storeId: process.env.FGA_STORE_ID ?? '',
    modelId: process.env.FGA_MODEL_ID ?? '',
    apiToken: process.env.FGA_API_TOKEN ?? '',
  };
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
 * Bootstrap runs precisely when there is no store yet. It is never cached, so
 * bootstrapping cannot repoint the shared client at a new store.
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
