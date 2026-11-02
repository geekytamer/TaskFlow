# Company tree (stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A group is a company: companies get a parent, the group company is a full company with its own records, and opening it shows the whole group (dashboard, tasks, projects) with a scope toggle and company filter.

**Architecture:** `companies.parentCompanyId` is the source of truth. Each top company with children keeps exactly one holding group (`holding_groups.companyId`) in sync, so v2's group-wide roles, templates and group admins keep working unchanged and now also reach the group company. Tree reads are engine-agnostic: the subtree ∩ the companies the viewer can access, then the existing per-company rule.

**Tech Stack:** Express + better-sqlite3 (backend, `node --test` on `dist/`), Next.js 15 + React (frontend, `node --import tsx --test`).

**Spec:** `docs/superpowers/specs/2026-11-02-group-as-company-design.md` (stage 1).

## Global Constraints

- Migration id `154_company_tree`, after `153_authz_divergence_kind`. It must be idempotent: re-running it changes nothing.
- No existing person gains or loses access in any existing company, under `legacy`, `shadow` or `v2`.
- Never add two currencies together (roll-up rules from `holding-rollup.ts` stay).
- A training (Academy practice) company can't be a parent or a child.
- Bilingual copy: every new string uses `tr(en, ar)` or `t()`.
- Deploy target is production (owner, 2026-11-02), engine `shadow`; v2 needs the owner's written approval (permissions spec §10).

## Review Focus

- **A cycle** (making A the parent of its own ancestor): it's refused with 400, and nothing changes.
- **A viewer who can open the group company but not one child**: the child is named in `missing` and its figures aren't counted.
- **A child already in another holding group being given a new parent**: the move goes through, and its v2 group-wide access follows the new top. Test: the old group's group-wide person loses access, the new group's person gains it.
- **A remembered scope or filter naming a company the person can no longer see**: it's dropped quietly on load, with no blank page. Test in the frontend pure helper `scopeCompanyIds`.
- **Removing the last child**: the parent stops being a group (no toggle) and its holding group is emptied, but kept so templates survive.

---

### Task 1: The tree in the database

**Files:**
- Create: `backend/src/companies/tree.ts`
- Modify: `backend/src/types.ts` (`Company.parentCompanyId?: string`), `backend/src/data/store.ts` (migration list; `mapCompanyRow`)
- Test: `backend/test/company-tree.test.js`

**Interfaces:**
- Produces: `subtreeIds(companies: Array<{id: string; parentCompanyId?: string | null}>, rootId: string): string[]` (root first, then descendants breadth-first); `topOf(companies, id): string`; `wouldCycle(companies, childId, parentId): boolean`; `childIds(companies, id): string[]`.
- Migration `154_company_tree`: adds `companies.parentCompanyId TEXT` and `holding_groups.companyId TEXT`. For each holding group without `companyId`, it creates a company named after the group, sets that company's `holdingGroupId` to the group, sets each member company's `parentCompanyId` to it, and gives Admin membership in the new company to the group's admins plus everyone who is Admin in every member company. The group company's currency is copied when all members share one.

- [ ] Step 1: Tests: `subtreeIds` on a 3-level tree; `wouldCycle(A, parent = grandchild of A)` is true; the migration on a store with one holding group of 2 companies creates exactly one company, sets both parents, makes the holding group's `companyId` that company, and running the migration code twice leaves exactly one.
- [ ] Step 2: Run `cd backend && npm run build && node --test test/company-tree.test.js`. Expected: FAIL.
- [ ] Step 3: Implement `tree.ts` and the migration.
- [ ] Step 4: Run again. Expected: PASS.
- [ ] Step 5: Commit `feat(companies): a company can have a parent`.

### Task 2: Moving companies in the tree

**Files:**
- Modify: `backend/src/data/store.ts` (`setCompanyParent`, `createGroupCompany`), `backend/src/authz/authz-store.ts` (`holdingGroupForCompany(companyId): string | null`, `ensureHoldingGroupFor(topCompanyId, actorId): string`), `backend/src/authz/holding-routes.ts` (create/attach/detach go through the store), `backend/src/routes/admin.ts` (`PUT /companies/:companyId/parent`, super admin), `backend/src/authz/route-registry.ts`
- Test: `backend/test/company-tree.test.js`

**Interfaces:**
- Produces: `store.setCompanyParent(childId: string, parentId: string | null, actorId: string | null): Company`. It refuses (400) a cycle, self-parenting, a training company or an unknown id. It then sets the parent and re-syncs holding groups: every company in the top's subtree, the top included, is attached to the top's holding group; the moved subtree is detached from any other group first. With `parentId = null`, the child becomes its own top, and if it still has children it gets its own holding group.
- `store.createGroupCompany(name: string, actorId: string): Company`: a company plus its holding group, with the actor as Admin.
- `POST /holding-groups` now calls `createGroupCompany` and returns the group with `companyId`. Attaching a company to a group calls `setCompanyParent(company, group.companyId)`; detaching calls `setCompanyParent(company, null)`.
- `PUT /companies/:companyId/parent` takes `{ parentCompanyId: string | null }`, is super admin only, and returns the company.

- [ ] Step 1: Tests: a cycle gives 400 and no change; a training company gives 400; under v2, a group-wide person reaches the group company and both children; moving a child to another tree moves that access (Review Focus 3); removing the last child leaves no children and an empty but surviving holding group; **access parity**: snapshot `effectiveCompanies` for every seeded user under `legacy` and `v2` before and after creating a group of two existing companies — identical for every existing company.
- [ ] Step 2: Build and run. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run it, plus `node --test test/authz-holding*.test.js`. Expected: PASS.
- [ ] Step 5: Commit `feat(companies): move companies in the tree; holding groups follow it`.

