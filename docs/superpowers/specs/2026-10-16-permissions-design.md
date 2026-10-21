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

Data — evolve what exists instead of starting over (the tables already live in TaskFlow's database and `store.getEffectivePermissions` already evaluates them in-process; OpenFGA only mirrored them):
- `permission_groups` stays the roles table (UI calls them **roles**; "group" is reserved for the holding group). Adds `templateKey`, `holdingGroupId` (non-null = a group-level role/template).
- `group_permissions(groupId, module, action)` gains `scope` (own|team|company|group, null = not scoped) and `limitAmount` (null = no limit); module/action move to the new catalogue keys by migration.
- `role_fields(groupId, field, canView, canEdit)` — new.
- `user_group_assignments` gains `isMain`, `startsAt`, `endsAt`, `delegatedBy`, `reason`, `viaHoldingGroupId`.
- `group_implications` kept (templates build on each other).
- New: `holding_groups(id, name, nameAr, createdAt)`, `companies.holdingGroupId`, `holding_group_admins(holdingGroupId, userId)`, `holding_group_assignments(holdingGroupId, userId, roleKey, isMain, startsAt, endsAt)`, `record_shares(companyId, area, recordId, userId)`, `permission_audit`.
- `authz_version` kept; `fga_outbox` and OpenFGA tuples dropped at the end; `authz_divergence` reused for shadow mode (column `openfgaAllowed` renamed in code to `newAllowed`).
- `users.companyRoles[].role` remains the legacy answer during shadow; at switch-over the main-role assignment becomes the truth and `companyRoles` is derived from it for old readers.

### Holding groups — behaviour and known limits (Task 8)

- **Company access through a group (Ruling M).** Under v2, a person reaches a company if they are a member (`users.companyRoles`) **or** hold an active group assignment covering it (company in the group, inside startsAt/endsAt). This applies to the company gate, the company switcher (`GET /companies`), the "all my companies" lists (projects, tasks, people) and notification recipients. Legacy is unchanged (membership only); shadow logs the difference as `company.access`.
- **Read-only copies.** Each company of a group holds a copy (`group:<key>`) of every group role in use. It decides group-wide people there; the company's own roles never do. Company role writes refuse it (403 `GROUP_ROLE`).
- **Push spares system roles (Ruling N).** Push updates the copies and the company's non-system roles started from the template that still equal a version the group published. A company's system roles (Owner, Admin, Manager, Accountant, Employee) are never changed and are reported as "company standard role — not updated".
- **Who a group admin may appoint (Ruling O).** Group admins assign group-wide roles to, and appoint as group admins, only people who belong to a company of the group. Removing someone is always allowed. The super admin is unrestricted.
- **Known limit: one window per person.** A person's group assignment is one set of keys with one startsAt/endsAt. Setting it replaces all of that person's rows in the group, temporary ones included.
- **Known limit: push remembers versions through the audit.** "Unchanged" means equal to a version recorded in `permission_audit` (`holding_template`) or the system template. Pruning that table makes older copies look customised. That is a safe failure: they are reported, not overwritten.
- Assignment dates must be strict ISO dates (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM[:SS][Z|±HH:MM]`).

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
- The legacy gate extractor (`npm run authz:extract`) is retired from CI: the declared route registry and the equivalence tests are the proof now (Ruling K).
- **Reads go through one filter** (`authz/visible.ts`). Under legacy and shadow it is computed from each role's template, so every list and count answers as the roles did (Ruling D) — except these **intended differences under legacy (leak closures)** (Ruling J):
  1. Influencers CSV export no longer includes colleagues' private contacts.
  2. A contact's summary (`/contacts/:id/summary`) is 404 for a private contact the person cannot see; its opportunities and projects are filtered.
  3. Contact detail, its activities, and the PATCH /contacts/:id echo are 404 for a private contact outside the person's scope (Accountants included).
  4. WhatsApp messages filtered by phone or contact no longer include others' private chats; an owner-less private chat is visible only at company scope.
  5. The CRM dashboard without an owner counts only what the person can see (it used to give an Employee company totals).
  6. Main-dashboard task figures and activity leave out colleagues' private tasks.
  7. Follow-up enrichment does not name a contact or opportunity the person cannot see; follow-up workload and coverage gaps follow the viewer's reach.
  8. Activity events (Ruling L): `/activity-events`, the activity-log CSV export and the dashboard feeds leave out events about scoped records the person cannot see (events of deleted records stay).
  9. Client tasks (`/companies/:id/clients/:clientId/tasks`) no longer include colleagues' private tasks.
  10. Sensitive fields (Task 7): someone without `rate_cards` (under legacy, an Employee) no longer gets `rateCardAmount` back in the JSON answer to these writes: `POST /companies/:id/contacts` (the rate card they typed is still saved), `PATCH /contacts/:id`, and `POST /followups/contact:<id>/done` and `/reschedule`. Before this change, those answers returned the whole contact.
  11. An employee record can be linked (`userId`) only to someone who belongs to the company (400 otherwise), for every role. Before this change, any user id was accepted. A link makes that person's pay, IDs and bank details "their own" (see below).
- **Sensitive fields go through one mask** (`authz/mask.ts`: FIELD_MAP, plus ACTIVITY_METADATA for the metadata of activity events).
  - **Who sees what.** Under legacy and shadow the mask reads the role's template (Ruling D), so nothing changes: management sees salary, IDs, bank details, rate cards and client terms; Employees see only their own pay, IDs and bank details; every template keeps cost prices.
  - **Module lock.** Only the paths that used to ask the old field rules lock a field while its module is off. These are the employee list and detail (payroll), and the contact list, contact summary and influencer export (contacts). The person's own records stay visible. Every other path shows the fields as before, whatever the modules.
  - **Linking an employee to a login.** The person linked counts as the record's owner, so setting or changing `userId` is a write of salary, IDs and bank details.
  - **Field writes.** They are checked only under v2: legacy keeps today's answer and shadow logs the difference. Under v2, a write that changes a field the person may not edit is refused with 403 `field:<key>`; this includes an Employee creating a contact with a rate card. A value sent back unchanged is not a change. On a create, the defaults 0, '' and null are not a change either.
  - **Decisions:**
    - Not masked: the company's own bank accounts on invoice and bill PDFs (Task 1). Prices and discounts on POs, vendor bills, quotations and invoices also stay; they are the document's own prices, not the item's cost or the client's standing terms.
    - Company totals stay (payroll run `totalNet`, gratuity totals, stock value, journals), because the ledger already shows them. When a total covers only one employee it equals that person's pay. This is accepted: whoever sees it can already open the ledger.
    - Creator-workspace deal amounts stay. They are the influencer's deals with other brands, not Peak's rate card, and only Admins and Managers see them.
    - The WPS salary file needs salary, bank details **and** ID numbers, because the file contains all three.
    - Without `client_terms`, a credit-limit refusal (409) still explains the refusal but does not state the limit. Under legacy only management reaches it, so nothing changes.
- **Left outside the read filter, on purpose:** client and supplier lists (finance and sales need every client and supplier, whatever the contact's privacy); the portal staff routes that list influencer contacts (behind portal management, Admin/Manager); portal client-facing catalogue lists (clients, not staff).

## 7. Phases (each shippable)

- **1a Foundation** — engine, catalogue, templates, assignments (main + add-ons), group structure and group-wide assignments, ownership + shares + team scope, `visible` and `mask` on every read path (lists, search, exports, PDFs, notifications, push, dashboard), every route declared, equivalence + shadow, frontend reads `/me/permissions` (role guesses removed), People + Roles screens, refusal messages, OpenFGA removed.
- **1b Control** — limits, maker-checker, temporary access and delegation, impact preview, no self-granting, explain / view-as, change log screen; approvals screen + PO threshold + credit override folded into limits.
- **1c Governance** — conflict-of-duty rules and report, access reviews, unused-permission report.

## 8. Testing

Equivalence matrix (every route × template); poison fixtures for every read path (a private record's text never appears for someone outside scope — list, search, export, PDF, notification, push); team scope across a 3-level manager line; group assignment reaches a newly added company; masked fields absent from JSON; mutation checks on `visible`, `mask`, maker-checker; browser checks of People/Roles en/ar at 375 px.

## 9. Out of scope

Sub-holdings, department scope, field rules beyond the sensitive list, approval chains beyond two levels (project 2 adds Legal steps), shared records across companies (project 4).
