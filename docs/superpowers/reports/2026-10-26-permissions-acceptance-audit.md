# Permissions rebuild + holding groups — acceptance audit

Date: 2026-10-26 · Branch `feature/permissions-v2` @ `3eda930` · Auditor: Claude (testing only, no product code changed)

Environment: throwaway local stack. Backend `tsx src/index.ts` on 127.0.0.1:4177 (`PERMISSIONS_ENGINE=v2`, later `shadow` and `legacy` on the same DB), `ACADEMY_ENFORCE=false`, `SEED_ON_EMPTY=false`, temp DB in the scratchpad. Staff frontend `next dev` on :9177. Browser checks in the Claude browser pane (671 px desktop pane, 375×812 mobile emulation), API checks with Node `fetch` scripts. Scripts, logs and DB: `/private/tmp/claude-501/-Users-tamerabbasher-Documents-Projects-TaskFlow/450ffb7d-39f5-43c2-b578-3662e4c8c2d1/scratchpad/audit/`. Screenshots: `…/scratchpad/audit/shots/` (named by section).

Seed: companies Peak, GIG, Al Yarubi Trading. Super admin. In each company: Admin, Manager (Mazin), peer Manager (Noor), Accountant (Layla), Employees A/B/C. HR line Mazin → A → B, and Noor → C, all linked to users, plus one unlinked HR record. Employees have salary, IBAN and civil ID. Public and private contacts owned by different people, an influencer with a rate card, opportunities, follow-ups, campaigns, public and private tasks, public and private projects, a supplier, an item with a cost price, POs of 800 and 5,000, and a client with a 1,000 credit limit plus invoices. Group A "Yarubi Group Holding" holds Peak and GIG. Group B "Second Holding" holds Al Yarubi Trading.

## Summary verdict

**Not ready to switch production to `v2`.** Groups work end to end. You can create a group, attach and detach companies, reject a company that already belongs to another group, appoint admins, assign group-wide roles, edit templates and push them. Group reach under v2 (switcher, lists, live updates, chats, notifications, immediate loss on detach or expiry) works. Scopes (own / team 2 levels / company / group), masking and the role editor rules behave as designed.

Two issues block the switch:

1. **Under v2, `PUT /users` and `DELETE /users` still bypass the lock-out guard and the no-higher-than-me rule.** A Manager demoted and then deleted the only Admin. This item is on the spec's own pre-switch checklist.
2. **Group administrators are not held to no-higher-than-me.** Any group admin can make any employee of a group company a co-admin. That employee can give themselves group-wide **Owner** (full access to every company, salaries included) and remove the original admins.

Two Important UX/enforcement gaps:
- On many screens the one-sentence refusal is overwritten by a generic "An error occurred" toast.
- Approval limits on POs can be set and are shown, but the server does not enforce them.

Counts: **Critical 2 · Important 5 · Minor 13 · Cosmetic 6.**

---

## Findings (by severity)

### Critical

**C-1. Under v2, a Manager can demote and then delete the only Admin (lock-out and no-higher-than-me bypass through `/users`)**
- Steps: in Al Yarubi Trading, the Admin is the only person who can manage roles. As the Manager (`mgr.yar`), call `PUT /users/<adminId>` with `{companyRoles:[{companyId:<yar>, role:'Employee'}]}`, then `DELETE /users/<adminId>`.
- Expected: 409 LOCKOUT, or 403 HIGHER_THAN_YOU / "target above me" (spec §10 pre-switch checklist: "PUT and DELETE /users under v2 run the people.manage_roles lock-out guard and the 'target no higher than me' check").
- Actual: `PUT /users/72470867… 200` (role becomes Employee), then `DELETE /users/72470867… 200 {"success":true}`. The company is left with no member who can manage roles. Log: `api-v2.log` lines 944–947.
- Suspected: `backend/src/server.ts:3064–3170` (PUT /users: only `assertUserManagementPermission`/`USERS_WRITE`, no `guarded()` and no `requireWithin`). `backend/src/server.ts:3225–3241` (DELETE /users: same). Also the deletion writes no `permission_audit` row (see M-9).

**C-2. Group admins can escalate without limit: appoint any group-company employee as co-admin, who then self-grants group Owner and removes the other admins**
- Steps: as group admin Aisha (Admin of Peak), `PUT /holding-groups/A/admins {userIds:[aisha, empB.gig]}`. As `empB.gig` (plain Employee of GIG), `PUT /holding-groups/A/assignments/<self> {roleKey:'owner'}`, then `PUT /holding-groups/A/admins {userIds:[self]}`.
- Expected: no-higher-than-me applies to group assignments, templates and admin appointments, as it does for company roles (spec §5 "Nobody saves, activates or assigns a role giving more than they hold"). At the least, a group admin should not be able to grant themselves a role or remove the admins who appointed them.
- Actual: 200 at each step. `empB.gig` then holds 141 grants in Peak including `people.manage_roles`, and reads every Peak salary (`GET /companies/<peak>/employees` → `admin.peak HR:1555 …`). The original admin is removed. Audit rows exist (`holding_admins`, `holding_assignments` by `empB.gig`), but nothing prevents it. Script: `b-esc.mjs`.
- Suspected: `backend/src/authz/holding-routes.ts:137–176` (admins and assignments only check `isHoldingAdmin` + Ruling O membership). Same for templates: `holding-routes.ts:179–195` (a group admin can edit and push templates beyond their own access).

