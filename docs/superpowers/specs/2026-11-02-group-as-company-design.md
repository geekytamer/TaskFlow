# A group is a company

Status: proposed, 2026-11-02. Replaces the "group as a scope" approach
(`plans/2026-10-29-group-scope.md`) and folds in the membership proposal
(`plans/2026-11-02-group-membership.md`).

## What the owner asked for

A group should be treated as a company with full operations: open it like any
company and use every page (tasks, projects, finance, contacts, inventory,
people), with a company filter; size of the change doesn't matter.

## How the leading ERPs do it

| Product | Structure | Working across companies | Group finance |
|---|---|---|---|
| NetSuite OneWorld | A tree of subsidiaries. The top (parent) is itself a subsidiary that can transact. | A role is limited to a set of subsidiaries; lists show every subsidiary in it, with a Subsidiary column and filter. | Consolidated reports roll children up the tree at period rates; intercompany eliminations post to an *elimination subsidiary*. |
| SAP S/4HANA | Company codes (legal entities) under a controlling area; a group chart of accounts. | Users are authorised per company code. | Group Reporting consolidates company codes with eliminations. |
| Dynamics 365 Business Central | Separate companies; one is the consolidated company with business units. | Company Hub: one page across all companies. | Consolidation copies ledger entries into the consolidated company; intercompany partners get mirrored documents through an IC inbox/outbox. |
| Odoo | Companies, optionally parent and branches. | The user ticks several companies in the switcher and sees all their records at once; new records go to the *active* company. Records without a company are shared. | Intercompany rules mirror invoices and orders; consolidation module for eliminations. |
| Sage Intacct | Top level plus entities. | Top level shows everything and owns shared customers, suppliers, accounts; entities see only themselves. | Consolidation books per reporting level, with elimination by affiliate entity. |

What they all share, and what we take:

1. **The group is an entity in the same table as its companies** (NetSuite
   parent, Intacct top level, BC consolidated company), not a separate kind
   of object.
2. **Selecting it shows everything below it**, with an entity column and an
   entity filter on every list (NetSuite, Odoo, Intacct).
3. **New records belong to one entity**, defaulting to the one you're in
   (Odoo active company).
4. **Access is per entity**, and a role can cover a node and everything
   under it (NetSuite subsidiary restrictions).
5. **Shared master data lives at the top** and is visible below (Intacct top
   level, Odoo company-less records).
6. **Group finance means consolidation**: currency translation plus
   elimination of intercompany balances, with intercompany documents
   mirrored automatically (BC, Odoo, NetSuite).

## The model

### Companies form a tree

- `companies.parentCompanyId` (nullable). A company with children is a
  **group**. Nesting is allowed (a group inside a group); every query works on
  the subtree, so depth costs nothing.
- **The group is a full company.** It has its own settings, currency, ledger,
  numbering, branding, people and records, so a holding company's own
  operations (head-office projects, shared staff, management fees) have a
  home, as in NetSuite.
- `holding_groups` goes away. Each existing holding group becomes a company
  named after the group, and its companies become its children. Group
  administrators and group-wide roles become roles on that company (below).

### Two ways of looking at a company

When a group is selected, the header shows a scope toggle:

- **Whole group** (default): the group and everything under it.
- **This company only**: the group's own records.

The company filter narrows *Whole group* to any subset. A company without
children shows neither control and behaves exactly as today.

### Reading

Every list, report and dashboard read takes the selected company and expands
it to the **subtree the viewer may see for that resource**:

- the same per-company permission check as today, applied to each company in
  the subtree;
