# OpenFGA Permissions — Design

Date: 2026-08-24
Branch: `feature/openfga-permissions`
Status: Approved design, not yet implemented

## 1. Problem

TaskFlow's authorization is four hardcoded roles — `Admin`, `Manager`,
`Employee`, `Accountant` — declared in `backend/src/types.ts` and enforced
through 234 `requireCompanyRoles(...)` call sites across the 8,162 lines of
`backend/src/server.ts`. The frontend reimplements the same rules a second
time, as literal `roles: [...]` arrays in
`frontend/src/modules/layout/components/sidebar-nav.tsx` and scattered
`canManage*` helpers.

Two consequences:

1. **Nothing is configurable.** A company that wants a "Warehouse Clerk" who
   can receive stock but not view margins has no way to express that. Every
   permission change is a code change and a deploy.
2. **The rules live in two places and drift.** Backend and frontend copies of
   the same rule are kept in sync by hand.

The goal is Odoo-style permission administration: per-company groups that
grant rights per module and action, editable by an admin at runtime, with
OpenFGA as the decision engine.

## 2. Goals

- Per-company permission groups, admin-editable, with inheritance between them.
- Grants expressed as (module x action), covering CRUD plus named non-CRUD
  actions such as "post journal entry" or "approve purchase order".
- OpenFGA is the authoritative decision point at runtime.
- **No user loses access and no data is re-entered.** Existing roles and
  assignments are preserved and mechanically reproduced.
- The frontend stops holding its own copy of the rules.

## 3. Non-goals

Explicitly out of scope for this project:

- **Record-level rules** ("salesperson sees only their own opportunities").
  The existing record logic — `canViewProject`, `canViewTask`, and the
  `visibility` / `memberIds` / `isPrivate` / `ownerId` fields — is left exactly
  as it is. This is the natural next project and the main reason OpenFGA is
  worth adopting, but it is not this project.
- **Field-level visibility** (hiding cost price, salary). OpenFGA does not do
  this natively.
- **Ad-hoc per-record sharing.**
- **Authentication changes.** Login, tokens, and password handling are
  untouched. See section 16.

## 4. Decisions

| Decision | Rationale |
| --- | --- |
| SQL is the source of truth; OpenFGA holds a projection | The admin UI must *enumerate* groups and grants. Zanzibar-style stores serve point checks, not enumeration. |
| Grants are additive-only; no deny rows | Matches Odoo's `ir.model.access` union semantics. Deny rules require precedence UI that admins reliably get wrong. |
| The four existing roles become seeded, editable, undeletable groups | Preserves current behaviour exactly, and gives admins a working starting point rather than a blank matrix. |
| `users.role` and `users.companyRoles` are never dropped | The old system stays intact and functional throughout. This is the mechanism behind "no data loss", not a promise about it. |
| The permission catalogue lives in code, not the DB | If admins could invent permissions, they would create ones no route enforces, and the UI would promise security it does not deliver. The DB stores grants; code owns what is grantable. |
| No `sql` decision adapter | Committed fully to OpenFGA. Rollback is `AUTHZ_ENGINE=legacy`, not a half-migrated middle state. |
| Fail closed as `503`, never `403`, never open | A `403` would tell users they lack permissions they actually hold. |

## 5. Data model

Four tables, added through the existing `schema_migrations` framework in
`backend/src/data/store.ts` (the ordered `{ id, run }` list at line 714).

