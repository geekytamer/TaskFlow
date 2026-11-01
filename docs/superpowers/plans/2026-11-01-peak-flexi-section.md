# Peak Flexi section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One "Peak Flexi" sidebar section in TaskFlow (overview, applications, accounts, campaign requests, leads, settings) with account controls (adjust, freeze, close), per-company settings, an account timeline, and client terms acceptance.

**Architecture:** Extend `FlexiStore` (`backend/src/finance/flexi.ts`) with settings, events and account state; new staff routes in `backend/src/portal/staff-flexi-routes.ts` (overview, accounts, requests, leads, settings); staff pages under `frontend/src/app/(app)/flexi/*` reusing phase 1 components; portal gets the terms checkbox, a frozen card and a real `payWith` field.

**Tech Stack:** Express + better-sqlite3 (node:test + supertest on `dist/`), Next.js staff app, Next.js portal.

**Spec:** `docs/superpowers/specs/2026-11-01-peak-flexi-section-design.md`

## Global Constraints

- Defaults: standard balance **850**, down payment **40%**, allowed months **[3, 6, 12]**, activation max months **6**, increase max months **12**.
- Account states: `'active' | 'frozen' | 'closed'` (null = never activated). Available is 0 when frozen or closed. No increase while frozen.
- Event kinds: `applied`, `approved`, `rejected`, `withdrawn`, `adjusted`, `frozen`, `unfrozen`, `closed`, `terms_accepted`.
- `FLEXI_REVIEW` (Admin, Manager, Accountant) sees the section and decides applications; new `FLEXI_MANAGE` = `invoices:flexi.manage` (Admin, Accountant) adjusts, freezes, unfreezes, closes, edits settings, invites leads.
- Every manage action needs a reason (1-500 chars); balances stay above 0.
- Arabic copy says رصيد, Gulf Arabic, no en/em dashes in dictionary strings; amounts in the company currency.
- Migrations: `147_peak_flexi_section`, `148_flexi_manage_grants`. Do not edit `route-permissions.ts` by hand.
- Backend tests run against `dist/` after `npm run build` (never hide build output). Disk is tight: run targeted test files; CI runs the full suite.

## Review Focus

1. **Freeze while a client has an open increase** → the increase can still be decided by staff, but the client sees "paused" and cannot open a new one. Pinned in Task 1.
2. **Terms edited while a client has the form open** → submit with the old version gets 400 with a clear message, not a silent accept. Pinned in Task 3.
3. **Lead without email** → invite refused (400), lead stays listed. Pinned in Task 2.
4. **Adjust to 0 or negative, or below what is used** → 0/negative refused (400); below used is allowed (spec: above 0) but available shows 0. Pinned in Task 1.
5. **Closed account applies again** → accepted as a new activation, state back to active on approval. Pinned in Task 1.

---

### Task 1: Store — settings, events, state, terms

**Files:**
- Modify: `backend/src/finance/flexi.ts`, `backend/src/data/store.ts` (migrations 147, 148; deps; clients decode), `backend/src/types.ts` (`Client.flexiState?`), `backend/src/permissions/record-rules.ts` (`FLEXI_MANAGE`), `backend/test/api.test.js` (migration list)
- Test: `backend/test/flexi-store.test.js` (extend)

**Interfaces (produces):**
- `type FlexiState = 'active' | 'frozen' | 'closed'`; `FlexiBalance` gains `state: FlexiState | null`.
- `interface FlexiSettings { standardAmount: number; defaultUpfrontPct: number; allowedMonths: number[]; activationMonths: number; increaseMonths: number; termsVersion: number; termsAr: string; termsEn: string; updatedAt: string | null }`
- `store.flexi.settings(companyId): FlexiSettings` (defaults when no row; default terms text exported as `DEFAULT_TERMS_AR/EN`)
- `store.flexi.saveSettings(companyId, patch: Partial<Omit<FlexiSettings,'termsVersion'|'updatedAt'>>, userId): FlexiSettings` (version +1 when either terms text changes; validates numbers, months ⊂ 1..36, activation/increase months in allowedMonths)
- `store.flexi.events(contactId): FlexiEvent[]` newest first; `FlexiEvent = { id, kind, amountBefore, amountAfter, upfrontPct, maxMonths, note, actorUserId, actorPortalUserId, actorName, applicationId, createdAt }`
- `store.flexi.adjust(contactId, { amount?, upfrontPct?, maxMonths?, reason, userId })`, `freeze(contactId, { reason, userId })`, `unfreeze(...)`, `close(...)` → `FlexiBalance`
- `submit` gains `termsVersion: unknown` (must equal `settings().termsVersion`, else 400 "The terms changed. Please read and accept them again."), stores `termsVersion`, `termsAcceptedAt`, writes `applied` + `terms_accepted` events; approve/reject/withdraw write their events; approve sets `flexiState = 'active'`.
- Approve defaults come from settings (`defaultUpfrontPct`, `activationMonths`/`increaseMonths`); activation of a `closed` client allowed.

