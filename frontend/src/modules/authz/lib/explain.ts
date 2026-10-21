/**
 * "Why" for each line of a person's plain-language summary.
 *
 * The server writes the summary (backend authz/describe.ts summaryLines) in
 * catalogue order: for each area the person holds anything in, one line for
 * the area, then one line per limited action they hold with a limit; last, one
 * line naming the sensitive information they cannot see. This walks the same
 * order over the person's grants and attaches the roles each line comes from.
 * When the counts do not line up (an older server), the lines are shown
 * without reasons rather than with wrong ones.
 */
import type { CatalogueArea, GrantSource, Label, PersonDetail } from '@/services/authzService';

export interface ExplainedLine {
  text: Label;
  /** Distinct sources, main role first. Empty: nothing gives it (the "can't see" line). */
  why: GrantSource[];
  kind: 'area' | 'limit' | 'hidden';
}

const KIND_ORDER: Record<GrantSource['kind'], number> = { main: 0, addon: 1, temporary: 2, holding: 3 };

export function distinctSources(sources: GrantSource[]): GrantSource[] {
  const seen = new Map<string, GrantSource>();
  for (const s of sources) {
    const id = `${s.kind}:${s.roleId}`;
    if (!seen.has(id)) seen.set(id, s);
  }
  return [...seen.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.roleName.localeCompare(b.roleName));
}

export function explainSummary(
  person: Pick<PersonDetail, 'summary' | 'grants'>,
  areas: readonly CatalogueArea[],
): ExplainedLine[] {
  const byKey = new Map(person.grants.map((g) => [g.key, g]));
  const expected: Array<{ kind: ExplainedLine['kind']; why: GrantSource[] }> = [];
  for (const area of areas) {
    const held = area.actions.map((a) => byKey.get(a.key)).filter((g): g is NonNullable<typeof g> => Boolean(g));
    if (!held.length) continue;
    expected.push({ kind: 'area', why: distinctSources(held.flatMap((g) => g.sources)) });
    for (const action of area.actions) {
      const grant = byKey.get(action.key);
      if (!action.limit || grant?.limit === undefined) continue;
      expected.push({ kind: 'limit', why: distinctSources(grant.sources) });
    }
  }
  const lines = person.summary;
  const hasHidden = lines.length === expected.length + 1;
  if (lines.length !== expected.length && !hasHidden) {
    return lines.map((text) => ({ text, why: [], kind: 'area' }));
  }
  return lines.map((text, i) => (i < expected.length
    ? { text, why: expected[i].why, kind: expected[i].kind }
    : { text, why: [], kind: 'hidden' }));
}
