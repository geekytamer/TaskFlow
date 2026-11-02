/**
 * Companies form a tree (a company with children is a group, and a group is a
 * company). The same rules as the server's companies/tree.ts, applied to the
 * companies this person can see.
 */

export interface TreeCompany {
  id: string;
  parentCompanyId?: string | null;
}

export type CompanyScope = 'tree' | 'self';

/** The company itself first, then everything below it, breadth-first. */
export function subtree(companies: readonly TreeCompany[], rootId: string): string[] {
  const out = [rootId];
  const seen = new Set(out);
  for (let i = 0; i < out.length; i += 1) {
    for (const c of companies) {
      if (c.parentCompanyId === out[i] && !seen.has(c.id)) {
        seen.add(c.id);
        out.push(c.id);
      }
    }
  }
  return out;
}

export const isGroupCompany = (companies: readonly TreeCompany[], id: string): boolean =>
  companies.some((c) => c.parentCompanyId === id);

/**
 * The companies a page shows. `self` is the selected company alone; `tree` is
 * the saved filter (only ids still in the tree, in tree order), or the whole
 * tree when nothing of the filter is left.
 */
export function scopeCompanyIds(
  companies: readonly TreeCompany[],
  selectedId: string,
  scope: CompanyScope,
  savedFilter: readonly string[],
): string[] {
  if (scope === 'self' || !isGroupCompany(companies, selectedId)) return [selectedId];
  const tree = subtree(companies, selectedId);
  const wanted = new Set(savedFilter);
  const filtered = tree.filter((id) => wanted.has(id));
  return filtered.length ? filtered : tree;
}

/**
 * Companies for a list: each top company (by name), then its companies
 * beneath it, deeper ones indented further. A company whose parent this
 * person can't see is listed as a top.
 */
export function treeOrder<T extends TreeCompany & { name: string }>(companies: readonly T[]): Array<{ company: T; depth: number }> {
  const ids = new Set(companies.map((c) => c.id));
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const out: Array<{ company: T; depth: number }> = [];
  const seen = new Set<string>();
  const visit = (company: T, depth: number) => {
    if (seen.has(company.id)) return;
    seen.add(company.id);
    out.push({ company, depth });
    companies.filter((c) => c.parentCompanyId === company.id).sort(byName).forEach((c) => visit(c, depth + 1));
  };
  companies.filter((c) => !c.parentCompanyId || !ids.has(c.parentCompanyId)).sort(byName).forEach((c) => visit(c, 0));
  return out;
}