- [ ] **Step 1: Failing tests** in `flexi-store.test.js` (update `setup().activate/increase` to pass `termsVersion: 1`):
  - `settings default to 850 / 40% / [3,6,12] / 6 / 12, version 1`
  - `saving terms bumps the version; saving numbers alone does not`
  - `approval uses saved settings` (save standard 1000, upfront 30, activationMonths 3 → approve without terms → 30% / 3 months)
  - `submit refuses a stale terms version and stores the accepted one` (+ `terms_accepted` event)
  - `freeze makes available 0 and blocks a new increase; unfreeze restores` (Review Focus 1: a pending increase stays decidable)
  - `adjust needs a reason and a positive amount; below used is allowed and available is 0` (Review Focus 4)
  - `close sets balance 0 and state closed; a closed client can activate again` (Review Focus 5)
  - `every action writes an event with before/after and the actor`
  - `only active accounts can be frozen; only frozen can be unfrozen` (409 otherwise)
  - `146-style backfill: FLEXI_MANAGE granted to admin and accountant groups` (delete grants + `148` row, reopen)
- [ ] **Step 2:** `npm run build && NODE_ENV=test node --test test/flexi-store.test.js` → FAIL.
- [ ] **Step 3:** Implement migration 147 (tables `flexi_settings`, `flexi_events`; ALTER `clients` add `flexiState`; ALTER `flexi_applications` add `termsVersion`, `termsAcceptedAt`; ALTER `portal_campaign_requests` add `payWith TEXT NOT NULL DEFAULT 'full'`; set `flexiState='active'` where `flexiEnabled=1`; back-fill `applied` + decision events from existing applications), 148 (grants), the store methods.
- [ ] **Step 4:** Re-run → PASS; also `test/staff-flexi.test.js test/portal-flexi.test.js` → PASS after updating their submits to send `termsVersion: 1`.
- [ ] **Step 5:** Commit `feat(flexi): settings, account events and state, terms version`.

### Task 2: Staff API for the section

**Files:**
- Modify: `backend/src/portal/staff-flexi-routes.ts` (new routes), `backend/src/portal/staff-routes.ts` (`canManageFlexi` dep + manage-guard), `backend/src/server.ts` (wire `FLEXI_MANAGE`)
- Test: `backend/test/staff-flexi-section.test.js`

**Interfaces (produces; review-guard unless marked manage):**
- `GET /companies/:c/flexi/overview` → `{ currency, totals: { balance, used, available, active, frozen, waiting }, alerts: { staleApplications: App[], nearLimit: Account[], frozen: Account[], overBudgetRequests: Req[] } }` (stale = `new` older than 2 days; nearLimit = used/balance ≥ 0.8)
- `GET /companies/:c/flexi/accounts?state=` → `Account[]` where `Account = { contactId, name, balance, used, available, usedPct, upfrontPct, maxMonths, state, since }` (since = first approval event)
- `GET /companies/:c/flexi/accounts/:contactId` → `{ account, events, applications, openInvoices: { id, number, outstanding, dueDate }[], requests: Req[] }`
- manage: `POST .../accounts/:contactId/adjust|freeze|unfreeze|close` body per Task 1
- `GET /companies/:c/flexi/requests` → `Req[]` = `{ id, contactId, clientName, title, budget, payWith, available, accountState, flag: 'over_budget' | 'no_account' | null, createdAt }` (contacts with a Flexi account, or `payWith='flexi'`)
- `GET /companies/:c/flexi/leads` → contacts tagged `peak-flexi` with no portal user: `{ contactId, company, person, phone, email, crNumber, services, role, createdAt }` (CR/services/role parsed from the join notes lines `Commercial registration:`, `Services wanted:`, `Role:`)
- manage: `POST /companies/:c/flexi/leads/:contactId/invite` → adds role `Client`, `store.portal.inviteUser` (audience client, role `client_admin`), sends via `deps.sendInvite`; 400 without email
- `GET /companies/:c/flexi/settings` (review), `PUT` (manage)

- [ ] **Step 1: Failing tests:** overview totals and each alert kind on a seeded company; accounts list/filter and file contents; manage actions 403 for a Manager, 200 for Accountant/Admin; requests flags (`over_budget`, `no_account`); leads list excludes invited contacts; invite adds role + portal user, 400 without email (Review Focus 3); settings GET/PUT with version bump; cross-company ids → 404 on every new `:contactId` route; Employee → 403.
- [ ] **Step 2:** build + run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** build + run → PASS, plus phase 1 staff/portal flexi tests.
- [ ] **Step 5:** Commit `feat(flexi): staff API for overview, accounts, requests, leads, settings`.