```sql
CREATE TABLE permission_groups (
  id          TEXT PRIMARY KEY,
  companyId   TEXT NOT NULL,
  key         TEXT NOT NULL,          -- stable slug: 'admin', 'warehouse-clerk'
  name        TEXT NOT NULL,
  nameAr      TEXT,
  description TEXT,
  isSystem    INTEGER NOT NULL DEFAULT 0,
  isActive    INTEGER NOT NULL DEFAULT 1,
  createdAt   TEXT NOT NULL,
  UNIQUE (companyId, key)
);

CREATE TABLE group_implications (     -- Odoo's implied_ids
  parentGroupId TEXT NOT NULL,
  childGroupId  TEXT NOT NULL,
  PRIMARY KEY (parentGroupId, childGroupId)
);

CREATE TABLE group_permissions (      -- row present = granted
  groupId TEXT NOT NULL,
  module  TEXT NOT NULL,
  action  TEXT NOT NULL,
  PRIMARY KEY (groupId, module, action)
);

CREATE TABLE user_group_assignments (
  userId    TEXT NOT NULL,
  companyId TEXT NOT NULL,
  groupId   TEXT NOT NULL,
  PRIMARY KEY (userId, companyId, groupId)
);

CREATE TABLE authz_version (          -- single row; cache invalidation counter
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);

CREATE TABLE fga_outbox (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  op        TEXT NOT NULL,            -- 'write' | 'delete'
  tuple     TEXT NOT NULL,            -- JSON
  createdAt TEXT NOT NULL,
  attempts  INTEGER NOT NULL DEFAULT 0,
  lastError TEXT
);

CREATE TABLE authz_divergence (       -- shadow-mode findings
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  userId     TEXT NOT NULL,
  companyId  TEXT NOT NULL,
  module     TEXT NOT NULL,
  action     TEXT NOT NULL,
  route      TEXT NOT NULL,
  legacyAllowed  INTEGER NOT NULL,
  openfgaAllowed INTEGER NOT NULL,
  observedAt TEXT NOT NULL
);
```

`nameAr` exists because the app is en/ar bilingual, and admin-created group
names cannot live in the static `t()` dictionary.

## 6. Permission catalogue

`backend/src/permissions/catalogue.ts` — the canonical list of modules, the
actions each supports, and i18n label keys.

The catalogue is **generated from the existing code, not hand-authored.** A
one-off extraction script parses `server.ts`, pairing each route with its
`requireCompanyRoles(...)` argument, and emits a reviewable table:

```
route                                      module      action   currentRoles
POST /companies/:companyId/invoices        invoices    create   Admin, Manager, Accountant
POST /invoices/:id/payments                invoices    pay      Admin, Manager, Accountant
...
```

This yields three things at once: a module list grounded in what the code
actually does, the set of named non-CRUD actions, and the exact seed matrix for
the four built-in groups. **A human reviews this table before anything is
generated from it.**

Three gates stay outside the group system permanently:

- `requireSuperAdmin` — platform-level; must never be grantable by a customer admin.
- `requireCompanyAccess` — tenancy, not permission.
- `canViewProject` / `canViewTask` — record-level; see non-goals.

## 7. OpenFGA authorization model

```
model
  schema 1.1

type user

type group
  relations
    define direct_member: [user]
    define implied_by:    [group]
    define member:        direct_member or member from implied_by

type company
  relations
    define super_admin: [user]

type permission
  relations
    define owner:   [company]
    define granted: [group#member] or super_admin from owner
```

Objects are keyed `permission:<companyId>/<module>/<action>`, for example
`permission:c-7f3a/invoices/create`. `/` is used as the separator because
OpenFGA's own documentation demonstrates it inside object ids
(`repository:auth0/express-jwt`); whether `:` is legal inside the id portion is
not documented, so it is avoided.

Tuples written:

| Source | Tuple |
| --- | --- |
| `user_group_assignments` | `user:<userId>` — `direct_member` — `group:<groupId>` |
| `group_implications` | `group:<parentId>` — `implied_by` — `group:<childId>` |
| `group_permissions` | `group:<groupId>#member` — `granted` — `permission:<companyId>/<module>/<action>` |
| company scoping | `company:<companyId>` — `owner` — `permission:<companyId>/<module>/<action>` |
| `users.isSuperAdmin` | `user:<userId>` — `super_admin` — `company:<companyId>` |

The `super_admin` tuples exist so platform staff pass ordinary permission
checks without being assigned to every company's groups. This is distinct from
`requireSuperAdmin`, which remains a separate hard gate on `/admin/*` routes and
is never expressible as a grant.

Group ids are already company-scoped, so no additional tenancy relation is
needed on `group`.

`implied_by` is Odoo's `implied_ids` inverted for graph traversal: the tuple
`group:sales-user#implied_by@group:sales-manager` means every member of Sales
Manager is transitively a member of Sales User and inherits its grants.

The model does **not** change when modules or actions are added — those are new
object ids, not new types. Adding record rules later is a model change, but
OpenFGA models are immutable and versioned, so that is a new model id rather
than a migration.

## 8. Consistency between SQLite and OpenFGA

