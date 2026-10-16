# Permissions 1a (foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One in-process permission engine that decides every route in every environment, with a hand-written catalogue, scopes (own/team/company/group), sensitive fields, roles with add-ons, holding groups, a single read filter, and screens that read the same permissions — while proving nobody's access changes on switch-over day.

**Architecture:** Evolve the tables TaskFlow already has (`permission_groups` = roles, `group_permissions`, `user_group_assignments`, `authz_version`) instead of starting over; a new `backend/src/authz/` holds catalogue, templates, evaluator, route registry and filters. Existing gate functions (`requireCompanyRoles`, `allowsRule`, `requireCompanyRule`, conversation deps) keep their call sites and consult the route registry + evaluator when `PERMISSIONS_ENGINE=v2`; `legacy` keeps today's answers; `shadow` logs disagreements. OpenFGA is removed.

**Tech Stack:** Express + better-sqlite3 (node:test + supertest), Next.js staff app (shadcn, `tr`), portal untouched except shared types.

**Spec:** `docs/superpowers/specs/2026-10-16-permissions-design.md`

## Global Constraints

- Nobody's access changes when 1a ships: the equivalence test (every declared route × every system template vs the legacy role list) must pass with zero differences; any intended difference is listed in the spec with the owner's reason (none in 1a).
- Engine setting `PERMISSIONS_ENGINE=legacy|shadow|v2` (default `legacy` until the shadow week passes); `AUTHZ_ENGINE` and OpenFGA removed.
- Scopes: `own` < `team` < `company` < `group`. Team = manager line from HR (`employees.managerId`, linked by `employees.userId`), any depth.
- One main role + any add-ons per person per company; union; nothing subtracts. Locks (module off, Academy, document status) apply after roles.
- Sensitive fields: `salary`, `personal_ids`, `bank_details`, `cost_prices`, `rate_cards`, `client_terms`; without view the server omits the field (key absent) and the UI shows "Hidden" / "مخفي".
- A refused request returns 403 `{ code: 'FORBIDDEN', permission: '<key>', message: '<en sentence naming who can grant it>' }`; the UI shows the sentence (translated client-side from the key) — never a bare "403".
- Holding group: one level; a company belongs to at most one group; group-wide assignments reach every company in the group, including ones added later.
- All UI copy en+ar via `tr(en, ar)`; RTL; phone width without horizontal scroll; Impeccable craft floor read before UI work. Simple first: level picker None / View / Edit / Full / Custom per area.

## Review Focus

1. A private contact / someone else's opportunity reaching a person outside scope through a side path: search, export, PDF, notification, push, dashboard, inbox alert (poison fixtures).
2. A route nobody declared (new code) — must fail the build test, never default to allowed.
3. A manager line with a cycle or an unlinked user — team scope must terminate and fall back to own.
4. A group-wide Owner added to a company created after the assignment — has access immediately.
5. A sensitive field (salary, IBAN, cost) present in any JSON response (lists, detail, exports, PDFs) for a role without it.

---

### Task 1: Catalogue v2 and system templates

**Files:**
- Create: `backend/src/authz/catalogue.ts`, `backend/src/authz/templates.ts`, `backend/src/authz/labels.ts` (en/ar)
- Test: `backend/test/authz-catalogue.test.js`

