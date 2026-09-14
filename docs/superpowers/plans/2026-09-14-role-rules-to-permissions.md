# From roles to groups

Roles (Admin, Manager, Employee, Accountant) and the built-in permission groups
share names but are separate. Under `AUTHZ_ENGINE=openfga` groups decide the
module gates, yet the role still decides a set of record-level rules no group
controls. This plan makes groups the single source of access, in four parts.

Invariant throughout: **under the legacy engine nothing changes**, and under
the openfga engine **every built-in role keeps exactly the access it has
today**. Only users whose groups were changed by hand can see a difference.

## Part 1 — Group management

- [x] Delete any group, built-in or custom, only when it has no members and no
      other group inherits from it. `?force=true` is gone.
- [x] Record deleted built-in groups (`permission_group_deletions`, migration
      080) so startup seeding and `authz:repair` do not recreate them.
- [x] Custom groups never take a built-in key (`admin`, `manager`, `employee`,
      `accountant`), so they cannot silently become a role's group.
- [x] Group editor: delete for every group (disabled while it has members);
      one checkbox per module ticks or clears all its actions; Enter saves a
      rename, with a "Saved" confirmation.
- [x] A role whose built-in group was deleted is refused when newly assigned
      on user create/edit, and hidden in the user dialog for that company.
- [x] Browser verification: 14 checks in a real browser.
- [x] Staging deploy.

## Part 2 — Role-only rules become permissions

- [x] Rules declared in `permissions/record-rules.ts`, merged into the catalogue
      and seed matrix; migration 081 grants them to existing built-in groups.
- [x] Every backend enforcement point converted; the store receives decisions
      (`seesPrivate`, the dashboard variant) instead of roles; notification
      recipients follow permissions under the openfga engine.
- [x] Frontend: 25 files use the permissions, with the role as fallback.
- [x] Parity proof (below).
- [x] Committed.
- [x] Staging deploy and real-data comparison (`ops authz:compare`): 12
  companies, 37 memberships, 629 rule decisions compared, 0 differences.

| Permission | Roles today | Enforced in |
|---|---|---|
| `projects:all.read` | Admin, Manager, Accountant | `canViewProject` |
| `tasks:all.read` | Admin, Manager, Accountant | `canViewTask` |
| `tasks:time-entries.delete` | Admin, Manager | deleting others' time entries |
| `contacts:private.read` | Admin, Manager | private contacts in the contact list |
| `contacts:pricing.read` | Admin, Manager, Accountant | rate-card redaction (list, summary, follow-ups, influencer export) |
| `contacts:all.write` | Admin, Manager, Accountant | editing others' contacts; choosing a contact's owner |
| `crm:all.read` | Admin, Manager, Accountant | follow-ups, opportunities, proposals, vendor requests lists |
| `crm:all.write` | Admin, Manager, Accountant | create/edit/delete opportunities, proposals and vendor requests beyond one's own; opportunity stage; vendor request status |
| `campaigns:all.read` | Admin, Manager, Accountant | campaigns list |
| `campaigns:all.write` | Admin, Manager, Accountant | creating for others, editing others' campaigns, generating their vendor bills |
| `commissions:all.read` | Admin, Manager, Accountant | commissions list |
| `whatsapp:private.read` | Admin, Manager | private chats (list, messages, settings) |
| `dashboard:operations.read` | Admin, Manager | dashboard variant |
| `dashboard:finance.read` | Admin, Accountant | dashboard variant |
| `settings:users.write` | Admin, Manager | managing users in a company |
| `settings:administration.write` | Admin | assigning roles above Employee; all permission-group administration; the Settings and Permission groups pages |
| `settings:groups.read` | Admin, Manager, Accountant | reading permission groups |

Notification recipients use existing permissions whose built-in holders match
the old role lists exactly: purchase orders `purchasing:approve`; payments and
overdue invoices `invoices:read`; vendor bills `vendor-bills:read`; low stock
and expiry `inventory:write`.

Still decided by the global role, as platform-level rules: `requireAdmin`
(positions, `GET /users`, `POST /seed`), `GET /users/:id` (admin or self), and
the global-Admin shortcut in user management. **Flag:** that shortcut lets a
user whose primary role is Admin manage users in companies where they are not
an Admin.

### Found and fixed along the way

- **Edits to built-in groups were silently undone.** Seeding re-granted every
  default permission to existing built-in groups whenever anyone's role changed
  or the server started. Seeding now grants defaults only to a new group.
- **WhatsApp privacy used the global role**, not the role in the company, so a
  user who is a Manager in one company and an Employee elsewhere got the wrong
  answer. It now follows the company, like every other rule.
- **The Settings and Permission groups pages were widened to Managers** by the
  earlier page-gating work (both mapped to `settings:write`, which Managers
  hold). Found by the browser smoke test; both now require
  `settings:administration.write`, restoring Admin-only access.
- **Permission-group routes had no permission mapping**, so under openfga they
  fell back to the role check and logged a warning on every call. They now use
  `settings:administration.write` and `settings:groups.read`.
- **The company-lockout guard** now requires `settings:administration.write`,
  so a company cannot remove the last person able to repair its groups.
- **The UI followed groups under the legacy engine.** The permission feed
  answered whatever the engine, so a hand-edited group would change the UI but
  not the server. The feed now reports its engine, and the UI follows
  permissions only under openfga.

