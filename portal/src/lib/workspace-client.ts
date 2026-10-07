/** Browser side: one write to the creator workspace through this host's own /api proxy. */
export async function wsWrite<T = unknown>(path: string, body: unknown = {}): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(`/api/workspace/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = res.status === 204 ? null : ((await res.json().catch(() => null)) as T | null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