**Interfaces:**
- Produces: `type Scope = 'own'|'team'|'company'|'group'`; `interface AreaDef { key: string; label: {en,ar}; group: 'operations'|'finance'|'crm'|'hr'|'core'; actions: ActionDef[]; scopes?: Scope[] /* scoped actions only */ }`; `interface ActionDef { key: string; label: {en,ar}; scoped?: boolean; limit?: 'amount'|'percent' }`; `CATALOGUE: readonly AreaDef[]`; `permissionKey(area, action) → 'area.action'`; `SENSITIVE_FIELDS: readonly {key, label:{en,ar}, area}[]`; `TEMPLATE_KEYS = ['owner','admin','manager','accountant','employee'] as const`; `TEMPLATES: Record<TemplateKey, { label:{en,ar}; grants: Array<{ key: string; scope?: Scope; limit?: number }>; fields: Array<{ key: string; view: boolean; edit: boolean }> }>`.
- Areas (≈25; final list fixed in this task): dashboard, sales, purchasing, inventory, manufacturing, logistics (deliveries, shipments, returns), quality, invoices, vendor-bills, finance (journals, accounts, bank, budgets, fixed assets, reports), payroll, hr (employees, leave, attendance), crm (opportunities, proposals, follow-ups, vendor requests), contacts (clients, suppliers, contacts), influencers, campaigns, commissions, portal (portal access, client requests, catalogue/prices), discover, games, inbox (conversations), whatsapp, projects, tasks, documents, academy, settings (company settings, numbering, custom fields, approvals), people (users, roles, groups).
- Actions per area chosen so that every route's legacy role list is expressible: where routes in one area disagree on roles, split the action (e.g. `finance.settings` vs `finance.view`) with a human label — never a path-derived name.
- `owner` = `admin` grants with `group` scope where scoped; `admin`/`manager`/`accountant`/`employee` reproduce today's role behaviour including record rules (e.g. `crm.view` scope `company` for admin/manager/accountant, `own` for employee; `contacts.view_private` → modelled as scope on contacts view: admin/manager `company`, others `own`+public).

- [ ] **Step 1: Failing tests:** every catalogue key unique and `area.action` shaped; every label has non-empty en and ar; every template grant references a catalogue key and a scope the action supports; limits only on actions declaring `limit`; `owner` ⊇ `admin`.
- [ ] **Step 2:** Run `cd backend && npm run build && NODE_ENV=test node --test --require ./test/helpers/loopback.js test/authz-catalogue.test.js` → FAIL.
- [ ] **Step 3:** Write catalogue and templates (labels written for people: "Approve purchase orders", "اعتماد أوامر الشراء").
- [ ] **Step 4:** PASS. Commit `feat(authz): hand-written permission catalogue and system templates`.

### Task 2: Route registry — every route declared, legacy answers recorded

**Files:**
- Create: `backend/src/authz/route-registry.ts` (data: one entry per route across all route files), `backend/src/scripts/list-routes.ts` (enumerates the Express router of a built app), test `backend/test/authz-route-registry.test.js`
- Read: `docs/superpowers/plans/gate-matrix.csv` (legacy role lists for server.ts + routes/), and the gate code in `backend/src/{conversations,portal,discover,games,academy,social,workspace,push,routes}` for the rest.

**Interfaces:**
- Produces: `type RouteDecl = { method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'; path: string; permission: string /* catalogue key */ | 'public' | 'self' | 'super_admin' | 'portal' /* portal-session routes */ | 'per_record' /* decided by a record check, documented */ ; legacyRoles?: UserRole[] /* today's allow-list; absent when not role-gated */; note?: string }`; `ROUTES: readonly RouteDecl[]`; `routeDecl(method, path): RouteDecl | undefined`.
- Completeness: the test builds the app (`createServer` with test options), walks `app._router.stack` (and nested routers), and asserts every registered method+path has exactly one `RouteDecl` and every `RouteDecl` exists in the app.
- Equivalence: for every decl with `legacyRoles` and a catalogue `permission`, for each template in admin/manager/accountant/employee: `templateGrants(template, permission) === legacyRoles.includes(Role)`; differences printed as a table; must be zero.

- [ ] **Step 1:** Write `list-routes.ts` and the completeness + equivalence test (initially failing: registry empty).
- [ ] **Step 2:** Run → FAIL with the full list of undeclared routes.
- [ ] **Step 3:** Fill the registry: generate a draft from gate-matrix.csv (map old module/action → catalogue key by an explicit table in the script, not by string munging), then declare the remaining routes by reading each handler's gate. Adjust catalogue actions/templates (Task 1 files) where equivalence needs a split; keep labels human.
- [ ] **Step 4:** PASS (zero undeclared, zero differences). Full `npm test` green. Commit `feat(authz): every route declared with its permission`.

