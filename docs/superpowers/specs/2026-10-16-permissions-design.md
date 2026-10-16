# Permissions rebuild and holding groups — design

Status: approved in conversation 2026-10-16 (owner: "perfect, more comprehensive, lets do it, and ensure proper simple ui/ux"; then "get to implementing"). Project 1 of 4 in the group programme: (1) permissions core + group structure, (2) legal supervision, (3) group dashboards and reports, (4) shared records and inter-company transactions.

## 1. Why

Audit 2026-10-16:
- Production runs `AUTHZ_ENGINE=legacy`: four fixed roles plus role lists in code decide. The Permissions screen edits permission groups that only OpenFGA reads, so in production it changes nothing, and it does not say so.
- Staging runs `openfga`, so staging and production disagree.
- The gate extractor reads only `server.ts` and `routes/`; ~170 newer routes (conversations, portal staff, Discover, games, Academy, social, push) are in no permission map and cannot be granted or revoked.
- The catalogue is scraped from route paths ("create · contacts workspace contacts peak contact"), 19 modules, unusable by an administrator.
- 36 frontend files gate on a role fallback, 17 compare roles directly; menus and server disagree (the GIG accountant's Projects errors).
- "See everything" rules are on/off; no own/team/company levels; no explanation of access; no change history.

## 2. Decisions (owner)

| Question | Decision |
|---|---|
| Team scope | Manager line: a manager sees records of everyone reporting to them, directly or indirectly (HR `employees.managerId`, via `employees.userId`). Unlinked staff are flagged. |
| Group governance | Independent companies: each company manages its own roles; the group supplies starting templates. Group-wide people are assigned at group level through group roles, read-only to the company. |
| Roles per person | One main role plus optional add-ons per company; access is the union; nothing subtracts. |
| Group shape | One level (group → companies); a company belongs to at most one group. Sub-holdings later. |
| Engine | In-process, in TaskFlow's database. OpenFGA removed. Same engine in every environment. |

## 3. Concepts

- **Group** — holds companies, group Admins, a template library, group-wide assignments (apply to every company in the group, including ones added later).
- **Permission catalogue (code, not data)** — areas × actions, written by hand with en/ar labels. Actions: `view`, `create`, `edit`, `delete`, `approve`, `export`, plus area-specific (`post`, `pay`, `void`, `send`, `manage`). Each area declares the scopes it supports and which actions take a limit.
- **Scope** — on `view` and `edit` (and `delete` where meaningful): `own` < `team` < `company` < `group`. `group` means the same permission in every company of the group the person belongs to through a group assignment.
- **Limit** — numeric ceiling on an action: "approve purchase orders up to 5,000 OMR", "discount up to 10 %", "refund up to 200". Currency is the company currency.
- **Sensitive fields** — named list, each on/off per role, separate view and edit: `salary` (pay, allowances, payslips), `personal_ids` (passport, civil ID, visa), `bank_details` (IBAN of employees, suppliers, company), `cost_prices` (item cost, margins, landed cost), `rate_cards` (influencer rates), `client_terms` (pricing profiles, discounts, credit limits). Without view the server removes the field and the UI shows "Hidden".
- **Role** — per company: name (en/ar), description, permissions (action + scope + limit), sensitive fields, `templateKey` it came from. System templates: Owner, Admin, Manager, Accountant, Employee (today's four roles + Owner = Admin with group scope), and in project 2 Legal.
- **Assignment** — (person, company or group, role, main | add-on, startsAt, endsAt, delegatedBy, reason). Temporary access and delegation are assignments with an end date.
- **Ownership** — every owned record has `ownerUserId` plus optional `record_shares(person)`. `own` = I own it or it is shared with me; `team` = owner is me or in my manager line.
- **Locks (not roles)** — module switched off, Academy practice locks, document status (posted, voided, closed period, approved payroll). Applied after the role answer; nobody overrides them.
- **Rules every approve action follows** — maker-checker: nobody approves a record they created or last submitted; limits apply; conflicts of duty are reported.

## 4. Engine

`backend/src/authz/` (new; `permissions/` legacy code removed at the end):
- `catalogue.ts` — the hand-written catalogue (typed; areas, actions, scopes, limits, sensitive fields, en/ar labels, default per template).
- `templates.ts` — system templates as data built from the catalogue, proven equal to today's role behaviour.
- `evaluate.ts` — `effectivePermissions(store, userId) → Effective` (per company: action → {scope, limit}; fields; source trail for explanations). Union of main role + add-ons + active temporary/delegated + group assignments; then locks. Cached per user, invalidated by `authz_version`.
- `can.ts` — `can(eff, key, ctx: {companyId, record?, amount?}) → { allowed, reason, source }`; `visible(eff, area, companyId) → SQL fragment + params` for own/team/company/group; `mask(eff, area, companyId, row)` drops sensitive fields.
- `route.ts` — `route(app, method, path, permission | {public|self|perRecord}, handler)` declares every route; a test enumerates Express's router and fails on any route without a declaration.
- `team.ts` — manager line from HR (cached per company, invalidated on employee change).
- `audit.ts` — every change to roles, assignments, shares, groups written to `permission_audit` (who, what, before/after).

Data (migrations): `groups`, `companies.groupId`, `roles`, `role_permissions(roleId, action, scope, limit)`, `role_fields(roleId, field, canView, canEdit)`, `assignments`, `record_shares`, `permission_audit`, `authz_version` (existing).

## 5. UI (simple first, detail on demand)

Settings → **People**: list per company (or group): name, main role, add-on chips, temporary access with end date, ⚠ for conflicts / not linked to HR. Person page: plain-language summary ("Sees all sales; approves POs up to 5,000 OMR; can't see salaries"), "Why" per line (which role/add-on), View as, Give temporary access.
Settings → **Roles**: cards ("Accountant · 4 people"); role page = one row per area with a level picker None / View / Edit / Full / Custom and a scope picker only where it applies; Custom opens actions and limits; a short Sensitive information list of switches. Save shows the impact ("3 people gain …, 1 loses …") then Confirm. New roles start from a template.
**Group** (group Admins): companies, group-wide people, template library with "push update to companies using it unchanged".
**Reviews** (1c): quarterly per-manager to-do, Keep / Reduce, unused permissions greyed.
Everywhere: hidden actions are absent; a refused action explains in one sentence who to ask, never a bare 403; hidden fields say "Hidden". en/ar, RTL, phone width.

## 6. Switch-over and proof

- Today's four roles become templates with today's rights; record rules become scopes; existing permission groups become add-ons; OpenFGA removed.
- Equivalence test: for every declared route and every system template, the new answer equals the legacy role list answer (the extracted gate matrix) — failures listed by route.
- `PERMISSIONS_ENGINE=legacy|shadow|v2`: shadow week in production logs every disagreement while legacy decides; then v2; rollback = the setting.

## 7. Phases (each shippable)

- **1a Foundation** — engine, catalogue, templates, assignments (main + add-ons), group structure and group-wide assignments, ownership + shares + team scope, `visible` and `mask` on every read path (lists, search, exports, PDFs, notifications, push, dashboard), every route declared, equivalence + shadow, frontend reads `/me/permissions` (role guesses removed), People + Roles screens, refusal messages, OpenFGA removed.
- **1b Control** — limits, maker-checker, temporary access and delegation, impact preview, no self-granting, explain / view-as, change log screen; approvals screen + PO threshold + credit override folded into limits.
- **1c Governance** — conflict-of-duty rules and report, access reviews, unused-permission report.

## 8. Testing

Equivalence matrix (every route × template); poison fixtures for every read path (a private record's text never appears for someone outside scope — list, search, export, PDF, notification, push); team scope across a 3-level manager line; group assignment reaches a newly added company; masked fields absent from JSON; mutation checks on `visible`, `mask`, maker-checker; browser checks of People/Roles en/ar at 375 px.

## 9. Out of scope

Sub-holdings, department scope, field rules beyond the sensitive list, approval chains beyond two levels (project 2 adds Legal steps), shared records across companies (project 4).