- companies that fail the check are left out *and named* ("Finance from Smart
  Hammer is not shown: you don't have access"), never silently dropped;
- every row carries `companyId`, and each list shows a **Company column** when
  more than one company is in view.

### Writing

- **Create** in a group asks which company the record belongs to, defaulting
  to the group itself (or to the only company the filter shows). The picker
  lists only companies where the viewer may create that record.
- **Edit, delete, approve, post** act on the record's own company and use that
  company's permissions, numbering, currency, locked periods and academy lock.
  Opening a record from a group list keeps the group selected.
- Documents never mix companies. An invoice belongs to one company, and its
  lines, payments and ledger postings stay in that company.

### Access

- A role assignment is for one company, and may be marked **includes companies
  below**. Group administrators and group-wide roles become assignments on the
  group company with that flag, and keep their current effective access
  exactly.
- **Members.** A person belongs to the top company of their tree. Access is
  granted anywhere in it. Removing someone from the group ends all their
  access at once; their records stay. (From the membership proposal.)
- **Employer**: at most one company, for HR, payroll, WPS, gratuity and
  sponsorship, kept separate from access.

### Shared master data

- Contacts (clients, suppliers, influencers), products and inventory items can
  be **shared with the group**: owned by the group company and visible, usable
  and referenceable in every company below. Each company keeps its own
  transactions with them (balances, prices, stock).
- Default is per company, as today. Sharing is a per-record choice by someone
  with write access in the group company, plus a bulk "merge duplicates" tool
  for records that exist in several companies.

### Group finance

- **Intercompany partners.** A company in the tree can be a contact of
  another (created automatically, one per sister company). An invoice from A
  to B creates the matching vendor bill in B, in draft, linked both ways;
  payment on one side offers the matching payment on the other. Purchase
  orders to a sister company create the sales order the same way.
- **Intercompany accounts.** Each company gets system accounts *Due from
  group companies* and *Due to group companies*, and intercompany documents
  post there with the partner recorded on the journal line.
- **Consolidated reports** (trial balance, profit and loss, balance sheet,
  cash flow, aged receivables/payables) for any group node:
  - translated to the group's currency, at the period's average rate for
    income and expenses and the closing rate for balances. The difference
    goes to a *translation reserve* line. Rates come from a group exchange-rate
    table kept per month.
  - intercompany balances and intercompany revenue/expense eliminated at
    report time by matching partner pairs, with unmatched amounts shown as a
    reconciliation list instead of being hidden;
  - manual consolidation adjustments posted to the group company's own ledger
    in an *eliminations* journal that only consolidated reports include.
- **Operational money** (receivables, payables, cash on dashboards) is shown
  per currency, and in the group currency only where rates exist. Nothing
  ever adds two currencies without converting them.

### What stays per company, by design

Legal documents and numbering, tax/VAT returns, payroll runs and WPS files,
bank accounts and reconciliation, locked periods, academy training. A group
view lists these across companies but every action happens in one company.

## How it's built

### Backend

- `companyTree` service: `subtree(companyId)`, `ancestors`, `topOf`,
  cached and invalidated on company changes.
- **One read helper**, `scopedRead(req, rule, companyId, read)`. It expands
  the subtree, applies `rule` per company, calls the existing per-company
  store method for each allowed company, tags rows with their company, and
  returns `{ rows, missing }`. List routes change from
  `res.json(store.listX(id))` to `res.json(scopedRead(req, RULE, id, (c) =>
  store.listX(c)))`. The store's per-company SQL is unchanged, so every
  existing filter, redaction and visibility rule keeps working.
- Routes are converted family by family (84 families). The route registry
  records each route as `group-aware` or `company-only`. A `company-only` read
  called on a group with `scope=tree` is refused with 409 and a clear message,
  so a page can never show one company's data under a group's name.
- Writes take `companyId` from the record (edit) or from the body's chosen
  company (create), validated against the selected subtree.
- Reports: a consolidation module (`finance/consolidation.ts`) built on
  journal lines, with translation and elimination as pure functions and
  their own tests.
- Migration (one, on `feature/permissions-v2`): create a company per holding
  group, set `parentCompanyId`, convert group admins and assignments to
  `includes companies below` assignments, drop `holding_groups*` tables after
  the comparison passes.

### Frontend

- The company switcher shows the tree; a group shows its children indented
  beneath it.
- `useCompanyScope()` replaces `useGroupScope()`: `companyId`, `isGroup`,
  `scope` (`tree` or `self`), `filter`, `companyIds`, `companyName(id)`.
- Shared pieces every page uses: `<ScopeBar>` (scope toggle and company
  filter), `<CompanyCell>`, `<MissingCompanies>` and `<CompanyPicker>` on
  create dialogs.
- Pages convert one by one. A page not yet converted still works in a group:
  it shows the group company's own records under a notice saying so, so
  nothing shows one company's data under the group's name unlabelled.
- The portfolio overview built last week becomes the group's dashboard.

### Proof before it ships

- **Access parity**: every user's effective permissions in every company,
  before and after the migration, on a copy of production. Zero differences,
  or it doesn't ship.
- **Read parity**: for every converted route, a group read must equal the
  union of per-company reads for the same viewer. One generic test covers
  all of them through the route registry, including a viewer missing
  access in one company.
- **No cross-company writes**: a test per write family checks that creating
  into a company outside the selected subtree, or one where the viewer can't
  create, is refused.
- **Consolidation**: worked examples with two currencies and an
  intercompany invoice, payment and loan. The consolidated balance sheet
  must balance and intercompany must net to zero.
- Browser walk-through of every converted page in group and company mode.

## Build order

Each stage ships on its own and leaves the app consistent.

1. **The tree.** Parent companies, migration from holding groups, the access
   conversion with the parity comparison, the switcher, and the group's own
   records (it's a company, so it works on day one). The group dashboard
   moves over.
2. **Group-aware reads, all pages.** `scopedRead`, the shared frontend
   pieces, and every list page converted: projects, tasks, CRM, contacts,
   sales, purchasing, inventory, finance lists, HR, documents. Create
   dialogs get the company picker.
3. **People.** Membership, access per company with "includes companies
   below", employer, and the Group → People and Person screens.
4. **Intercompany.** Sister companies as partners, mirrored invoice/bill
   and PO/SO, intercompany accounts.
5. **Consolidation.** Group exchange rates, consolidated statements,
   eliminations, the reconciliation list, the eliminations journal.
6. **Shared master data.** Shared contacts and items, and merging duplicates.

## Decisions made (owner can override)

- The group is a real company that can transact, not an empty heading. A
  group that doesn't trade just leaves its own books empty.
- Nesting is allowed but nothing in the UI encourages it.
- Report-time elimination plus a manual eliminations journal, rather than a
  NetSuite-style elimination subsidiary. It's simpler, nothing posts
  automatically, and the result is the same.
- Shared master data comes last. It changes how records are owned and isn't
  needed for the group to work as a company.
- A person belongs to one tree.

## Needed from the owner before stage 1 goes to production

Which companies sit under Al-Yarubi Group. Staging shows 3 inside, 4 outside
that share staff with it, and 6 with no shared staff. Stage 1 can be built and
tested on staging without this answer.