### Important

**I-1. The one-sentence refusal is overwritten by a bare "An error occurred" (en) / "حدث خطأ" (ar)**
- Steps: Employee A → Influencers → Edit on the admin's influencer → Save.
- Expected: "You need the permission … — ask an Admin, Manager …" (`lib/forbidden-message.ts`).
- Actual: the server sends a coded 403 (`code:"FORBIDDEN", permission:"contacts.manage", roles:[…]`). The global ForbiddenBridge toast is replaced at once by the component's own `toast(t('common.error'))`, because `TOAST_LIMIT = 1`. The person only sees "An error occurred" (shots `F02`, `F04`). The pattern `catch { toast(t('common.error')) }` appears 27 times in 10 files.
- Suspected: `frontend/src/hooks/use-toast.ts:12` (`TOAST_LIMIT = 1`), `frontend/src/modules/influencers/components/influencer-edit-sheet.tsx:131–132`, and the other `t('common.error')` call sites. Related: the Edit button is shown to an Employee who cannot save (spec: "hidden actions are absent"), `influencers-page.tsx:261`.

**I-2. PO approval limits are editable and displayed, but the server does not enforce them**
- Steps: add-on "PO approver ≤1000" (`purchasing.approve` limit 1000) given to the Peak Accountant. With a PO approval threshold of 100, create POs of 800 and 5,000 and approve both as the Accountant.
- Expected: approve 800, refuse 5,000 with an over-limit sentence. Alternatively, the editor should not offer the limit until 1b.
- Actual: both `200 approved`. The person page reads "Approve or reject purchase orders and requisitions up to 1000". The role editor offers "Up to … USD". (Credit-override limits **are** enforced; see F.) Maker-checker is also absent: Mazin approved his own PO (1b, noted only).
- Suspected: `backend/src/server.ts:6352–6371` (`/purchase-orders/:id/approve` gates on role list only, no amount). `authz/engine.ts:62–78`: only `INVOICES_CREDIT_OVERRIDE` passes `amount`.

**I-3. A group admin who is not a member of every group company is offered only their own company's people in "Add a group-wide person"**
- Steps: Aisha (group A admin, Peak member only, before holding any group role) → /settings/group → Add person.
- Expected: people of Peak **and** GIG (Ruling O).
- Actual: only Peak people are listed (shot `B01`). `getUsersByCompany(GIG)` returns 403 and is swallowed by `.catch(() => [])`. After she gave herself group Owner, GIG people appeared. That is the self-grant path of C-2.
- Suspected: `frontend/src/modules/authz/components/group-page.tsx:364`. The server has no "group members" endpoint for group admins.

**I-4. Creating a campaign on a private contact silently makes the contact Public**
- Steps: Employee A creates a private contact, then a campaign linked to it.
- Expected: the contact stays private, or the person is told it will become public.
- Actual: `contacts.visibility` flips to `Public` (adding the `Client` role auto-promotes it), and every colleague then sees it. Reproduced with probe contact `PROBE-PRIV-1`: Private → after campaign → Public. This is pre-existing behaviour, but it undermines the private-contact guarantees this project relies on.
- Suspected: `backend/src/data/store.ts:8077–8081` (`addContactRole` → `UPDATE contacts SET visibility='Public'` for Client/Vendor/Partner).

**I-5. Shadow mode cannot surface read-scope changes, so "zero divergences" does not mean "same lists"**
- Steps: Mazin's main role is "Team manager" (Manager with team scope). Under shadow, his lists show the whole company (legacy decides). Under v2 they show only his line.
- Expected (spec §10 step 2): the shadow week reveals what v2 will change.
- Actual: after a full scope matrix under shadow, `authz_divergence` held only 3 rows (`company.access`, `purchasing.approve`, `sales.view @ search`). The narrowing of Mazin's lists, the group person's switcher entry (`GET /companies`) and other read-filter differences are never logged.
- Suspected: by design, `authz/visible.ts` is legacy-computed under shadow (Ruling D). Needs at least a documented caveat in DEPLOY.md §2b, or a shadow comparison of `visible()` counts.

### Minor

**M-1. "Until 31 Dec" ends at the start of that day (UTC).** Setting `endsAt:'2026-10-26'` removed GIG access immediately on 26 Oct (403 at 12:33 UTC), while the UI reads "until 26 Oct 2026". `authz/authz-store.ts:230–234` (`Date.parse(date)` = midnight UTC, `now < end`). It is also not Muscat time.

