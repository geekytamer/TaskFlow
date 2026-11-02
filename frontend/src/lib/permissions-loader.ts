/**
 * The load state of GET /me/permissions for the selected company, as a pure
 * reducer so the context and the tests share one rule.
 *
 *   idle ──start──▶ loading ──success──▶ ready
 *                     │  ▲                 │ start (other company) → loading, gates closed
 *                failure  start            │ start (same company) → stays ready, refetches
 *                     ▼  │
 *                    error  (start again automatically after RETRY_DELAYS_MS, then only by Retry)
 *
 * Gates are open only in `ready` for the selected company; `loading` and
 * `error` both keep them closed, but `error` tells the screen to say so and
 * offer Retry instead of spinning forever.
 */
import type { MyPermissions } from './permissions';

export const RETRY_DELAYS_MS = [2000, 5000, 15000] as const;

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LoadState {
  companyId: string | null;
  status: LoadStatus;
  feed: MyPermissions | null;
  /** Failed attempts in a row for this company. */
  failures: number;
}

export type LoadEvent =
  | { type: 'start'; companyId: string | null }
  | { type: 'success'; companyId: string; feed: MyPermissions }
  | { type: 'failure'; companyId: string };

export const INITIAL: LoadState = { companyId: null, status: 'idle', feed: null, failures: 0 };

export function loadReducer(state: LoadState, event: LoadEvent): LoadState {
  switch (event.type) {
    case 'start': {
      if (!event.companyId) return INITIAL;
      // Same company already answered: refresh in place, the gates stay as they are.
      if (event.companyId === state.companyId && state.status === 'ready') return state;
      // Another company (or no answer yet): close the gates until its answer arrives.
      if (event.companyId === state.companyId) return { ...state, status: 'loading' };
      return { companyId: event.companyId, status: 'loading', feed: null, failures: 0 };
    }
    case 'success':
      // A late answer for a company no longer selected is dropped.
      if (event.companyId !== state.companyId) return state;
      // The same answer again keeps its object, so screens do not re-render.
      if (state.status === 'ready' && JSON.stringify(state.feed) === JSON.stringify(event.feed)) return state;
      return { companyId: state.companyId, status: 'ready', feed: event.feed, failures: 0 };
    case 'failure':
      if (event.companyId !== state.companyId) return state;
      // A failed refresh keeps the answer already held; a first load becomes an error.
      if (state.status === 'ready') return { ...state, failures: state.failures + 1 };
      return { ...state, status: 'error', feed: null, failures: state.failures + 1 };
    default:
      return state;
  }
}

/** The delay before the next automatic retry, or null when retries are spent. */
export function nextRetryDelay(state: LoadState): number | null {
  if (state.status !== 'error') return null;
  return RETRY_DELAYS_MS[state.failures - 1] ?? null;
}

/** The answer that may open gates for `companyId`: only a ready answer for that company. */
export function usableFeed(state: LoadState, companyId: string | null | undefined): MyPermissions | null {
  if (!companyId || state.status !== 'ready' || state.companyId !== companyId) return null;
  return state.feed && state.feed.companyId === companyId ? state.feed : null;
}