### Task 3: Schema — roles, scopes, fields, assignments, holding groups, shares, audit

**Files:**
- Modify: `backend/src/data/store.ts` (migration `136_authz_v2`; head currently `135`/`134` — read the last id and pin in `backend/test/api.test.js`), store methods in a new `backend/src/authz/authz-store.ts` mounted as `store.authz`
- Test: `backend/test/authz-schema.test.js`

**Interfaces:**
- Migration per spec §4 "Data": columns on `permission_groups` (`templateKey`, `holdingGroupId`), `group_permissions` (`scope`, `limitAmount`), new `role_fields`, `user_group_assignments` (`isMain`, `startsAt`, `endsAt`, `delegatedBy`, `reason`, `viaHoldingGroupId`), new `holding_groups`, `companies.holdingGroupId`, `holding_group_admins`, `holding_group_assignments`, `record_shares`, `permission_audit(id, companyId, holdingGroupId, actorUserId, entity, entityId, before JSON, after JSON, at)`.
- Data migration: for every company, system roles' grants rewritten to the catalogue keys from `TEMPLATES` (+ `role_fields`); custom (non-system) groups' old `module:action` grants mapped through the Task 2 old→new table into add-on roles; each user's `companyRoles[].role` becomes an `isMain=1` assignment to the matching system role (existing extra group assignments become `isMain=0`). Idempotent; a re-run changes nothing.
- `store.authz`: `listRoles(companyId)`, `getRole(id)`, `saveRole(companyId, input, actorId)`, `deleteRole(id, actorId)`, `assignments(userId, companyId)`, `setAssignments(userId, companyId, {mainRoleId, addOnRoleIds}, actorId)`, `holdingGroups()`, `createHoldingGroup`, `attachCompany`, `detachCompany`, `setHoldingAdmins`, `holdingAssignments(holdingGroupId)`, `setHoldingAssignment(...)`, `shares(area, recordId)`, `share/unshare`, `audit(...)`. Every write bumps `authz_version` and writes `permission_audit`.

- [ ] **Step 1: Failing tests:** migration on a DB seeded with today's shapes (four roles, a custom group with old keys, users with companyRoles) yields main assignments and template grants; re-run is a no-op; audit rows written on writes; version bumps.
- [ ] **Step 2–4:** FAIL → implement → PASS; full suite green.
- [ ] **Step 5:** Commit `feat(authz): roles, assignments, holding groups and audit schema`.

### Task 4: Evaluator — effective permissions, can(), team line

**Files:**
- Create: `backend/src/authz/evaluate.ts`, `backend/src/authz/team.ts`, `backend/src/authz/can.ts`
- Test: `backend/test/authz-evaluate.test.js`

