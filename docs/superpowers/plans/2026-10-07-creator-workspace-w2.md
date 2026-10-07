# Creator Workspace W2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Influencers record payments and expenses, see what they earned, are owed and kept (per currency) with Peak payouts counted in, and see every deliverable on one calendar.

**Architecture:** Two tables on the W1 workspace store; read models `moneySummary` and `calendarItems` in `backend/src/workspace/` that merge own records with Peak payouts/deliverables at read time; portal pages `/money` (replaces Payouts) and `/calendar`.

**Tech Stack:** as W1.

**Spec:** `docs/superpowers/specs/2026-10-07-creator-workspace-design.md` (§3 ws_payments, ws_expenses; §4 Income; §6 Calendar, Money, Home; §7 Payouts → Money).

## Global Constraints

- All W1 constraints (owner scoping, 404 for others, POST writes, bilingual, phone first).
- Money is never converted: every total is per currency.
- Owed (own) = for deals in `confirmed` or `delivered`, `max(0, amount − payments on that deal in the deal's currency)`. Owed (Peak) = payouts `pending` or `approved`. Received = own payments + Peak payouts `paid` (counted once, dated `paidAt`). Profit = received − expenses, per currency.
- Expense categories: `production`, `travel`, `agency_fee`, `manager_fee`, `equipment`, `other`.
- `/payouts` redirects to `/money`.

## Review Focus

1. A payment in a different currency from its deal: refused (400), so "owed" never mixes currencies.
2. Payments exceeding the deal amount: allowed (tips, extras); owed floors at 0.
3. A deal deleted with payments: its payments go with it (they are part of the deal); expenses linked to it stay, unlinked.
4. Year boundaries: totals for a year include only entries dated in that year (UTC date strings compare as text).
5. Calendar month grid in RTL: weeks start Saturday for Arabic, Sunday… use Monday for both? Ruling in Task 4.

---

### Task 1: Payments and expenses (store, migration 121, portal API)

**Files:** Modify `backend/src/workspace/workspace-store.ts`, `backend/src/data/store.ts` (migration `121_workspace_money`, pin in `test/api.test.js`), `backend/src/workspace/portal-routes.ts`, `backend/src/workspace/validation.ts`; Test `backend/test/workspace-money.test.js`.

**Interfaces (produces):**
- Store: `payments(o, dealId)`, `allPayments(o)`, `addPayment(o, dealId, { amount, currency, receivedOn, note })`, `deletePayment(o, id)`; `expenses(o)`, `addExpense(o, { dealId?, category, amount, currency, spentOn, note })`, `deleteExpense(o, id)`. `deleteDeal` also deletes the deal's payments and sets its expenses' `dealId` to null.
- Routes: `POST /deals/:id/payments`, `POST /payments/:id/delete`, `GET /expenses`, `POST /expenses`, `POST /expenses/:id/delete`; `GET /deals/:id` (own) adds `payments`, `expenses`, `received` (sum, deal currency).

- [ ] Tests: `'payments on a deal reduce what is owed and show on the deal'`, `'a payment in another currency than its deal is refused'`, `'expenses with and without a deal; deleting a deal keeps its expenses unlinked and removes its payments'`, `'another influencer gets 404 for payment and expense ids'`, `'bad input: negative amount, unknown category, bad date → 400'`.
- [ ] RED, implement, GREEN, full suite, commit `feat(workspace): payments and expenses`.

### Task 2: Money summary with Peak payouts

**Files:** Create `backend/src/workspace/money.ts` (`moneySummary(store, companyId, contact, year): MoneySummary`); route `GET /money?year=YYYY`; Test `backend/test/workspace-money-summary.test.js`.

**Interfaces:** `MoneySummary = { year, currencies: Array<{ currency, received, owed, expenses, profit }>, months: Array<{ month: 'YYYY-MM', currency, received, expenses }>, byBrand: Array<{ brand, source: 'own'|'peak', currency, received }>, ledger: Array<{ id, date, kind: 'payment'|'expense'|'peak_payout', label, detail, amount, currency, dealId: string|null, deletable: boolean, status?: 'pending'|'approved'|'paid' }>, owedItems: Array<{ dealId, title, currency, owed, source }> }`.

- [ ] Tests: `'received, owed, expenses and profit per currency'` (AED and OMR deals; payments; expense) with exact numbers; `'Peak paid payouts count as received once; pending and approved as owed'`; `'only the asked year counts'`; `'owed never goes below zero when payments exceed the amount'`.
- [ ] RED, implement, GREEN, suite, commit `feat(workspace): money summary with Peak payouts`.

### Task 3: Calendar items

**Files:** Create `backend/src/workspace/calendar.ts` (`calendarItems(store, companyId, contact, from, to)`); route `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` (max 93 days; default this month); Test `backend/test/workspace-calendar.test.js`.

**Interfaces:** item `{ id, source: 'own'|'peak', title, dueDate, done, platform, dealId, dealTitle }`; Peak deliverables from visible confirmed/completed assignments (done = approved or published); also every overdue undone item before `from` in `overdue: [...]`.

- [ ] Tests: `'own and Peak deliverables in range, sorted by date'`; `'overdue lists undone items due before the range'`; `'a range over 93 days or a bad date is refused'`.
- [ ] RED, implement, GREEN, suite, commit `feat(workspace): calendar of every deliverable`.

### Task 4: Portal Money (Payouts redesign), payments and expenses on the deal page, Calendar, nav, Home

Use the impeccable skill (Operate, incumbent look).

**Files:** `portal/src/app/(portal)/money/page.tsx`, `calendar/page.tsx`, `payouts/page.tsx` (redirect), components `money-statement.tsx`, `expense-form.tsx`, `deal-money.tsx` (payments + expenses on the own-deal page, "Mark paid" when received ≥ amount), `calendar-view.tsx`; `portal/src/lib/calendar.ts` (`monthGrid(month: 'YYYY-MM', weekStartsOn: 0|6|1): string[][]`, `groupByDay(items)`) with `calendar.test.ts`; nav (`/calendar`, `/money`; bar Home, Deals, Calendar, Money), i18n `money.*`, `cal.*`; Home attention adds own deliverables due within 7 days.

- [ ] Tests (portal): `monthGrid('2026-11', 6)` first cell `2026-10-31` (Saturday) and 5 or 6 rows of 7; `groupByDay` orders days and keeps overdue separate; nav test updated.
- [ ] Implement; verify `tsc`, `npm test`, detector; browser en/ar at 375 and desktop: record a payment, see owed drop and Mark paid; add an expense; Money totals; Calendar month and agenda; `/payouts` redirects.
- [ ] Commit `feat(portal): Money and Calendar; payouts become Peak income`.
