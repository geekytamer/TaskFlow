/**
 * Approving several items at once. Each goes through the ordinary decision
 * call (so every permission, limit and hold check still runs per document),
 * one after another so a held payment or a group step sees the one before it.
 */
export interface BulkResult<T> { done: T[]; failed: Array<{ item: T; message: string }> }

export async function approveEach<T>(items: T[], approve: (item: T) => Promise<unknown>, onProgress?: (count: number) => void): Promise<BulkResult<T>> {
  const result: BulkResult<T> = { done: [], failed: [] };
  for (const item of items) {
    try {
      await approve(item);
      result.done.push(item);
    } catch (error) {
      result.failed.push({ item, message: error instanceof Error ? error.message : String(error) });
    }
    onProgress?.(result.done.length + result.failed.length);
  }
  return result;
}

/** What a selection adds up to: money per currency (never mixed), leave in days. */
export function totalsByCurrency(rows: Array<{ amount: number; currency: string; days: boolean }>) {
  const money: Record<string, number> = {};
  let days = 0;
  for (const r of rows) {
    if (!(r.amount > 0)) continue;
    if (r.days) days += r.amount;
    else money[r.currency] = Math.round(((money[r.currency] ?? 0) + r.amount) * 1000) / 1000;
  }
  return { money, days };
}