**M-2. Past end dates are accepted without a warning.** `PUT …/assignments/<user> {endsAt:'2020-01-01'}` → 200 (the person silently has no access). `authz-store.ts:913–921`, `group-page.tsx` dialog has no `min`.

**M-3. Duplicate group names allowed.** Two groups named "Second Holding" were created (201 both). `authz-store.ts:807`.

**M-4. Plain-language summary hides the scope.** The Accountant summary reads "Full access to contacts" although `contacts.view` is `own` (sees only own private contacts). "Works on users and roles" / "Works on campaigns" are vague. `backend/src/authz/describe.ts:69` (preset labels ignore mixed scopes).

**M-5. Scope picker shows the widest scope of an area.** The Accountant template shows Contacts "Company" although `contacts.view` is `own`. Touching the picker would widen view to company without saying so (spec says "shows the widest held" — consider a "Mixed" state). `role-editor.tsx` / `role-draft.ts`.

**M-6. Refusal "who to ask" lists duplicate and empty roles.** "Ask an Admin, Manager, Accountant, Accountant, Junior Accountant, Owner, Peak Bookkeeper, People admin or Team manager." The group copy and the standard role share the name "Accountant", and roles held by 0 people are included. `backend/src/authz/engine.ts:101–150` (`rolesGranting`).

**M-7. HIGHER_THAN_YOU wording ignores scope.** Giving `crm.view@group` as a company-scope Manager → "You can't give permissions you don't have yourself: See opportunities…". The Manager *does* see opportunities. Changing someone above you lists permissions the actor holds at a narrower scope, in a very long sentence. `authz/routes.ts:128–139`.

**M-8. Under legacy/shadow, add-ons and group roles are not labelled "takes effect at switch-over".** Only custom *main* roles carry the chip (shot `H01`). Add-ons such as "PO approver ≤1000" and "Group: Accountant" look active but grant nothing yet. `people-page.tsx`.

**M-9. Audit gaps.** 52 `permission_audit` rows have `actorUserId = NULL`. These include the assignments created by the super admin through `POST /users`, the first assignment row of a `PUT /users` change, and the group-copy role rows created during an assignment. `DELETE /users` removes a person's assignments with **no** audit row. `authz-store.ts` setAssignments callers in `server.ts` (POST/PUT/DELETE /users).

**M-10. Direct-URL denial does not say who to ask.** Employee → `/finance` → redirect home + toast "Access Denied — You don't have permission to view this page." (shot `F03`). Spec: every refusal names who to ask.

**M-11. Projects menu shown with no project access.** Group Accountant template with Projects = None still shows Projects in the menu (open to every member by design, `nav-permissions.ts` comment). Spec F: "menus match grants".

**M-12. Super admin cannot act in a company they are not a member of.** `POST /companies/<GIG>/employees` → 403 NO_COMPANY_ACCESS until the super admin added themself (pre-existing; `server.ts:1343` `requireCompanyAccess` has no super-admin bypass).

**M-13. Record shares have no API or UI.** `record_shares` is honoured by every read path tested (list, export, search). The only way to create a share is SQL, and spec 1a lists "ownership + shares".

### Cosmetic

- **K-1.** Admin → Groups: the inline "That company already belongs to another group." stays visible after later successful actions (remove/add) (`admin-groups.tsx:315/320`, shot `A06`).
- **K-2.** In Arabic, the group role chip shows the English template name: "المجموعة: Owner" (shot `I02`).
- **K-3.** Toasts in RTL are shifted off the right edge (text clipped, shot `F04`).
- **K-4.** "Full access to whatsApp" (lower-cased brand) in summaries (`describe.ts` `lower()`).
- **K-5.** Limits are shown unformatted on the person page ("up to 1000", no currency), but formatted in the editor ("1,000 USD").
- **K-6.** Five template "Edit" links share the accessible name "Edit" (no template name) on the Group page.

### Not bugs / notes
- An idle tab refetched 6 endpoints every ~3 s in the browser pane. Cause: the pane fires `visibilitychange` (4 in 10 s), and each one triggers the live catch-up. This is a test-harness artifact; check once in a normal browser.
- With the backend fully down at page load, the app goes to /login (token kept). The "Couldn't load your permissions — Retry" state appears only when `/me/permissions` fails after sign-in. Verified by a company switch with `/me/permissions` blocked (shot `I01`).
- Under legacy, Employees can edit a colleague's **public** task in a public project (empB → empA's task 200). This is the same under v2 and looks like the intended legacy rule (`tasks.edit` follows visibility).
- Under legacy the startup prints no `PERMISSIONS_ENGINE=…` line (shadow and v2 do).

---

## Checklist A–J