### Task 3: The group dashboard from the company

**Files:**
- Modify: `backend/src/authz/holding-routes.ts` (extract `groupDashboard(req, groupCompanyId, companyIds | null)`), `backend/src/server.ts` (`GET /companies/:companyId/dashboard?scope=tree&companyIds=`), `backend/src/authz/route-registry.ts`
- Test: `backend/test/authz-holding-rollup.test.js`

**Interfaces:**
- Consumes: `subtreeIds` (Task 1).
- Produces: `GET /companies/:companyId/dashboard?scope=tree` returns the `GroupDashboard` shape already used by `/holding-groups/:id/dashboard`. Its parts are the subtree ∩ the viewer's accessible companies (group company first), and inaccessible or not-permitted companies go in `missing`. `?companyIds=` only narrows. Without `scope=tree`, the response is unchanged.

- [ ] Step 1: Tests: under `legacy` and `v2`, an Admin of the group company and both children gets open tasks equal to the sum of the three; a viewer missing one child sees that child in `missing` (Review Focus 2); `companyIds` naming a company outside the subtree is ignored.
- [ ] Step 2: Run. Expected: FAIL.
- [ ] Step 3: Implement. `/holding-groups/:id/dashboard` delegates to `groupDashboard` for the group's company.
- [ ] Step 4: Run. Expected: PASS.
- [ ] Step 5: Commit `feat(groups): the group company's dashboard covers its tree`.

### Task 4: Scope in the app

**Files:**
- Create: `frontend/src/lib/company-tree.ts` (and `.test.ts`), `frontend/src/context/company-scope-context.tsx`
- Delete: `frontend/src/context/group-scope-context.tsx`
- Modify: `frontend/src/providers.tsx`, the frontend `Company` type (`parentCompanyId?: string`), `frontend/src/services/dashboardService.ts` (`getGroupDashboardPayload(companyId, companyIds)` calls the Task 3 route)

**Interfaces:**
- Produces: `useCompanyScope(): { isGroup: boolean; scope: 'tree' | 'self'; setScope(s): void; companyIds: string[]; treeCompanyIds: string[]; filter: string[]; setFilter(ids): void; companyName(id): string }`. `isGroup` is true when the selected company has children among the person's companies. `companyIds` is `[selected]` in `self` mode and filter-or-tree in `tree` mode. Scope and filter are remembered per company in localStorage (`taskflow_scope_<companyId>`, `taskflow_scope_filter_<companyId>`).
- Pure: `scopeCompanyIds(companies, selectedId, scope, savedFilter): string[]` drops saved ids outside the tree (Review Focus 4).

- [ ] Step 1: Tests for `subtree` and `scopeCompanyIds`, including stale saved ids and a company with no children (= `[selected]`).
- [ ] Step 2: Run `cd frontend && node --import tsx --test src/lib/company-tree.test.ts`. Expected: FAIL.
- [ ] Step 3: Implement; replace every `useGroupScope` call (dashboard, tasks, projects, task-list, project-list, sidebar, switcher, group-overview, group-company-filter).
- [ ] Step 4: Run the tests plus `npx tsc --noEmit`. Expected: PASS.
- [ ] Step 5: Commit `feat(app): the selected company carries its scope`.

### Task 5: The tree in the UI

**Files:**
- Modify: `frontend/src/modules/companies/components/company-switcher.tsx` (tree: groups with children indented; no separate Groups section), `frontend/src/modules/groups/components/group-company-filter.tsx` → `scope-bar.tsx` (toggle "Whole group / This company only" plus the filter, hidden unless `isGroup`), `dashboard.tsx` (tree → `GroupOverview`), `tasks-page.tsx`, `projects-page.tsx` (create hidden only in tree mode), `sidebar-nav.tsx` (drop `GROUP_PAGES` hiding), app layout (a notice on pages that aren't yet group-aware while in tree mode: "Showing {group}'s own records. Whole-group view for this page comes next."), `admin-groups.tsx` (show and open the group's company)

- [ ] Step 1: Browser, on a scratch copy of production data: create a group of two companies in /admin. Then check that the switcher shows the tree; the dashboard rolls up 3 companies; the toggle switches to the group's own dashboard; tasks and projects in tree mode show the Company column; Finance shows the notice and the group's own records; Arabic labels display correctly.
- [ ] Step 2: `npm run lint`, `npx tsc --noEmit`, `npm test`. Expected: 0 errors, all pass.
- [ ] Step 3: Commit `feat(app): open a group like a company`.

### Task 6: Ship to production

- [ ] Step 1: Full backend suite under `legacy`, `shadow` and `v2`; frontend tests, lint and `next build`.
- [ ] Step 2: Whole-branch review (superpowers:requesting-code-review); fix findings.
- [ ] Step 3: PR `feature/permissions-v2` → master (it carries permissions v2 too), merge.
- [ ] Step 4: `/root/deploy-pr21.sh`, copied from pr20: sqlite3 `.backup`, set `PERMISSIONS_ENGINE=shadow`, backend dist swap, frontend `.next` swap, pm2 restart, `npm run ops -- authz:repair`, then check that the user and company counts are unchanged and the startup line says `shadow`. Record the rollback commit.
- [ ] Step 5: Update memory (deploy, permissions rebuild) and this plan's checkboxes.