### Evidence

- `record-rules-parity.test.js`: 20 probes, each run as all four roles on the
  legacy and openfga engines. Every outcome matches the old role rules and the
  two engines agree on all 80. Notification recipients identical.
- `api.test.js` (106 tests) passes under both engines; a negative control with
  OpenFGA granting nothing fails, so that run is not vacuous. A decision trace
  showed it covered only 22 of 64 rule/role pairs, which is why the parity test
  exists.
- Not directly probed: the follow-ups and commissions lists, and owner-forcing
  on create for contacts, opportunities and campaigns. They use the same
  mechanical conversion as the probed routes.
- Browser, legacy engine, current code: 45 page visits across Admin, Manager
  and Employee render cleanly; Admin reaches the Settings and Permission groups
  pages and Manager is redirected (12 checks).

## Part 3 — The role becomes a starting point

- [x] The user dialog gains a groups picker per company for holders of
  `settings:administration.write`: current groups when editing, the role's
  built-in group when adding, swapping the built-in group when the role changes
  and keeping custom groups, as the server does.
- [x] Only a company whose groups someone changed is saved (after the user
  itself), so untouched companies stay with the server's role sync. A failed
  save names the company and says the user was saved.
- [x] Role options exclude deleted built-ins.
- [x] Committed (e518883) and deployed to staging (run 8).
- [x] Browser: the picker shows a person's current groups when editing.
- [ ] Browser: role change swaps the group, and saving applies it (the browser
  pane was hidden, so clicks could not be driven).

## Part 4 — Module access for a whole company

Decisions: the platform super admin sets it when creating or editing a
company; off means off for everyone there, admins included; group grants are
kept, so switching back on restores the same access.

- [x] `companies.disabledModules` (migration 082). `settings` and `dashboard`
  are always on (`permissions/company-modules.ts`).
- [x] Server refuses a switched-off module under every engine: in the auth
  middleware for `:companyId` routes, in the role gate for routes that find
  their company from a record, in record rules, in project and task views,
  task creation and time-entry deletion. Public document links answer 404.
  Nobody is notified about it.
- [x] Only a super admin may change the list (403 otherwise); unknown or
  always-on modules are refused (400). A change bumps the authz version.
- [x] The permission feed drops the module's permissions and lists
  `disabledModules`; the catalogue lists `alwaysOnModules`.
- [x] `company-modules.test.js`: 4 tests, both engines. Suite 258/258.
- [x] UI: module switches in the super admin's company dialogs; hidden from
  navigation and pages under every engine; greyed in the group editor.
- [x] Committed (aa4f6f5) and deployed to staging (run 8): migration 082
  applied, OpenFGA in agreement, real-data comparison still 0 differences.
- [x] Browser, legacy engine, Payroll and Projects off: both leave the sidebar,
  /hr/payroll shows the turned-off page, /hr/employees still renders, the group
  editor marks both. API: 403 with a clear message; feed lists them.
- [ ] Browser: the switches in the create and edit company dialogs.

## Part 5 — Module gaps and a bug sweep

Gaps left by Part 4, now closed:

- [x] A switched-off module produces nothing: no notifications (and existing
  ones are hidden from the bell, unread count and digest), no automatic
  follow-ups from its records, no WhatsApp intake (the webhook still answers
  200 so the provider stops retrying).
- [x] The dashboard, management report, contact summary, and record
  attachments and timelines leave out switched-off modules.
- [x] In-page sections: Finance hides the Invoices and Payables tabs and task
  expenses; invoice, client, bill, supplier, purchase, inventory pages, the
  command palette and the onboarding checklist stop loading data from
  switched-off modules.
- [x] Frontend lint: ESLint 9 with Next's rules. 81 errors fixed; `any` is a
  warning (about 400 remain). Builds now fail on type or lint errors instead of
  ignoring them (`next.config.ts`).

Bugs found and fixed:

- **Saving some company details erased the others.** Unsent fields were
  written as NULL, so renaming a company cleared its legal name, tax number
  and phone. Reproduced, fixed, tested.
- **SQL injection in the contact list.** The viewer's user id was pasted into
  the query, and `POST /users` accepted any caller-chosen id. An old-query
  control returned a private contact to a crafted id. Now bound, and ids must
  be plain.
- **Contacts created as Private were saved as Public** through the API, and
  visible to everyone in the company. Reproduced with an Employee, fixed,
  tested.
- **Report print windows ran record names as HTML** in a window sharing the
  app's origin. Names are escaped. Both print views also passed `noopener`,
  which makes `window.open` return null by spec, so Print did nothing.
- **WhatsApp for Employees:** the menu and page offered the inbox while its
  API refuses them, and the bell and sidebar polled it every 30 seconds for
  403s. Menu, page and polling now follow `whatsapp.chats.read`.

Verification: backend 268/268; frontend type-check clean, lint 0 errors,
`next build` passes with checks enforced. Browser (legacy engine, Invoices,
Tasks and WhatsApp off): Finance without Invoices (a `?tab=invoices` link lands
on Overview), sidebar without Tasks and WhatsApp, dashboard without task or
invoice figures, checklist without the invoice step, WhatsApp page turned off.