Legend: PASS / FAIL / PARTIAL / NOT TESTED. Evidence = HTTP status + excerpt, screenshot, or log.

### A. Admin → Groups (super admin)
| # | Item | Result | Evidence |
|---|---|---|---|
| A1 | Create group with en + ar names | PASS | UI create "Yarubi Holding" / "مجموعة اليعربي القابضة"; audit `holding_group` row |
| A2 | Rename | PASS | UI rename → "Yarubi Group Holding" |
| A3 | Add 2 companies | PASS | Peak + GIG added (shot A02) |
| A4 | Company already in another group refused inline | PASS | UI: "That company already belongs to another group." (A03); picker then shows "— in Second Holding" disabled (A04); API 409 |
| A5 | Remove company with confirm text | PASS | "Remove GIG from Yarubi Group Holding? People who reach GIG through this group lose access there." (A05) |
| A6 | Appoint group admins, only group-company people offered | PASS | Candidates = Peak + GIG people + super admin; Yarubi-only "Omar Outsider" absent; save → toast |
| A7 | Validation errors | PASS (M-3) | Empty name → "Give the group a name."; API blank → 400; "Choose a company to add."; duplicate name accepted |
| A8 | Empty states | PASS | "No groups yet" (A01), "No companies in this group yet." |
| A9 | Arabic RTL | PASS | dir=rtl, Arabic labels (A07/A08) |
| A10 | 375 px, no horizontal scroll | PASS | scrollWidth 375 = clientWidth 375 |
| A11 | Non-super admin cannot create groups | PASS | `POST /holding-groups` as Admin → 403 "Super-admin access required." |

### B. Group page
| # | Item | Result | Evidence |
|---|---|---|---|
| B1 | /admin/groups?group= (super admin) | PASS | B05 |
| B2 | /settings/group for group admin: companies list | PASS | GIG, Peak chips, admins line |
| B3 | Assign group-wide Owner | PASS | Aisha → Owner (UI) |
| B4 | Group-wide Accountant with end date | PASS (M-1, M-2) | Layla → Accountant until 31 Dec 2026 |
| B5 | Template edit (level / scope / limit / fields) | PASS | Projects→None, Pipeline scope→Group (offered), Cost prices See off (Change auto-off); toast "Template saved…" (B02) |
| B6 | Push with confirmation + result categories | PASS | Confirm dialog (B03); result: Updated (3) GIG/Peak group copies + Peak Bookkeeper; Customised (1) GIG Bookkeeper; Company standard role — not updated (2) (B04) |
| B7 | Group A admin cannot see/act on group B | PASS | GET/PUT admins/assignments/templates/push on B → 403 "Only an administrator of this group can do this."; list shows only own group |
| B8 | Non-admin cannot reach it | PASS | API `[]` / 403; UI "You don't administer a group" (B06) |
| B9 | Ruling O: group admin cannot assign / appoint outsider | PASS | 403 "Only people who belong to a company of this group…" (both) |
| B10 | Group admin limited to own access | **FAIL** | C-2 |
| B11 | Candidate list complete for a group admin | **FAIL** | I-3 (B01) |

### C. Group reach under v2 (Layla = group Accountant, not a GIG member)
| # | Item | Result | Evidence |
|---|---|---|---|
| C1 | Company switcher | PASS | `/companies` → ["Peak","GIG"] |
| C2 | Dashboard | PASS | `/companies/GIG/dashboard` 200; UI "Company Overview, Role View: Accountant" (C01) |
| C3 | Lists | PASS | contacts/opps/invoices/items/employees/POs/campaigns/followups 200 |
| C4 | Records within template scope | PASS | crm.view@group; projects none (detail 403); cost prices hidden (`unitCost` absent; export has no cost column); private contact detail 404 (contacts.view own) |
| C5 | Live updates | PASS | SSE delivered `{"topics":["contacts"],"companyId":"<GIG>"}` and invoices/payments |
| C6 | Staff chats | PASS | appears in GIG team-members; starts direct chat 201; GIG admin can chat with her 200 |
| C7 | Notifications | PASS | `invoice_payment` for GIG invoice received |
| C8 | Detach removes access immediately | PASS | after DELETE company: switcher ["Peak"], contacts / me/permissions / team-chats 403; reattach restores |
| C9 | End date in past → no access; future start → no access | PASS | both 403 |
| C10 | Group admin cannot assign outside group companies | PASS | B9 |