The two stores cannot share a transaction. Therefore:

- **Transactional outbox.** Group, grant, and assignment writes append their
  tuple deltas to `fga_outbox` inside the same `better-sqlite3` transaction as
  the SQL change. A drain loop flushes with backoff. A mid-write crash loses
  nothing.
- **Reconciler.** `npm run ops -- fga:sync` reads all tuples back from OpenFGA,
  diffs against the set derived from SQL, and writes the delta. Idempotent and
  safe to run at any time. This is the recovery path if OpenFGA's datastore is
  ever restored from a stale backup.

## 9. Runtime and caching

A naive integration would add a network hop to code paths that are currently
in-process SQLite reads measured in microseconds. Instead:

1. On each authenticated request, resolve the user's entire permission set for
   the active company with a single
   `ListObjects(user:<id>, granted, permission)`, filtered to the company.
2. Hold it in an in-process cache keyed `userId:companyId`.
3. Every subsequent `requirePermission(req, companyId, module, action)` in that
   request is a set lookup — no network.

Invalidation uses the `authz_version` counter, bumped on any group, grant, or
assignment change. Each request reads that counter from local SQLite
(microseconds, same process) and flushes if it moved. Under pm2 cluster mode
each worker holds its own cache but all read the same counter, so they
invalidate in lockstep.

Steady state: **zero OpenFGA calls per request.** Cold cache or post-change: one.

The admin UI renders effective permissions, including inherited ones, by
reading the SQL tables directly with a recursive CTE over `group_implications`.
That is a **read model for display only**. Authorization decisions come solely
from OpenFGA. This boundary must stay explicit in the code so a later
"optimisation" does not turn a permission check into a display-path read.

## 10. Failure behaviour

| OpenFGA | Cache | Behaviour |
| --- | --- | --- |
| Up | any | Normal |
| Down | warm | Serve from cache, log warning, surface health alert |
| Down | cold | `503 Service Unavailable` |

Never fails open. Never returns `403` for an infrastructure failure.

## 11. Adapter seam

`PermissionService`, selected by the `AUTHZ_ENGINE` env var:

- `legacy` — today's `requireCompanyRoles` logic, unchanged. The rollback target.
- `shadow` — evaluates both, **honours legacy**, logs divergences to `authz_divergence`.
- `openfga` — OpenFGA authoritative.

Rollback at any point is one env var and a restart, with no data migration to
reverse.

## 12. Admin UI — `/settings/users-and-groups`

A single surface mirroring Odoo's *Settings → Users & Companies*.

**Groups tab.** Per-company list with live member counts. The editor provides
name (en/ar), description, an "inherits from" picker, and the grant matrix:
modules down the left grouped by the existing sidebar sections (Operations,
Finance, CRM, HR, Core), actions across the top.

Inherited grants render as a grey check, visually distinct from a direct blue
check, with a hover explaining *"granted via Sales Manager"*. Odoo makes users
guess why a right is held; this is a deliberate improvement on it.

**Users tab.** The single-role dropdown becomes a per-company group
multi-select. During shadow mode the legacy role is shown read-only alongside.

**Guardrails**, enforced server-side and not only in the UI:

- A company must always retain at least one user holding both `users:write`
  and `settings:write`.
- A user cannot strip their own last admin-granting group.
- Deleting a group that has members requires explicit reassignment.

Without these, one careless click locks a company out of its own settings with
no recovery short of DB surgery.

## 13. Frontend

`GET /auth/permissions?companyId=` returns
`{ version, permissions: ["invoices:read", ...] }`.

A `PermissionsProvider` holds it; `usePermission('invoices', 'read')` reads it;
`version` drives refetch on staleness.

`sidebar-nav.tsx` changes from `roles: ['Admin','Manager','Accountant']` to
`permission: 'invoices:read'`. The `canManage*` helpers in
`frontend/src/modules/projects/lib/access.ts` and elsewhere collapse into
permission checks.

After this the frontend holds no rules of its own — it renders what the server
reports. This removes the backend/frontend drift bug class.

## 14. Migration and backfill

A single additive, idempotent migration:

1. For each company, seed the four built-in groups with `isSystem = 1`.
2. Populate `group_permissions` from the reviewed phase-1 extraction matrix.
3. For each user, for each entry in `companyRoles`, insert a
   `user_group_assignments` row. For legacy rows without `companyRoles`, fall
   back to `companyIds x users.role` — the same fallback `getEffectiveRole`
   already implements in `backend/src/http.ts`.
4. Initialise `authz_version` to 1.
5. Enqueue the full tuple set to `fga_outbox`.

Nothing is deleted, nothing is rewritten, and `users.role` / `users.companyRoles`
remain authoritative until phase 7.

## 15. Rollout

| Phase | Work | Gate to proceed |
| --- | --- | --- |
| 0 | OpenFGA + Postgres via compose, localhost-bound, env plumbing, model bootstrap | Health check green |
| 1 | Extraction script → reviewable route/module/action matrix | **Human review of the matrix** |
| 2 | Schema, catalogue, backfill migration | Backfilled groups and grants match the reviewed matrix |
| 3 | `PermissionService`, shadow adapter, outbox, `ops -- fga:sync` | Equivalence test passes |
| 4 | Shadow mode on in production; legacy wins; divergences logged | **Divergence log clean** |
| 5 | Refactor the 234 gates module by module: finance → purchasing → inventory → CRM → HR → core | Shadow stays clean per module |

Phase 4 runs **before** the call sites are refactored, which is possible because
shadow evaluation is added *inside* `requireCompanyRoles` itself: it keeps its
existing signature and behaviour, and additionally resolves the current route to
its `(module, action)` pair via the phase-1 matrix, queries OpenFGA, and logs any
divergence. No call site changes, no behaviour change, real production traffic.

Phase 5 then replaces each call site with an explicit
`requirePermission(req, companyId, module, action)`, which is why the shadow
comparison must already be proven clean first.
| 6 | Admin UI and frontend permission feed | Tests green |
| 7 | `AUTHZ_ENGINE=openfga`, per company then globally | — |

## 16. Testing

- **Equivalence test** — generated from the phase-1 matrix. For every
  (role x route) pair, asserts the new engine's answer equals the old one. This
  is what makes "no user loses access" enforceable rather than aspirational.
- **Integration tests** via the existing `node --test` + supertest setup.
- **CI/local** uses OpenFGA's in-memory datastore, which is explicitly supported
  for non-production use. Production uses PostgreSQL 14+.

## 17. Deployment

OpenFGA runs as a container alongside the existing pm2-managed processes on the
VPS described in `DEPLOY.md`, with PostgreSQL 14+ as its datastore. It binds to
localhost only and is never exposed through nginx. A pre-shared key is
configured regardless, so a future misconfiguration of the bind address is not
immediately exploitable. The datastore is bootstrapped with `openfga migrate`.

New backend env vars: `AUTHZ_ENGINE`, `FGA_API_URL`, `FGA_STORE_ID`,
`FGA_MODEL_ID`, `FGA_API_TOKEN`.

## 18. Risks

| Risk | Mitigation |
| --- | --- |
| OpenFGA becomes a single point of failure for the whole app | Permission-set caching means steady-state requests make no FGA calls; only cold-cache requests fail, and they fail as `503` |
| The extraction matrix mis-maps a route, silently changing access | Human review at phase 1, plus the equivalence test, plus shadow mode running against real production traffic before any flip |
| SQLite and OpenFGA drift | Transactional outbox plus the `fga:sync` reconciler |
| Refactoring 234 call sites introduces regressions | Module-by-module, each behind shadow mode, with legacy still authoritative |
| Admin locks their company out | Server-side guardrails in section 12 |
| OpenFGA is over-engineering for pure RBAC | Accepted knowingly. It is justified by the record-rules project that follows; if it proves not to earn its keep, `AUTHZ_ENGINE=legacy` is the exit |

## 19. Follow-up projects

- **Record rules** — the reason OpenFGA is worth its operational cost. Adds
  relations for ownership, team, and warehouse scoping, and replaces
  `canViewProject` / `canViewTask`.
- **Authentication hardening** — separate branch. The `tokens` table is
  `(token, userId)` with no expiry, no issued-at, and no device data, so tokens
  are valid indefinitely until explicit logout. Wants expiry and refresh,
  session listing and revocation, password policy, and optional TOTP. Deliberately
  kept out of this project: permission changes roll back with an env var, but a
  botched identity migration locks everyone out.