### Task 3: Portal API — terms and payWith

**Files:**
- Modify: `backend/src/portal/client-flexi-routes.ts` (GET returns `state`, `terms: { version, ar, en }`; POST passes `termsVersion`), `backend/src/portal/requests.ts` (`parseBrief` accepts `payWith: 'full' | 'flexi'`, default `'full'`), `backend/src/portal/requests-store.ts` + `client-requests-routes.ts` (store/return `payWith`)
- Test: `backend/test/portal-flexi.test.js`, `backend/test/portal-requests.test.js` (extend)

- [ ] **Step 1: Failing tests:** `GET /client/flexi` shows terms and state; POST without/stale `termsVersion` → 400 with "The terms changed" (Review Focus 2); frozen client sees `state: 'frozen'`, available 0; a request with `payWith: 'flexi'` round-trips, an invalid value → 400.
- [ ] **Step 2–4:** build, fail, implement, pass.
- [ ] **Step 5:** Commit `feat(flexi): portal terms acceptance and payWith on requests`.

### Task 4: Staff app — section, overview, applications, accounts

**Files:**
- Create: `frontend/src/app/(app)/flexi/page.tsx`, `flexi/applications/page.tsx`, `flexi/accounts/page.tsx`, `flexi/accounts/[contactId]/page.tsx`; `frontend/src/modules/flexi/components/{flexi-overview,flexi-accounts,flexi-account-file}.tsx`; `frontend/src/modules/flexi/lib/use-can-manage-flexi.ts`; `frontend/src/services/flexiService.ts` (all section endpoints)
- Move: `flexi-applications-page.tsx` → `frontend/src/modules/flexi/components/` (update imports); `crm/flexi/page.tsx` becomes a redirect to `/flexi/applications` keeping `?id=`
- Modify: `sidebar-nav.tsx` (new section `nav.section.flexi` after CRM: overview, applications, accounts, requests, leads, settings; remove CRM entry), `command-palette.tsx`, `nav-permissions.ts` (`/flexi*` → `invoices:flexi.review`, `/flexi/settings` → `invoices:flexi.review`), `i18n-context.tsx`, contact `flexi-section.tsx` (link to account file)

- [ ] **Step 1:** Implement; manage buttons only when `useCanManageFlexi()`; each action opens a dialog with a required reason.
- [ ] **Step 2:** `npx tsc --noEmit && npm test` → clean.
- [ ] **Step 3:** Commit `feat(flexi): staff section with overview, applications and accounts`.

### Task 5: Staff app — requests, leads, settings

**Files:**
- Create: `frontend/src/app/(app)/flexi/{requests,leads,settings}/page.tsx`, `frontend/src/modules/flexi/components/{flexi-requests,flexi-leads,flexi-settings}.tsx`

- [ ] **Step 1:** Implement (requests link to `/crm/client-requests?open=<id>`; leads invite button disabled without email; settings form with months as chips and two terms textareas, read-only without manage).
- [ ] **Step 2:** tsc + tests clean.
- [ ] **Step 3:** Commit `feat(flexi): staff requests, leads and settings pages`.

### Task 6: Portal UI — terms, frozen card, payWith

**Files:**
- Modify: `portal/src/lib/flexi.ts` (types: `state`, `terms`; `flexiCardState` returns `'frozen'` when `state === 'frozen'`), `portal/src/lib/flexi.test.ts`, `portal/src/components/flexi-card.tsx` (frozen face), `portal/src/components/flexi-apply-form.tsx` (terms `<details>` + required checkbox, sends `termsVersion`), activate/increase pages (pass terms), `portal/src/components/request-wizard.tsx` (send `payWith`, stop writing the pay line into the objective), `portal/src/lib/i18n.ts`

- [ ] **Step 1: Failing test:** `flexiCardState` → `'frozen'` for a frozen account (and `'enabled'` stays for active).
- [ ] **Step 2–4:** fail, implement, `npm test && npx tsc --noEmit` pass.
- [ ] **Step 5:** Commit `feat(flexi): portal terms acceptance, paused card, pay choice as data`.

### Task 7: Whole-branch check

- [ ] Targeted backend tests (all flexi + portal-requests + api), frontend and portal tsc + tests.
- [ ] Prod-build browser run on the local stack (flexi-api / flexi-web / flexi-client): every section page at 1280 and 390, freeze → portal paused card, terms checkbox, lead invite.
- [ ] Final fresh review; fix pass; update memory; push and open PR (CI runs the full suite); deploy on the owner's word.
