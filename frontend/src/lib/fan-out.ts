/**
 * A whole-group read: the same per-company request, once per company, merged.
 * Each company keeps exactly its own server checks; one that refuses is named
 * in `missing` (spec 2026-11-02-group-as-company, stage 2).
 */
import { ApiError } from './api-client';

export type MissingReason = 'forbidden' | 'off' | 'error';
export interface MissingCompany {
  companyId: string;
  reason: MissingReason;
}

const reasonOf = (error: unknown): MissingReason => {
  if (error instanceof ApiError) {
    const code = (error.details as { code?: unknown } | undefined)?.code;
    if (code === 'MODULE_OFF') return 'off';
    if (error.status === 403) return 'forbidden';
  }
  return 'error';
};

export async function fanOut<T extends object>(
  companyIds: readonly string[],
  load: (companyId: string) => Promise<T[]>,
  options: {
    /** A reason to leave a company out without asking (its module is switched off), or null to ask. */
    skip?: (companyId: string) => MissingReason | null;
  } = {},
): Promise<{ rows: Array<T & { companyId: string }>; missing: MissingCompany[] }> {
  const rows: Array<T & { companyId: string }> = [];
  const missing: MissingCompany[] = [];
  const asked: string[] = [];
  for (const id of companyIds) {
    const reason = options.skip?.(id) ?? null;
    if (reason) missing.push({ companyId: id, reason });
    else asked.push(id);
  }
  const answers = await Promise.allSettled(asked.map((id) => load(id)));
  answers.forEach((answer, i) => {
    const companyId = asked[i];
    if (answer.status === 'rejected') {
      missing.push({ companyId, reason: reasonOf(answer.reason) });
      return;
    }
    for (const row of answer.value ?? []) {
      const own = (row as { companyId?: unknown }).companyId;
      rows.push({ ...row, companyId: typeof own === 'string' && own ? own : companyId });
    }
  });
  return { rows, missing };
}

/** Numbered requests: only the newest may land. */
export function latest() {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (ticket: number) => ticket === current,
  };
}