**Interfaces:**
- `effective(store, userId): Effective` where `Effective = { userId; byCompany: Map<companyId, { grants: Map<key, { scope?: Scope; limit?: number; sources: Source[] }>; fields: Map<fieldKey, {view: boolean; edit: boolean; sources: Source[]}> }> }`, `Source = { kind: 'main'|'addon'|'holding'|'temporary'; roleId; roleName; until?: string }`. Union rules: widest scope wins; highest limit wins (null = unlimited beats any number); field view/edit OR. Active assignments only (`startsAt ≤ now < endsAt`). Holding assignments expand to every company whose `holdingGroupId` matches. Locks applied: modules switched off remove that area's grants; Academy locks as today.
- Cache keyed by userId + `authz_version`, max 500 users (like today's PermissionService).
- `teamOf(store, companyId, userId): Set<userId>` — the user plus everyone below them via `employees.managerId`/`employees.userId`; cycle-safe; cached per company with invalidation on employee writes.
- `can(eff, key, { companyId, ownerUserId?, sharedWith?: string[], amount? }): { allowed: boolean; reason?: 'no_permission'|'out_of_scope'|'over_limit' }`.
- `scopeOf(eff, key, companyId): Scope | null`.

- [ ] **Step 1: Failing tests:** union and widest-scope; limit max; expired temporary assignment ignored; holding assignment reaches a company attached after the assignment; module off removes grants; team line 3 levels deep, cycle terminates, unlinked user → only self; cache invalidates on version bump.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(authz): in-process evaluator with team scope and holding groups`.

### Task 5: Engine switch — gates consult the registry and evaluator

**Files:**
- Modify: `backend/src/server.ts` (gate functions `requireCompanyRoles`, `allowsRule`, `requireCompanyRule`, auth middleware, `/auth/permissions`), conversation/portal deps that call permission helpers, `store.listUserIdsWithPermission` (uses `effective`), `backend/src/permissions/record-rules.ts` (each rule maps to a catalogue key + minimum scope), `ops.ts` env docs
- Create: `backend/src/authz/engine.ts`
- Test: `backend/test/authz-engine.test.js`

**Interfaces:**
- `PERMISSIONS_ENGINE` read once; `legacy` → today's role answers (OpenFGA branch deleted); `shadow` → legacy decides, `v2` computed and disagreements written to `authz_divergence` (route, user, company, legacy, new); `v2` → `can()` on the route's declared permission decides; record rules → `scopeOf(...)` ≥ the rule's minimum scope.
- 403 body per Global Constraints (`permission` = the declared key; message names the roles in that company whose role grants it, e.g. "Ask an Admin or Manager.").
- Undeclared route under `v2` → 403 + error log (never allow).

- [ ] **Step 1: Failing tests:** for a sample of 40 routes across areas, the three engines answer identically for the four templates; shadow writes a divergence when a custom add-on grants something legacy doesn't; v2 honours add-on; undeclared route refused; 403 body shape.
- [ ] **Step 2–4:** FAIL → implement → PASS; full suite green under each engine (`PERMISSIONS_ENGINE=v2 npm test` and default).
- [ ] **Step 5:** Commit `feat(authz): one engine setting with shadow mode`.

### Task 6: One read filter — visible() on every read path of scoped areas

**Files:**
- Create: `backend/src/authz/visible.ts`
- Modify: list/search/export/PDF/notification/push/dashboard paths for scoped areas — contacts (private), crm (opportunities, proposals, follow-ups, vendor requests), campaigns, commissions, projects, tasks, whatsapp chats, inbox conversations; `backend/src/routes/search.ts`; CSV/PDF exports; conversation alert recipients; dashboard figures
- Test: `backend/test/authz-visible.test.js`

**Interfaces:**
- `visible(eff, area, companyId, { ownerColumn = 'ownerUserId', alias? }): { sql: string; params: unknown[] }` — `1=1` for company/group, `(owner IN (team) OR id IN shares)` for team, `(owner = me OR id IN shares)` for own; area-specific extras declared in one table (contacts: non-private visible to all with view; projects: Public or member; tasks: assigned or visible project).
- Applied in SQL (not post-filter) so pagination and counts are right.

- [ ] **Step 1: Failing tests (poison fixtures):** an Employee with own scope never receives a colleague's private contact / opportunity text via list, search, export, PDF, notification body, inbox alert, dashboard total; a Manager with team scope sees their reports' records 2 levels down and not a peer's; counts/pagination match the visible set.
- [ ] **Step 2–4:** FAIL → implement → PASS (under `v2`; legacy mode maps roles to the same scopes so behaviour is identical).
- [ ] **Step 5:** Commit `feat(authz): one visibility filter on every read path`.

### Task 7: Sensitive fields — mask() everywhere they leave

**Files:**
- Create: `backend/src/authz/mask.ts` (field map: which entity properties belong to which sensitive key)
- Modify: employee, payroll, payslip, contact/supplier/client (bank, pricing profiles, credit limit), influencer (rate card), inventory item (cost, margin, landed cost), PO/bill lines cost views as listed in the field map; their exports and PDFs; replace `PAYROLL_PAY_READ` and `CONTACTS_PRICING_READ` checks
- Test: `backend/test/authz-mask.test.js`

**Interfaces:**
- `mask(eff, companyId, entity: 'employee'|'payslip'|'contact'|'item'|..., row): row` — deletes keys; `canEditField(eff, companyId, fieldKey)` for writes (write of a hidden field → 403 with the field's key).
- Self-exception kept: a person sees their own salary and IDs.

- [ ] **Step 1: Failing tests:** for each sensitive key, a role without it gets JSON without the property on list, detail, export and PDF text; with view but not edit, a PUT changing it → 403; own payslip visible.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(authz): sensitive fields hidden wherever they leave`.

### Task 8: Holding groups API

**Files:**
- Create: `backend/src/authz/holding-routes.ts` (mounted in server.ts, declared in the registry)
- Test: `backend/test/authz-holding.test.js`

**Interfaces:**
- Super admin: `POST /holding-groups {name, nameAr}`, `PUT /holding-groups/:id`, `POST /holding-groups/:id/companies {companyId}`, `DELETE /holding-groups/:id/companies/:companyId`.
- Group admins (or super admin): `GET /holding-groups/:id` (companies, admins, assignments, templates), `PUT /holding-groups/:id/admins {userIds}`, `PUT /holding-groups/:id/assignments/:userId {roleKey, addOnKeys[], startsAt?, endsAt?}` (roleKey from the group's template library; materialises/updates the matching role in each company, read-only to company admins), `GET/PUT /holding-groups/:id/templates/:key` (edit a group template; "push to companies using it unchanged" = `POST …/templates/:key/push` → updates roles whose grants equal the previous template version, reports the rest).
- A company's roles screen shows group-materialised roles as read-only.

- [ ] **Step 1: Failing tests:** attach company → existing group assignment applies there immediately; group admin of group A cannot touch group B or a company outside; push updates unchanged copies only; company admin cannot edit a group role (403).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(authz): holding groups with group-wide people and templates`.

### Task 9: Roles, people and my-permissions API

**Files:**
- Create: `backend/src/authz/routes.ts` (replaces `backend/src/permissions/routes.ts`)
- Test: `backend/test/authz-api.test.js`

**Interfaces:**
- `GET /me/permissions?companyId=` → `{ engine, version, companyId, grants: Array<{key, scope?, limit?}>, fields: Array<{key, view, edit}>, disabledModules }` (under legacy/shadow the server sends the legacy-equivalent grants so the UI never guesses).
- `GET /permissions/catalogue` → areas/actions/scopes/limits/sensitive fields with en/ar labels and the level presets (None/View/Edit/Full per area = which actions each level means).
- `GET /companies/:companyId/roles` (with people count), `GET/POST/PUT/DELETE /companies/:companyId/roles/:id` (body: `{ name, nameAr, description, grants[], fields[] }`; system/group roles not deletable; group roles read-only), `POST /companies/:companyId/roles/:id/duplicate`.
- `GET /companies/:companyId/people` → `[{ userId, name, email, mainRole, addOns[], temporary[], linkedToHr: boolean, summary: string[] /* en/ar lines */ }]`; `GET /companies/:companyId/people/:userId` → effective grants with sources ("why"); `PUT /companies/:companyId/people/:userId/roles {mainRoleId, addOnRoleIds}`.
- Gates: `people.manage` / `people.view` from the catalogue; nobody can assign a role containing a grant they don't hold (simple version of no-self-granting — 1b extends it).

- [ ] **Step 1–4:** tests for each endpoint incl. read-only group roles and the no-higher-than-me check → implement → PASS.
- [ ] **Step 5:** Commit `feat(authz): roles, people and my-permissions API`.

### Task 10: Staff frontend reads the server's permissions

**Files:**
- Modify: `frontend/src/context/permissions-context.tsx` (v2 shape: `can(key, {scope?})`, `field(key) → {view, edit}`), the 36 files using `usePermissionOr` and the 17 files comparing roles (find with grep), `frontend/src/modules/layout/lib/nav-permissions.ts` (new keys), `frontend/src/lib/api-client.ts` (403 body → toast with translated sentence), `frontend/src/services/permissionService.ts`
- Test: `frontend/src/context/permissions-context.test.ts` (or nearest test location used by the repo)

- [ ] **Step 1:** Replace every role guess with `can(...)`; delete `usePermissionOr`'s fallback path; hidden fields render "Hidden" / "مخفي".
- [ ] **Step 2:** `cd frontend && npm test && npx tsc --noEmit -p .` + eslint → clean; grep proves no `currentRole ===`/`role === 'Admin'` gating remains in modules (allow the People screen's display of role names).
- [ ] **Step 3:** Commit `feat(authz): the staff app follows the server's permissions`.

### Task 11: People, Roles and Group screens

**Files:**
- Create: `frontend/src/modules/authz/components/{people-page,person-page,roles-page,role-editor,group-page}.tsx`, routes under `frontend/src/app/(app)/settings/{people,roles,group}`
- Remove: `frontend/src/modules/permissions/components/permissions-page.tsx`, `frontend/src/modules/users/components/user-groups-sheet.tsx` (redirect `/settings/permissions` → `/settings/roles`)

- [ ] **Step 1:** Read Impeccable craft floor. Build per spec §5: People list (main role, add-on chips, ⚠ unlinked), person page (plain-language summary with "why", role pickers), Roles cards ("Accountant · 4 people"), role editor (one row per area: None/View/Edit/Full/Custom; scope picker only where supported; Custom reveals actions and limit inputs; Sensitive information switches), Group page (companies, group-wide people, templates with Push). Read-only states for group roles. en/ar, RTL, 375 px.
- [ ] **Step 2:** frontend tests/tsc/eslint clean; browser check en/ar desktop + phone.
- [ ] **Step 3:** Commit `feat(authz): people, roles and group screens`.

### Task 12: Remove OpenFGA and the old permission layer

**Files:**
- Delete: `backend/src/permissions/{fga-client,fga-model,outbox,shadow,sync,tuples,permission-service}.ts`, `backend/docker-compose.fga.yml`, OpenFGA ops commands, `@openfga/sdk` dependency (npm 10 lockfile), extract-gates script + gate-matrix (registry replaces them), old tests for those
- Modify: `DEPLOY.md`, `deploy/staging/*` (drop AUTHZ_ENGINE/FGA vars; add `PERMISSIONS_ENGINE`), `backend/.env.production.example`

- [ ] **Step 1:** Remove; full backend suite green under `legacy` and `v2`.
- [ ] **Step 2:** Commit `chore(authz): remove OpenFGA`.

### Task 13: Verification

- [ ] **Step 1:** All suites + typechecks; equivalence table zero differences; `PERMISSIONS_ENGINE=v2 npm test` green.
- [ ] **Step 2:** Mutation checks: make `visible` return `1=1` → Task 6 poison tests fail; drop one `mask` key → Task 7 fails; let an undeclared route through → Task 2/5 fails; make team ignore depth → Task 4 fails.
- [ ] **Step 3:** Browser (local): People, person "why", role editor save, group page, a refused action's message, en/ar, 375 px.
- [ ] **Step 4:** Record the deploy plan in the spec: deploy with `shadow`, watch `authz_divergence` for a week, switch to `v2`; owner approves the switch.
