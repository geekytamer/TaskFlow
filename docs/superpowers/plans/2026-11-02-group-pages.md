# Group pages (stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a group shown whole, the main list pages show every company's records in one table with a Company column. Creating asks which company the record belongs to, and acting on a row acts in that row's company.

**Architecture:** Fan-out in the app. A whole-group read calls the existing per-company API once for each company in scope and merges the rows. Each company keeps exactly its own server checks, and a company that refuses (403, or the module switched off) is named as not shown. `<InCompany id>` re-provides the company and permission contexts for one company, so the existing create dialogs and row actions work unchanged inside it.

**Tech Stack:** Next.js 15 / React, `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-02-group-as-company-design.md` (stage 2: group-aware reads, all pages; create dialogs get the company picker).

## Global Constraints

- No backend route changes: per-company server checks stay the only authority.
- Never add two currencies together. Amount columns show each row in its own company's currency, and per-page totals are given per currency or not at all.
- A company left out is named (`<MissingCompanies>`), never silently dropped.
- A company without children behaves exactly as today: no extra requests, no column, no picker.
- Bilingual copy through `tr(en, ar)` or `t()`.

## Review Focus

- **One company's request fails (403 or network) while the others succeed:** the page shows the others and names the failed one. The page doesn't error out.
- **A row action (edit, delete, status) on a child company's row:** it must call that company's API with that company's permissions, not the group's.
- **Creating with a filter set to one company:** the picker defaults to that company. With the whole group, it defaults to the group company itself.
- **Switching company or scope while requests are in flight:** late answers from the old scope are dropped.
- **Pages that join several sources** (clients ← invoices): ids are unique across companies, so joins stay correct, and money stays in each row's currency.

---

### Task 1: Fan-out and company components

**Files:**
- Create: `frontend/src/lib/fan-out.ts` (+ `.test.ts`); `frontend/src/modules/groups/components/in-company.tsx`, `company-cell.tsx`, `missing-companies.tsx`, `company-picker.tsx`; `frontend/src/modules/groups/hooks/use-scoped-list.ts`
- Modify: `frontend/src/context/company-context.tsx` (export `CompanyContext` for re-providing)

**Interfaces:**
- `fanOut<T>(companyIds: string[], load: (companyId: string) => Promise<T[]>): Promise<{ rows: Array<T & { companyId: string }>; missing: Array<{ companyId: string; reason: 'forbidden' | 'off' | 'error' }> }>`. Rows keep each company's order, companies in the given order, and a row's own `companyId` is kept when present. `ApiError` status 403 maps to `forbidden`, a MODULE_OFF code to `off`, and anything else to `error`.
- `useScopedList<T>(load: (companyId) => Promise<T[]>, deps): { rows; missing; loading; reload() }`. It uses `useCompanyScope().companyIds`, and drops a stale answer after a scope or company change.
- `<InCompany companyId>`: CompanyContext with `selectedCompany` set to that company, plus a nested PermissionsProvider. It renders children only when the company is in the person's list.
- `<CompanyCell companyId>`: the company name, rendered only when `inTree` and more than one company is in view (`useShowCompanyColumn()`).
- `<MissingCompanies missing>`: one line naming the companies not shown, and why.
- `<CompanyPicker>` / `useCreateTarget(permission)`: the companies in scope where the person `can(permission)`. The default is the single filtered company, else the group company. It returns `{ choices, target, setTarget }`.

- [ ] Step 1: Test `fanOut`: merge order; 403 → forbidden while the others are kept; MODULE_OFF → off; rows tagged with their company. Test the stale-answer guard as the pure helper `latest()`.
- [ ] Step 2: Run `cd frontend && node --import tsx --test src/lib/fan-out.test.ts`. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run again. Expected: PASS. Also `npx tsc --noEmit`.
- [ ] Step 5: Commit `feat(groups): read a page across a group's companies`.

### Task 2: Contacts, Clients, Suppliers
Each page loads through `useScopedList`, shows `<CompanyCell>` and `<MissingCompanies>`, wraps each row's actions and links in `<InCompany row.companyId>`, and creates through `<CompanyPicker>` then `<InCompany target>`. Commit `feat(groups): contacts, clients and suppliers across the group`.

### Task 3: Sales and Purchases
`sales-page.tsx` (orders, quotations, deliveries), `purchases-page.tsx` (orders, receipts), `requisitions-page.tsx`. Same pattern. Commit.

### Task 4: Finance invoices and payables
The invoices and payables tabs of the finance page. The overview tab, ledger and reports stay company-only (consolidation is stage 5) under the own-records notice. Commit.

### Task 5: Inventory, HR, approvals, documents
`inventory-page.tsx` (items), `employees-page.tsx`, `leave-page.tsx`, `approvals-page.tsx`, the documents list. Commit.

### Task 6: CRM
`crm-entity-pages.tsx` (opportunities, proposals, campaigns, vendor requests), `followups-page.tsx`. Commit.

### Task 7: Ship
- [ ] Add every converted path to `GROUP_AWARE_PAGES`, with tests.
- [ ] Browser walk-through on the scratch copy: each converted page in whole-group and single-company mode; create into a child company; edit a child's row.
- [ ] Full suites, lint, build. Fresh whole-branch review, then fixes. PR, merge, `/root/deploy-pr22.sh` (frontend only).
