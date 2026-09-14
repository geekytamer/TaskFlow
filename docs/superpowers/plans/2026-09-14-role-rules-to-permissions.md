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
- [ ] Staging deploy.

## Part 2 — Role-only rules become permissions

- [x] Rules declared in `permissions/record-rules.ts`, merged into the catalogue
      and seed matrix; migration 081 grants them to existing built-in groups.
- [x] Every backend enforcement point converted; the store receives decisions
      (`seesPrivate`, the dashboard variant) instead of roles; notification
      recipients follow permissions under the openfga engine.
- [x] Frontend: 25 files use the permissions, with the role as fallback.
- [x] Parity proof (below).
- [x] Committed.
- [ ] Staging deploy and real-data comparison (`ops authz:compare`).

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

- The user dialog gains a groups picker per company, starting with the role's
  built-in group. Role options exclude deleted built-ins. Users without
  `settings:roles.write` keep the role-only choice.

## Part 4 — Module access for a whole company

- Switch a module on or off for an entire company. Design questions to settle
  once Part 3 lands.