### D. Settings → Roles
| # | Item | Result | Evidence |
|---|---|---|---|
| D1 | Standard roles read-only, Duplicate only | PASS | all 28 level pickers + inputs disabled; API PUT/DELETE → 403 SYSTEM_ROLE; group copy → 403 GROUP_ROLE |
| D2 | Duplicate + edit levels None/View/Edit/Full/Custom | PASS | "Accountant (copy)" → "Junior Accountant", Purchasing Full/Custom |
| D3 | Scopes own/team/company/group; group only when in a group | PARTIAL | Peak (in group) offers Group; `/me/permissions.holdingGroupId` drives it. A company in no group was not shown in the UI (all three were grouped) |
| D4 | Ruling S: preset clears limits; limited rows show Custom + hint | PASS | D01, D02 ("— up to 1,000 USD") |
| D5 | Sensitive switches edit ⇒ view | PASS | See off ⇒ Change off |
| D6 | Beyond-me disabled states with reasons (Manager) | PASS | Noor (Manager + People admin): disabled "You don't have this yourself, so you can't give it." on Games, WhatsApp, Invoices Full, etc.; "Group — beyond your own" (D05); API 403 HIGHER_THAN_YOU |
| D7 | Lock-out guard 409 inline | PASS | People save → "This change would leave nobody who can manage roles…" (D09); role edit → 409 LOCKOUT |
| D8 | Delete unused custom role | PASS | confirm "Nobody holds it." (D06); in-use → 400 "assigned to 1 person(s)" |
| D9 | Needs-review role Activate | PASS | badge + banner (D07); main-role use → 400 NEEDS_REVIEW; Activate → empB gains sales.view (403→200) (D08) |
| D10 | Unsaved-changes guard on in-app navigation | PASS | "Leave without saving?" on back link and on bottom nav (D03) |
| D11 | Keyboard focus visible on level picker | PASS | Tab lands on radio, outline 2 px (D04) |
| D12 | Impact preview before Save | NOT TESTED | 1b by spec (absent) |

### E. Settings → People
| # | Item | Result | Evidence |
|---|---|---|---|
| E1 | Flags: HR unlinked, needs review, via group | PASS | "Not linked to an HR record", "Via group Yarubi Group Holding" (E01); needs-review add-on listed by name |
| E2 | Person page summary + "why" | PASS (M-4) | "Why: Accountant (main role), PO approver ≤1000 (add-on), Accountant (from the group until 31 Dec 2026)" |
| E3 | Main role + add-ons save | PASS | "Roles saved" (E03) |
| E4 | Refusal when target is above me | PASS | "They have access you don't, so you can't change their roles — ask an Admin."; API 403 |
| E5 | Via-group person read-only | PASS | E02; API PUT → 403 GROUP_PERSON |
| E6 | "Takes effect at switch-over" absent under v2 / present under legacy | PASS (M-8) | v2: no banner; legacy: banner + chip (H01) |

### F. Enforcement per user (Peak unless noted)
| # | Item | Result | Evidence |
|---|---|---|---|
| F1 | Menus match grants | PARTIAL | Employee A: no finance/sales/settings; Projects shown with no project access for group Accountant (M-11). Manager and Accountant menus not walked in the UI |
| F2 | Direct URL to forbidden page | PASS (M-10) | `/finance` → home + "Access Denied" (F03) |
| F3 | Refused write = one sentence en + ar | **FAIL** | I-1 (F02 en, F04 ar). Role and People screens do show sentences |
| F4 | Scope: Employee own | PASS | empB/empC lists = own only (contacts, opps, follow-ups, campaigns, search, export, CRM dashboard count) |
| F5 | Scope: team (2 levels, not peer) | PASS | Team lead A sees A+B, not C. Team manager Mazin sees Mazin+A+B, not Noor/C/Layla; detail 200 for A/B, 404 for C/Noor |
| F6 | Scope: company | PASS | Noor / Admin see all six owners |
| F7 | Detail by id | PASS | contacts/:id per scope (403 for Employees, `contacts.view_details` is management) |
| F8 | Search | PASS | `/companies/:id/search?q=SECRET` follows scope; private tasks only to owner |
| F9 | CSV exports | PASS | contacts export follows scope; influencer export hides rate card (no 4321) for Employee |
| F10 | Dashboard totals | PASS | CRM dashboard openOpportunities 3 (A), 1 (B), 4 (Mazin), 7 (company) |
| F11 | Inbox | NOT TESTED | no conversation data seeded |
| F12 | Notifications | PARTIAL | group reach notification verified (C7); privacy of notification text not exercised |
| F13 | Record share grants visibility | PASS | share inserted by SQL → empB sees empC's contact/opportunity in list and export (M-13) |
| F14 | Private contacts/tasks/chats never leak | PASS (I-4) | per matrix; private tasks only owner/assignee; chats members-only |
| F15 | Sensitive fields hidden in lists/details/exports | PASS | Employee: others' salary/IBAN/ID absent, own present; rate card "Hidden" (F01); cost price absent for group Accountant |
| F16 | Sensitive fields in PDFs / activity metadata | NOT TESTED / PARTIAL | salary edit produced no metadata to inspect; PDFs not opened |
| F17 | Approval limit 800 ok / 5,000 refused | **FAIL** | I-2 (both approved) |
| F18 | Credit override limit | PASS | override ≤300: 650 → 201; overage 1,050 → 409 canOverride:false; Manager without key → canOverride:false |
| F19 | Field write refused (rate card by Employee) | PASS | 403 `field:rate_cards` |
| F20 | Maker-checker | Note (1b) | Mazin approved his own PO (200) |

