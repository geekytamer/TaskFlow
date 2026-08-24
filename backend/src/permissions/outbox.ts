import type { DataStore } from '../data/store';
import { getFgaClient } from './fga-client';
import type { TupleKey } from './tuples';

const BATCH = 100;

export interface TupleWriter {
  write(request: { writes?: TupleKey[]; deletes?: TupleKey[] }): Promise<unknown>;
}

/**
 * Queues tuple deltas for delivery to OpenFGA.
 *
 * SQLite and OpenFGA cannot share a transaction, so group changes append their
 * deltas here inside the same transaction as the SQL write. A crash between the
 * two therefore loses nothing: the row is still queued.
 */
export function enqueueTuples(store: DataStore, op: 'write' | 'delete', tuples: TupleKey[]): void {
  store.enqueueFgaTuples(op, tuples as unknown as Array<Record<string, string>>);
}

export async function drainOutbox(
  store: DataStore,
  writer: TupleWriter = getFgaClient() as unknown as TupleWriter,
): Promise<{ flushed: number; failed: number }> {
  const rows = store.takeFgaOutboxBatch(BATCH);
  if (!rows.length) return { flushed: 0, failed: 0 };

  const writes = rows.filter((r) => r.op === 'write').map((r) => JSON.parse(r.tuple) as TupleKey);
  const deletes = rows.filter((r) => r.op === 'delete').map((r) => JSON.parse(r.tuple) as TupleKey);

  try {
    // Deletes first, so a re-pointed tuple never collides with its replacement.
    if (deletes.length) await writer.write({ deletes });
    if (writes.length) await writer.write({ writes });
    store.deleteFgaOutboxRows(rows.map((r) => r.id));
    return { flushed: rows.length, failed: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.markFgaOutboxFailure(rows.map((r) => r.id), message);
    return { flushed: 0, failed: rows.length };
  }
}
