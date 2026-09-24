export interface OriginHeaders {
  origin?: string | null;
  host?: string | null;
}

/** State-changing requests must come from this very host. Browsers always send Origin on them. */
export function isSameOrigin({ origin, host }: OriginHeaders): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.trim().toLowerCase();
  } catch {
    return false;
  }
}