### G. Audit trail
| # | Item | Result | Evidence |
|---|---|---|---|
| G1 | Every change in permission_audit with who/what/before/after | PARTIAL | 108 rows: role, assignments, holding_* (group, company, admins, assignments, template, template_push), role_review. Gaps: M-9 (null actor, user deletion not logged) |
| G2 | `npm run ops -- authz:status` | PASS | "Engine: v2 … Authz version: 139 … Logged divergences: 0" |
| G3 | `npm run ops -- authz:compare` | PASS | "Since: … (last 7 days) Divergences: 0" (v2), 3 after shadow |

### H. Shadow and legacy
| # | Item | Result | Evidence |
|---|---|---|---|
| H1 | Shadow: system-role users decide as legacy | PASS | empC/Noor/Layla/Admin and GIG Admin/Manager/Accountant/Employee lists and gates identical |
| H2 | Divergences only for intended differences | PASS (I-5) | 3 rows: Layla `company.access` (group reach), Layla `purchasing.approve` (add-on), empB `sales.view @ search` (activated add-on) |
| H3 | Legacy behaves as today (10 screens/actions) | PASS | API: Employee invoices 403, roles 403; Manager role edit 403; Employee contact with rate card 201 (legacy keeps today's answer); group person 403 NO_COMPANY_ACCESS. UI as Admin: /, contacts, finance, purchases, inventory, employees, tasks, projects, roles, opportunities all render |

### I. Quality
| # | Item | Result | Evidence |
|---|---|---|---|
| I1 | en/ar on every new screen | PASS (K-2) | heuristic scan of roles, role, person, group, template pages in ar: no stray English UI strings |
| I2 | RTL mirroring | PASS (K-3) | level picker starts at the right (I03) |
| I3 | 375 px no horizontal scroll | PASS | people, roles, role, person, group, template: scrollWidth 375 |
| I4 | Loading / error "Couldn't load your permissions — Retry" | PASS | I01 |
| I5 | Console errors | PARTIAL | only expected 403/404/409 resource errors and dev-server chunk messages; no app exceptions seen |
| I6 | Server error logs | PASS | no 5xx, no `[authz] undeclared/undecided` lines in any engine log |

### J. Other
See C-1 … K-6 above. Also observed: `GET /opportunities/:id` and `GET /campaigns/:id` do not exist (404 for everyone). `/tasks?companyId=` ignores the parameter and returns every reachable company's tasks (the UI filters).

---

## What I could not test
- Push notifications (Web Push) and PWA; inbox conversations (portal, WhatsApp, email). No data seeded and no connectors.
- Invoice/payslip PDFs and the WPS file for masking. Activity-log metadata masking: the salary edit produced no metadata to inspect.
- UI menu walk-throughs for Manager, Accountant and the group Accountant beyond the dashboard and More menu. The custom narrowed role's menus were checked through `/me/permissions` only.
- Scope picker without the Group option: all three seeded companies were in a group.
- Creating record shares through the product (no API or UI). Shares were inserted by SQL.
- Converted roles from a real `authz:repair` run. `needsReview` was simulated with SQL.
- Production-mode build (`next build`): the frontend ran in `next dev`. The 3-second refetch loop is attributed to the browser pane's visibility events and was not confirmed in a real browser.
- Impact preview, View as, temporary access UI and maker-checker (1b by spec).

---

## Fixes (2026-10-26)

Commits: **3daf42c** (server) and **f1d3026** (staff app). New tests: `backend/test/authz-audit-fixes.test.js` (20 tests), plus additions to `frontend/src/lib/forbidden-message.test.ts`, `modules/authz/lib/role-draft.test.ts`, `modules/authz/lib/beyond.test.ts` and the new `modules/layout/lib/nav-permissions.test.ts`. Red first: on `436fc27` the new backend tests failed 18/19 (the 19th pins "legacy unchanged") and the new frontend tests failed 5/32.

Verification: backend suite 946/946 under `legacy`, `shadow` and `v2` (equivalence test green); frontend `npm test` 98/98, `tsc` clean, eslint on changed files 0 errors (1 old warning), production build OK; portal `npm test` 93/93. Re-run of the repros on a throwaway `v2` stack (copy of the audit DB, API :4178, web :9178; only those PIDs stopped).

| Finding | Fix | Commit | Re-verified (evidence) |
|---|---|---|---|
| C-1 | PUT/DELETE `/users`: lock-out guard everywhere (v2: `people.manage_roles` holders; legacy/shadow: last Admin, spec §6 item 12) and, under v2, the actor must hold the person's current access (`authz/guards.ts`, shared with the People API). Spec §10 item ticked. | 3daf42c | **PASS.** GIG: Manager demotes the only Admin → `403 HIGHER_THAN_YOU`; Manager deletes → `403`; the Admin demotes themself → `409 LOCKOUT`; Admin unchanged. Tests for every engine. |
| C-2 | Only the super admin sets group admins; a group admin gives roles, saves and pushes templates only within their access in every group company (`403 HIGHER_THAN_YOU … in GIG`), never their own (`403 SELF_ASSIGN`). Group page and template editor disable what is beyond (reasons shown); Admin → Groups says only the platform admin appoints. | 3daf42c, f1d3026 | **PASS.** Aisha appoints empB.gig → `403 Super-admin access required`; gives empB.gig Owner → `403 … in GIG`; gives herself Owner → `403 SELF_ASSIGN`; empB.gig self-grant → `403`; Owner template edit → `403`. UI: every role option "— beyond your own access" (disabled), push buttons disabled with "It gives more than you hold in some company of the group." |
| I-1 | Refusal hold drops a following generic ("An error occurred" / "حدث خطأ") or echo toast; `TOAST_LIMIT` 3. Influencer Edit shown only with `contacts.manage`. | f1d3026 | **PASS.** Employee A → Influencers: no Edit button. Unit test of the hold (en/ar generic, raw server message, news still shown). Refusal toast in the app: "You need the permission … — ask a Manager, Accountant, Peak Bookkeeper or an Admin." |
| I-2 | `purchasing.approve` limit enforced on PO and requisition approve under v2 (`403 OVER_LIMIT`, limit and amount in company currency); shadow logs `limit @`; legacy unchanged. | 3daf42c | **PASS.** Accountant (≤1000): PO 800 → `200 approved`; PO 5,000 → `403` "You can approve purchase orders up to 1,000 USD; this one is 5,000 USD." |
| I-3 | `GET /holding-groups/:id/people` (group admins of that group); the dialog uses it and leaves out the admin. | 3daf42c, f1d3026 | **PASS.** Aisha (Peak only): 15 people, 8 from GIG incl. empB.gig; non-admin `403`. UI picker lists GIG and Peak people, not Aisha. |
| I-4 | Campaign create and campaign assignment add the role without promoting visibility (legacy too; spec §6 item 13). | 3daf42c | **PASS.** PROBE-PRIV-2: Private → campaign 201 → still Private (role Client), colleague empB does not see it. |
| I-5 | Shadow: each `visible()` scope compared with v2's, logged as kind `scope` with both scopes, deduped hourly (migration 142). `authz:compare` counts by kind; spec §10 and DEPLOY §2b updated. | 3daf42c | **PASS.** Mazin (Team manager) lists twice each → 5 rows, e.g. `contacts.view scope GET /companies/:companyId/contacts legacy=company v2=team`; `authz:compare`: "By kind: 5 scope, 3 access". |
| M-1 | Date-only end runs through the end of that day in the company zone (conversation settings, default Asia/Muscat); start at that day's start. | 3daf42c | Test: on until-today, 23:59 Muscat in, midnight out. |
| M-2 | Past end date → 400 in the API; `min` on the date input; client check. | 3daf42c, f1d3026 | Test (`2020-01-01` → 400). |
| M-3 | Group names unique ignoring case (409). | 3daf42c | Test (create and rename). |
| M-4 | Mixed scopes in an area say each ("Sees own contacts; edits company contacts"), en/ar. | 3daf42c | Test. |
| M-5 | Scope picker shows "Mixed"; choosing sets all, then "Every action here now uses this scope." | f1d3026 | Test (`areaScopeMixed`). |
| M-6 | Who to ask: roles someone holds, once by name, at most three then "or an Admin". | 3daf42c, f1d3026 | Test: "Ask a Manager, Accountant, Sales desk or an Admin."; live: "Ask a Manager, Accountant, Peak Bookkeeper or an Admin." |
| M-7 | HIGHER_THAN_YOU names only what exceeds, with scope or limit, at most three then "and N more". | 3daf42c, f1d3026 | Test ("See opportunities (every company of the group)"). |
| M-8 | "Takes effect at switch-over" also on add-ons and group roles (People list and person page) while legacy decides. | f1d3026 | Code + build. |
| M-9 | Store audit rows fall back to the request's actor; POST/PUT/DELETE `/users` run under it; group copies carry the actor; deletion writes per-company `assignments`, group and `user` rows. | 3daf42c | Tests (POST/DELETE actor, group copy actor). |
| M-10 | Page denial asks `GET /me/permissions/ask` and shows the refusal sentence. | 3daf42c, f1d3026 | **PASS** (live): `/finance` as Employee → "Access Denied — You need the permission "See accounts, journals, bank, budgets, assets and reports" — ask a Manager, Accountant, Peak Bookkeeper or an Admin." (ar likewise). |
| M-11 | Not genuinely open to all: every standard role holds `projects.view`, and without it no project is visible, so `/projects` now needs `projects.view` (no change for standard roles). `/tasks` stays open (own tasks always visible). | f1d3026 | Test. |
| M-12 | Left as is (pre-existing: super admin outside a company gets NO_COMPANY_ACCESS until added). | — | — |
| M-13 | Deferred to 1b; added to spec §4 known limits. | 3daf42c | — |
| K-1 | A later success clears the inline add/remove error. | f1d3026 | Code. |
| K-2 | Group role chip and lists use the Arabic template name. | 3daf42c, f1d3026 | Code (server sends `nameAr`). |
| K-3 | Toast exit and swipe go toward the toast's own edge in RTL. | f1d3026 | Open toast inside the screen in RTL at 671 px (x 16–655) and 375 px (16–359). Exit animation could not be watched: the browser pane freezes CSS animations. |
| K-4 | "WhatsApp" keeps its capital. | 3daf42c | Test. |
| K-5 | Limits formatted with the company currency ("up to 1,000 USD"). | 3daf42c | Test. |
| K-6 | Edit / Push links named "Edit <template>" / "Push update of <template>". | f1d3026 | Code. |

Notes: under legacy and shadow a group admin's "own access" is their legacy role (group roles count only under v2), so a group admin with no role in a group company can give nothing there until v2. The PUT `/users` LOCKOUT under legacy carries `lastAdmin: true` so the app says "no Admin" instead of "Manage roles".

### Review round (N-1 … N-7, M-6 leftovers)

Commit: see `fix(authz): group assignment checks real copies, bounded removals, review items` (the commit after 5ba55f1). Tests appended to `backend/test/authz-audit-fixes.test.js` (now 31). Red first: N-1, both N-2 tests, N-4, N-5, N-6 and M-6 failed before the fix; N-3 and N-7 passed already and stay as regression guards. Backend suite 957/957 under legacy, shadow and v2 (one shadow run hit the known timing flake in `portal-alerts.test.js`, unrelated; the file and a full shadow rerun pass).

| Item | Fix | Evidence |
|---|---|---|
| N-1 | A group role is checked against what it gives in each company: the company's existing copy (copies keep their content until a push), else the template (`authz.holdingContentIn`). | Test: template saved down, not pushed, assign Owner → 403 HIGHER_THAN_YOU; the reviewer's probe: "assign after save 403", employee gets nothing. |
| N-2 | Ruling O amended: changing or removing someone's group-wide roles needs their access within the group admin's in every group company (403, "They have access you don't…"); a push may not change the roles of people above the group admin (403 "This push would change the roles of people who hold more than you…"); group assignment writes and pushes run the lock-out guard per company (super admin included). Spec §4 updated. | Tests: Manager-level group admin removing / demoting a super-admin-assigned Owner → 403; pushing a saved-down Owner → 403; super admin removing the last `people.manage_roles` holder (via the group) → 409 LOCKOUT. |
| N-3 | Tests added: super admin promotes a new Admin then demotes the old one (200, every engine); DELETE `/companies/:id` unaffected (200). Spec §6 item 12: the super admin removes a company's last Admin only by deleting the company. | Tests. |
| N-4 | DELETE `/users` no longer maps every error to 400; the global handler decides (data rule 400, fault 500); the guard's HttpErrors stay. | Test: a TypeError → 500. |
| N-5 | The `purchasing.approve` limit is checked in `decideDocument`, so the approval-chain decision route respects it too (only a limit the person holds is checked). POs have no own currency (company currency): limitation written in spec §5. | Test: chain step with approve ≤1000 on a 15,000 PO → 403 OVER_LIMIT; approval-chain suite green. |
| N-6 | `GET /me/permissions/ask` under legacy/shadow names the standard roles holding the key (the legacy gate), not v2 holders. | Test: legacy/shadow → Admin, Manager, Accountant (custom "Ledger reader" not named). |
| N-7 | PUT `/users`: companies dropped through `companyIds` are in `touched`. In practice `companyRoles` keeps the membership, so nothing is lost; the guard is defensive. | Test: Acme keeps its Admin. |
| M-6 | Who-to-ask counts only active holders (isActive, inside the window, not needing review; `rolePeopleCounts(…, { activeOnly })`) and appends the Admin role only when someone holds it and it grants the key. | Test: expired holder not named, no "Admin" when nobody is one. |
| Follow-ups | (1) Changing someone's group-wide roles also checks what their existing group assignments give, scheduled (not yet started) ones included. (2) Under v2 the lock-out guard counts people who reach the company through a group assignment. | Tests: a lower group admin removing a super-admin role starting in 3 days → 403; removing the only `people.manage_roles` holder of a company reached via the group → 409. Suite 959/959 under v2 and legacy. |
