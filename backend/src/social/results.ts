import type { DataStore } from '../data/store';
import { openToken } from './crypto';
import type { MetaClient } from './meta-client';

/** Placeholder until Task 6 (proof of delivery); kept so the sweep's shape is final. */
export async function sweepMediaResults(_store: DataStore, _client: MetaClient, _companyId: string, _now: Date): Promise<void> {
  void openToken;
}
