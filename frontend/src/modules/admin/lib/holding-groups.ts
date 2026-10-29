/**
 * Platform admin → Groups: who can be added where. A company belongs to at
 * most one holding group; group admins come from the group's companies (the
 * super admin may keep anyone already appointed, so they stay listed).
 */

export interface GroupLike { id: string; name: string; nameAr?: string | null; companyIds: string[]; adminUserIds: string[] }
export interface CompanyLike { id: string; name: string }
export interface UserLike { id: string; name: string; email: string; companyIds: string[] }

export interface CompanyChoice {
  id: string;
  name: string;
  /** The group the company is already in (another group); null when free. */
  inGroup: { id: string; name: string; nameAr?: string | null } | null;
}

/** Companies for the "Add company" picker: free ones first, then ones in another group (shown, not choosable). Excludes this group's own. */
export function companyChoices(companies: CompanyLike[], groups: GroupLike[], groupId: string): CompanyChoice[] {
  const owner = new Map<string, GroupLike>();
  for (const g of groups) for (const id of g.companyIds) owner.set(id, g);
  return companies
    .filter((c) => owner.get(c.id)?.id !== groupId)
    .map((c) => {
      const g = owner.get(c.id);
      return { id: c.id, name: c.name, inGroup: g ? { id: g.id, name: g.name, nameAr: g.nameAr ?? null } : null };
    })
    .sort((a, b) => Number(Boolean(a.inGroup)) - Number(Boolean(b.inGroup)) || a.name.localeCompare(b.name));
}

export interface AdminCandidate extends UserLike {
  /** False for a current admin who no longer belongs to any company of the group. */
  member: boolean;
}

/** People who can be group admins: everyone in a company of the group, plus current admins outside it. */
export function adminCandidates(users: UserLike[], group: Pick<GroupLike, 'companyIds' | 'adminUserIds'>): AdminCandidate[] {
  const companies = new Set(group.companyIds);
  const admins = new Set(group.adminUserIds);
  return users
    .map((u) => ({ ...u, member: u.companyIds.some((id) => companies.has(id)) }))
    .filter((u) => u.member || admins.has(u.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * People offered by the "Add administrator" search: candidates who are not
 * already administrators, matched on name or email. An empty query offers the
 * first few, so the box is useful before anything is typed.
 */
export function searchCandidates(
  candidates: AdminCandidate[],
  query: string,
  adminUserIds: string[],
  limit = 8,
): AdminCandidate[] {
  const admins = new Set(adminUserIds);
  const pool = candidates.filter((c) => !admins.has(c.id));
  const q = query.trim().toLowerCase();
  if (!q) return pool.slice(0, limit);
  return pool
    .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    .slice(0, limit);
}
