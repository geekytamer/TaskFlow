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

Each rule becomes a permission granted to the built-in groups whose role holds
it today.

| Permission | Roles today | Enforced in |
|---|---|---|
| `projects:all.read` | Admin, Manager, Accountant | `canViewProject` |
| `tasks:all.read` | Admin, Manager, Accountant | `canViewTask` |
| `tasks:time-entries.delete` | Admin, Manager | `DELETE /time-entries/:id` (others' entries) |
| `contacts:private.read` | Admin, Manager | `listContacts` private visibility |
| `contacts:pricing.read` | Admin, Manager, Accountant | `canSeeContactPricing` / redaction |
| `contacts:all.write` | Admin, Manager, Accountant | `PATCH /contacts/:id` (others' contacts) |
| `crm:all.read` | Admin, Manager, Accountant | follow-ups, opportunities, proposals, vendor requests lists |
| `crm:all.write` | Admin, Manager, Accountant | opportunity stage, vendor request edits (others') |
| `campaigns:all.read` | Admin, Manager, Accountant | campaigns list |
| `campaigns:all.write` | Admin, Manager, Accountant | generate vendor bills (others' campaigns) |
| `commissions:all.read` | Admin, Manager, Accountant | commissions list |
| `whatsapp:private.read` | Admin, Manager | `canViewWhatsappChat` |
| `dashboard:operations.read` | Admin, Manager | dashboard variant |
| `dashboard:finance.read` | Admin, Accountant | dashboard variant |
| `settings:users.write` | Admin, Manager | `assertUserManagementPermission` (per company) |
| `settings:roles.write` | Admin | assigning Admin, Manager or Accountant |

Notification recipients switch to existing permissions whose built-in holders
match today's role lists exactly: purchase orders `purchasing:approve`;
payments and overdue invoices `invoices:read`; vendor bills `vendor-bills:read`;
low stock and expiry `inventory:write`.

Dashboard variant from permissions: operations and finance gives the Admin
view, operations only Manager, finance only Accountant, neither Employee.

Stays on the global role, because it is platform-level rather than
company-scoped: `requireAdmin` (positions, `GET /users`, `POST /seed`),
`GET /users/:id` (admin or self), and the global-Admin shortcut in
`assertUserManagementPermission`. **Flag:** that shortcut lets a user whose
primary role is Admin manage users in companies where they are not an Admin.

### Mechanism

- `src/permissions/record-rules.ts` declares the rules. The catalogue and seed
  matrix merge them. The catalogue test accepts "enforced by a gate or declared
  as a rule", and a new test asserts every rule is referenced where enforced.
- `server.ts` checks a rule through one helper: openfga reads the request's
  permissions, legacy checks the role list, shadow logs divergences.
- The store receives decisions rather than roles (`seesPrivate`, the dashboard
  variant); notification recipients resolve by permission once the server
  tells the store its engine.
- Migration 081 grants the rule permissions to existing built-in groups in
  every company, skipping deleted built-ins.
- Frontend: every remaining role decision uses `usePermissionOr` with the rule
  permission, keeping the role as the legacy fallback.

### Verification

- Equivalence: for every rule and role, the seed matrix matches today's roles.
- Behaviour: identical seeded data under the legacy and openfga engines; every
  affected endpoint compared for all four roles, including private and owned
  records and redacted fields.
- Real data: on staging's production copy, every user's role-based and
  group-based decisions compared; differences listed.
- Frontend typecheck and browser spot checks.

## Part 3 — The role becomes a starting point

- The user dialog gains a groups picker per company, starting with the role's
  built-in group. Role options exclude deleted built-ins. Users without
  `settings:roles.write` keep the role-only choice.

## Part 4 — Module access for a whole company

- Switch a module on or off for an entire company. Design questions to settle
  once Part 3 lands.
