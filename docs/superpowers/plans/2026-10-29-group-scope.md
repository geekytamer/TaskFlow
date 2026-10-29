# A group as a working scope

Today a holding group is only an administration screen: companies, people,
role templates. The owner wants to *work* in a group — open the dashboard and
see the whole group, open Tasks, Projects and Finance and see every company's
records at once, and filter by company.

## Decisions

- **Scope, not a company.** The app keeps one selected company for company
  pages. A group adds a second scope: group-aware pages read the group's
  companies (narrowed by the filter), everything else keeps working per
  company. Switching scope is the company switcher, already built.
- **A page is group-aware or it is not.** A page opts in; until it does, the
  group scope hides it rather than showing a company's data under a group
  heading. No half-answers.
- **Permissions stay per company.** A roll-up includes a company only where the
  viewer may see that resource. A group administrator without finance in one
  company sees the other companies' finance and is told one is missing.
- **One filter.** A company filter in the page header, shared by every
  group-aware page and remembered per group.

## How the data arrives (cheapest first)

1. **Already cross-company.** `/tasks` and `/projects` return every accessible
   company's records (`accessibleCompanyIds` unions the group's companies under
   v2). Group scope filters client-side. No backend work.
2. **Dashboard.** `GET /holding-groups/:id/dashboard?companyIds=` builds each
   company's payload with today's code and merges: metrics summed, charts
   summed per label and series, alerts and activity concatenated and labelled
   with the company, quick actions deduped.
3. **Everything else** (56 company-scoped list routes). `GET
   /holding-groups/:id/rollup/:resource?companyIds=` fans out server-side: the
   same store method per company, that company's permission check, each row
   tagged with its company. Pages opt in one at a time.

## Phases

- [ ] **Phase 1 — the scope works.** Scope state and the company filter;
  dashboard roll-up; Tasks and Projects in group scope with a company column;
  the sidebar shows only group-aware pages while in a group.
- [ ] **Phase 2 — money.** Invoices, payables and the finance overview through
  the roll-up route.
- [ ] **Phase 3 — the rest and the details.** Contacts, inventory, purchasing;
  opening a record from a group view lands in its company with the scope
  remembered.

## Open questions, decided for now

- **A group with one company** behaves like that company: no filter chrome.
- **Creating** anything stays per company: a create button in group scope asks
  which company first (Phase 2 onwards; Phase 1 hides creation in group scope).
- **The Academy lock** applies per company today. A group view is read-only
  roll-up, so it is not gated; the underlying company pages still are.
