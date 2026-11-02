/**
 * Companies form a tree through `parentCompanyId`. A company with children is
 * a group, and a group is a company like any other. These helpers work on any
 * list of companies, so the store, the routes and the tests share one answer.
 */

export interface TreeNode {
  id: string;
  parentCompanyId?: string | null;
}

export const childIds = (companies: readonly TreeNode[], id: string): string[] =>
  companies.filter((c) => c.parentCompanyId === id).map((c) => c.id);

/** The company itself first, then everything below it, breadth-first. */
export const subtreeIds = (companies: readonly TreeNode[], rootId: string): string[] => {
  const out = [rootId];
  const seen = new Set(out);
  for (let i = 0; i < out.length; i += 1) {
    for (const child of childIds(companies, out[i])) {
      // A corrupt loop in the data must not hang a request.
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
    }
  }
  return out;
};

/** The top of the company's tree (itself when it has no parent). */
export const topOf = (companies: readonly TreeNode[], id: string): string => {
  const byId = new Map(companies.map((c) => [c.id, c]));
  let current = id;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const parent = byId.get(current)?.parentCompanyId;
    if (!parent || !byId.has(parent)) return current;
    current = parent;
  }
  return current;
};

/** True when `parentId` is the child itself or anywhere below it. */
export const wouldCycle = (companies: readonly TreeNode[], childId: string, parentId: string): boolean =>
  subtreeIds(companies, childId).includes(parentId);
