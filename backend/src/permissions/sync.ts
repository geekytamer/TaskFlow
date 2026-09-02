import type { DataStore } from '../data/store';
import { getFgaClient } from './fga-client';
import { tuplesForStore, type TupleKey } from './tuples';

const key = (t: TupleKey) => `${t.user}|${t.relation}|${t.object}`;

export interface TupleDiff {
  toWrite: TupleKey[];
  toDelete: TupleKey[];
}

export function diffTuples(desired: TupleKey[], actual: TupleKey[]): TupleDiff {
  const desiredMap = new Map(desired.map((t) => [key(t), t]));
  const actualMap = new Map(actual.map((t) => [key(t), t]));
  return {
    toWrite: [...desiredMap].filter(([k]) => !actualMap.has(k)).map(([, t]) => t),
    toDelete: [...actualMap].filter(([k]) => !desiredMap.has(k)).map(([, t]) => t),
  };
}

export interface TupleStore {
  readAll(): Promise<TupleKey[]>;
  write(request: { writes?: TupleKey[]; deletes?: TupleKey[] }): Promise<unknown>;
}

/** Adapter over the OpenFGA client, paging through every tuple in the store. */
export function openFgaTupleStore(): TupleStore {
  const client = getFgaClient();
  return {
    async readAll() {
      const out: TupleKey[] = [];
      let continuationToken: string | undefined;
      do {
        const page: any = await client.read({}, { pageSize: 100, continuationToken });
        (page.tuples ?? []).forEach((t: any) => {
          if (t.key) {
            out.push({ user: t.key.user, relation: t.key.relation, object: t.key.object });
          }
        });
        continuationToken = page.continuation_token || undefined;
      } while (continuationToken);
      return out;
    },
    write: (request) => client.write(request as never),
  };
}

/**
 * Publishes only what one company's change actually altered.
 *
 * A full reconcile reads every tuple in the store back from OpenFGA — around
 * 470 per company, so roughly 23,000 reads at fifty companies, on every
 * checkbox an administrator ticks. Diffing the affected company against itself
 * before and after the change costs two local SQL reads and writes just the
 * delta, with no read from OpenFGA at all.
 */
export async function projectCompanyDelta(
  store: DataStore,
  companyId: string,
  before: TupleKey[],
  tupleStore?: Pick<TupleStore, 'write'>,
): Promise<{ written: number; deleted: number }> {
  const writer = tupleStore ?? openFgaTupleStore();
  const after = tuplesForStore(store, companyId);
  const { toWrite, toDelete } = diffTuples(after, before);
  if (!toWrite.length && !toDelete.length) return { written: 0, deleted: 0 };

  const CHUNK = 100;
  // Deletes first, so a repointed tuple never collides with its replacement.
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    await writer.write({ deletes: toDelete.slice(i, i + CHUNK) });
  }
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    await writer.write({ writes: toWrite.slice(i, i + CHUNK) });
  }
  return { written: toWrite.length, deleted: toDelete.length };
}

/**
 * Reconciles OpenFGA with SQL. SQL is authoritative, so anything OpenFGA holds
 * that SQL does not imply is removed, and anything missing is written.
 *
 * This is the recovery path when the two datastores are restored from backups
 * taken at different times. Idempotent: running it twice does nothing the
 * second time.
 */
export async function syncTuples(
  store: DataStore,
  opts: { dryRun?: boolean; tupleStore?: TupleStore } = {},
): Promise<TupleDiff & { written: number; deleted: number }> {
  const tupleStore = opts.tupleStore ?? openFgaTupleStore();
  const desired = tuplesForStore(store);
  const actual = await tupleStore.readAll();
  const { toWrite, toDelete } = diffTuples(desired, actual);

  if (opts.dryRun) return { toWrite, toDelete, written: 0, deleted: 0 };

  const CHUNK = 100;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    await tupleStore.write({ deletes: toDelete.slice(i, i + CHUNK) });
  }
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    await tupleStore.write({ writes: toWrite.slice(i, i + CHUNK) });
  }
  return { toWrite, toDelete, written: toWrite.length, deleted: toDelete.length };
}
