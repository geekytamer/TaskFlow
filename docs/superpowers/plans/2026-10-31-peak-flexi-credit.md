# Peak Flexi credit balance (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients apply for a Peak Flexi balance (activation with CR, increase with statement + solvency) from the portal; staff approve or reject in TaskFlow; the balance shows in both.

**Architecture:** A `FlexiStore` (`backend/src/finance/flexi.ts`) owns `flexi_applications` and the Flexi terms on `clients`; the balance is the existing `clients.creditLimit`, used = `store.clientCreditExposure`. Client routes register beside the other client portal routes; staff routes live in the portal staff router, gated by a new record rule. Staff UI follows the Client requests page; portal UI is a home card plus two forms.

**Tech Stack:** Express + better-sqlite3 (backend, node:test + supertest against `dist/`), Next.js staff app (`frontend/`), Next.js portal (`portal/`, node:test via tsx).

**Spec:** `docs/superpowers/specs/2026-10-31-peak-flexi-credit-design.md`

## Global Constraints

- Standard balance **850** (OMR, company currency); default terms **40%** down, **6** months; an approved increase defaults max months to **12**.
- Activation needs a CR number + ≥1 file. Increase needs Flexi enabled, `requestedAmount > creditLimit`, ≥2 files.
- One open (`new`) application per contact, any kind.
- Approved amount must be `> 0` and may be below the requested amount.
- Files: existing portal upload rules (PDF/PNG/JPEG/WebP, 10 MB).
- Arabic copy says **رصيد**, never **حد**. Gulf Arabic; no en/em dashes in dictionary strings; en and ar dictionaries keep identical keys.
- Never edit `backend/src/permissions/route-permissions.ts` by hand.
- Backend tests run against `dist/`: always `npm run build` (output visible, never piped to /dev/null) before `node --test`.

## Review Focus

1. **Another company's client** guesses an application or file id → 404, never the data. Pinned in Task 2.
2. **Double submit** (two taps) → second open application refused with 409, no duplicate. Pinned in Task 1 and Task 2.
3. **Approve twice / approve a withdrawn or rejected application** → 409, limit unchanged. Pinned in Task 1.
4. **Contact with no finance client** approved → a client is created and linked once; a second approval for the same contact reuses it. Pinned in Task 1.
5. **Reviewer types 0, a negative, or text as the amount** → 400. Pinned in Task 3.

---

### Task 1: Data and `FlexiStore`

**Files:**
- Create: `backend/src/finance/flexi.ts`
- Modify: `backend/src/data/store.ts` (migration `145_peak_flexi_credit` after `144_project_priority_postpone`; `readonly flexi: FlexiStore` beside `assets`; widen the `portal_files` CHECK; `Client` decode includes the three new columns)
- Modify: `backend/src/types.ts` (`Client` gains `flexiEnabled?: boolean; flexiUpfrontPct?: number | null; flexiMaxMonths?: number | null`)
- Modify: `backend/src/portal/thread-store.ts` (`parentType` union and `attach`/`filesOf` parent type accept `'flexi_application'`)
- Test: `backend/test/flexi-store.test.js`

**Interfaces:**
- Produces:
  - `type FlexiKind = 'activation' | 'increase'`, `type FlexiStatus = 'new' | 'approved' | 'rejected' | 'withdrawn'`
  - `interface FlexiApplication { id; companyId; contactId; clientId: string | null; kind; status; crNumber: string | null; requestedAmount: number | null; approvedAmount: number | null; upfrontPct: number | null; maxMonths: number | null; note: string | null; reviewNote: string | null; createdBy: string; reviewedBy: string | null; createdAt: string; reviewedAt: string | null }`
  - `interface FlexiBalance { enabled: boolean; balance: number; used: number; available: number; upfrontPct: number; maxMonths: number; clientId: string | null }`
  - `export const FLEXI_STANDARD = 850, FLEXI_DEFAULT_UPFRONT = 40, FLEXI_DEFAULT_MONTHS = 6, FLEXI_INCREASE_MONTHS = 12`
  - `class FlexiError extends Error { status: 400 | 404 | 409 }`
  - `store.flexi.submit(input: { companyId; contactId; kind; crNumber?; requestedAmount?; note?; fileIds: string[]; createdBy: string }): FlexiApplication` (attaches files via `store.thread.attach(fileIds, { type: 'flexi_application', id }, owner)` in the same transaction)
  - `store.flexi.withdraw(id: string, contactId: string): FlexiApplication`
  - `store.flexi.approve(id: string, input: { amount: number; upfrontPct?: number; maxMonths?: number; reviewNote?: string; reviewerId: string }): FlexiApplication`
  - `store.flexi.reject(id: string, input: { reviewNote: string; reviewerId: string }): FlexiApplication`
  - `store.flexi.get(id)`, `store.flexi.list(companyId, filter?: { status?: FlexiStatus; contactId?: string })`, `store.flexi.openFor(contactId)`, `store.flexi.latestFor(contactId)`
  - `store.flexi.balanceOf(contactId: string): FlexiBalance` (`available = max(0, creditLimit - clientCreditExposure)`; disabled clients report zeros with default terms)
- `FlexiStore` takes `(db, deps: { clientOfContact(contactId): Client | undefined; createClientFor(contactId): Client; exposure(clientId): number; attach: ThreadStore['attach'] })`, wired from `DataStore` so the module never imports the store class.

- [ ] **Step 1: Write failing tests** in `backend/test/flexi-store.test.js` (build a `DataStore` on a tmp db like `portal-requests.test.js`; upload files with `store.thread.addFile`):
  - `activation approve creates and links a client with 850 / 40% / 6 months`: after `approve(id, { amount: 850, reviewerId })`, `contact.clientId` set, `client.creditLimit === 850`, `flexiEnabled === true`, `balanceOf(contact).available === 850`.
  - `approve with a lower amount and custom terms` → `creditLimit === 500`, `upfrontPct 35`, `maxMonths 3`.
  - `increase approval defaults to 12 months` → `maxMonths === 12`, `creditLimit === 3000`.
  - `reject keeps the limit` → status `rejected`, `reviewNote` kept, `creditLimit` unchanged.
  - `second open application is refused` → `FlexiError` status 409 (both kinds).
  - `activation needs CR and a file; increase needs Flexi, amount above balance and two files` → 400 each.
  - `approve twice, or approve a withdrawn/rejected application` → 409, limit unchanged.
  - `existing client is reused` → a contact already linked to a client keeps that `clientId`.
  - `used comes from open invoices` → create an issued invoice of 300 for the client; `balanceOf().used === 300`, `available === 550`.
  - `files attach to the application` → `store.thread.filesOf('flexi_application', id).length === 2`.
- [ ] **Step 2:** `cd backend && npm run build && node --test test/flexi-store.test.js` → FAIL (`store.flexi` undefined).
- [ ] **Step 3:** Implement migration 145 (ALTER `clients` x3; `CREATE TABLE flexi_applications` with CHECKs on kind/status and indexes on `(companyId, status)` and `(contactId, status)`; rebuild `portal_files` with `parentType IN ('message','request','flexi_application')`, copying rows and recreating its indexes), the types, `thread-store` union, and `FlexiStore`. Approve/reject/withdraw run in `db.transaction` and refuse unless status is `new`.
- [ ] **Step 4:** Re-run → PASS. Also `node --test test/portal-requests.test.js test/portal-thread*.test.js` → PASS (table rebuild kept files working).
- [ ] **Step 5:** Commit `feat(flexi): applications table, Flexi terms on clients, FlexiStore`.

### Task 2: Client portal API

**Files:**
- Create: `backend/src/portal/client-flexi-routes.ts` (`registerClientFlexiRoutes(router, store, companyId, requireClientSession)`)
- Modify: `backend/src/portal/routes.ts` (register beside `registerClientRequestRoutes`)
- Test: `backend/test/portal-flexi.test.js`

**Interfaces:**
- Consumes: Task 1 `store.flexi.*`, `FlexiError`; `notifyManager`, `raiseFollowup` from `portal/common.ts`; `fileDto` from `portal/thread.ts`.
- Produces (client audience, session-scoped to `session.contactId`):
  - `GET /portal-api/client/flexi` → `{ balance: FlexiBalance minus clientId, currency, open: ApplicationDto | null, last: ApplicationDto | null }`
  - `POST /portal-api/client/flexi/applications` body `{ kind, crNumber?, requestedAmount?, note?, fileIds }` → 201 `ApplicationDto`
  - `POST /portal-api/client/flexi/applications/:id/withdraw` → 200 `ApplicationDto`
  - `ApplicationDto = { id, kind, status, requestedAmount, approvedAmount, reviewNote (only when rejected), createdAt, reviewedAt, files: fileDto[] }` (never `createdBy`, `reviewedBy`, internal notes)
  - `FlexiError` maps to its status with its message.

- [ ] **Step 1: Failing tests** (setup copied from `portal-requests.test.js` `build()`):
  - `a client activates with CR and a file; managers are notified and a follow-up is raised` → 201, `listNotifications(manager)` has one titled `Peak Flexi application: Al Noor Dates`, one follow-up on the contact.
  - `GET shows the open application, then the balance after staff approve` (approve via `store.flexi.approve`) → `balance.balance === 850`, `open === null`, `last.status === 'approved'`.
  - `double submit` → second POST 409, one row.
  - `another company's client cannot withdraw or see the application` (session for `rival`) → withdraw 404; `GET` shows `open: null`; `GET /portal-api/client/files/:id/content` for the application's file → 404.
  - `influencer audience cannot reach /client/flexi` → 401/403 as other client routes.
  - `the DTO leaks nothing internal` → response JSON contains none of `createdBy`, `reviewedBy`, reviewer email.
- [ ] **Step 2:** build + run → FAIL (404 route).
- [ ] **Step 3:** Implement; notify company Admins and Managers (same recipients as `portal/join.ts`) with link `/crm/flexi?id=<id>`, and `raiseFollowup` on the contact (`dueDays: 1`, title `Review the Peak Flexi application from <name>`).
- [ ] **Step 4:** build + run → PASS.
- [ ] **Step 5:** Commit `feat(flexi): client portal routes for balance and applications`.

### Task 3: Staff API and permission

**Files:**
- Modify: `backend/src/permissions/record-rules.ts` (add `FLEXI_REVIEW: { module: 'invoices', action: 'flexi.review', roles: ['Admin', 'Manager', 'Accountant'], description: 'Review Peak Flexi applications and see client balances.' }`)
- Create: `backend/src/portal/staff-flexi-routes.ts` (`registerStaffFlexiRoutes(router, deps)`), registered from `createPortalStaffRouter` in `backend/src/portal/staff-routes.ts`; add `canReviewFlexi(req, companyId)` to `PortalStaffDeps`, wired in `server.ts` next to `canManagePortal` as `allowsRule(req, companyId, 'FLEXI_REVIEW')`
- Generated: run `npm run authz:extract` and commit whatever it regenerates
- Test: `backend/test/staff-flexi.test.js`

**Interfaces:**
- Consumes: Task 1 store API.
- Produces (all `authMiddleware` + company access + `canReviewFlexi`, else 403):
  - `GET /companies/:companyId/flexi-applications?status=` → `StaffFlexiApplication[]` (`+ contactName, currentBalance, files`)
  - `GET /companies/:companyId/flexi-applications/:id` → one, with files
  - `POST /companies/:companyId/flexi-applications/:id/approve` body `{ amount, upfrontPct?, maxMonths?, reviewNote? }`
  - `POST /companies/:companyId/flexi-applications/:id/reject` body `{ reviewNote }` (required, 1-500 chars)
  - `GET /companies/:companyId/contacts/:contactId/flexi` → `{ balance: FlexiBalance, applications: StaffFlexiApplication[] }`
  - Papers download through the existing `/companies/:companyId/portal-files/:id/content`.

- [ ] **Step 1: Failing tests:**
  - `a manager approves with 850 and the client is told in their portal thread` → 200; `store.thread.messagesFor(company, contact)` last message mentions `850`.
  - `amount 0, -5, "abc", missing` → 400 each; limit unchanged.
  - `reject needs a reason` → 400 without, 200 with.
  - `an Employee gets 403; an Accountant can approve`.
  - `contact flexi summary returns balance and history`.
  - `audit log records approve and reject` (`store.listAuditLogs` or the existing audit query used in other tests).
- [ ] **Step 2:** build + run → FAIL.
- [ ] **Step 3:** Implement. On decision, `store.thread.addMessage` to the contact's account thread from the reviewer: approve `Your Peak Flexi balance is ready: <amount> <currency>.` / reject `We could not approve your Peak Flexi request: <reason>`. Write audit entries with the store's existing audit helper.
- [ ] **Step 4:** build + run → PASS; `npm run authz:extract`; `npm test` in `backend/` → PASS (authz consistency tests included).
- [ ] **Step 5:** Commit `feat(flexi): staff review routes and FLEXI_REVIEW rule`.

### Task 4: Staff app (TaskFlow)

**Files:**
- Modify: `frontend/src/services/portalAccessService.ts` (types `FlexiBalance`, `StaffFlexiApplication`; `listFlexiApplications`, `getFlexiApplication`, `approveFlexiApplication`, `rejectFlexiApplication`, `getContactFlexi`)
- Create: `frontend/src/app/(app)/crm/flexi/page.tsx` (guard like `crm/client-requests/page.tsx`, permission `invoices:flexi.review`)
- Create: `frontend/src/modules/portal-access/components/flexi-applications-page.tsx` (tabs New / Closed / All; row → Sheet with papers, Approve form: amount prefilled 850 for activation or requested amount for increase, down-payment %, max months; Reject with reason; honours `?id=` to open one)
- Create: `frontend/src/modules/contacts/components/flexi-section.tsx`; render it in `contact-detail-page.tsx` for organisation contacts with the Client role when the user has the permission
- Modify: `frontend/src/modules/layout/components/sidebar-nav.tsx`, `command-palette.tsx`, `modules/layout/lib/nav-permissions.ts` (`'/crm/flexi': 'invoices:flexi.review'`), `frontend/src/context/i18n-context.tsx` (en + ar labels; Arabic uses رصيد)

- [ ] **Step 1:** Implement services and page; labels via `tr(en, ar)` as the Client requests page does.
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit && npm run lint` → clean; existing frontend tests `npm test` → PASS.
- [ ] **Step 3:** Prod-mode check on the local stack: submit an application from a portal session, approve it in `/crm/flexi`, see the balance on the contact page. Screenshot.
- [ ] **Step 4:** Commit `feat(flexi): staff review page and contact balance section`.

### Task 5: Client portal UI

**Files:**
- Create: `portal/src/lib/flexi.ts` (`getFlexi()`, types, and pure `flexiCardState(data): 'none' | 'pending' | 'enabled' | 'rejected'`)
- Create: `portal/src/lib/flexi.test.ts`
- Create: `portal/src/app/api/flexi/applications/route.ts`, `portal/src/app/api/flexi/applications/[id]/withdraw/route.ts` (same-origin + session proxy, like `app/api/requests/route.ts`)
- Create: `portal/src/components/flexi-card.tsx` (home card), `portal/src/components/flexi-apply-form.tsx` (kind prop; uploads through `/api/files` like the request wizard)
- Create: `portal/src/app/(portal)/flexi/activate/page.tsx`, `portal/src/app/(portal)/flexi/increase/page.tsx` (client audience only, else `notFound()`; increase redirects to activate when not enabled)
- Modify: `portal/src/app/(portal)/page.tsx` (client home renders `FlexiCard` first), `portal/src/lib/i18n.ts` (`flexiCard.*`, `flexiApply.*` in en and ar)

**Interfaces:**
- Consumes: Task 2 endpoints.
- `flexiCardState`: `enabled` when `balance.enabled`; else `pending` when `open`; else `rejected` when `last?.status === 'rejected'`; else `none`.

- [ ] **Step 1: Failing test** `portal/src/lib/flexi.test.ts`: the four states above, plus `enabled wins over an open increase` (enabled + open increase → `enabled`, and the card shows "under review" for the increase).
- [ ] **Step 2:** `cd portal && npm test` → FAIL.
- [ ] **Step 3:** Implement card and forms. Copy (ar): card none `فعّل رصيدك 850 ر.ع` / `بسجلك التجاري بس`; pending `طلبك قيد المراجعة`; enabled `رصيدك في بيك فلكسي`, `المستخدم`, `المتاح`, `دفعة مقدمة {p}% · لين {m} أشهر`, button `اطلب زيادة الرصيد`; rejected shows the reason and `قدّم مرة ثانية`. Increase form labels: `المبلغ اللي تبيه`, `كشف حساب آخر 3 أشهر`, `أوراق الملاءة`.
- [ ] **Step 4:** `npm test` → PASS; `npx tsc --noEmit` clean; prod build `PORTAL_AUDIENCE=client npx next build` succeeds; screenshots of the four card states at 390px and 1280px with no horizontal overflow.
- [ ] **Step 5:** Commit `feat(flexi): balance card and application forms in the client portal`.

### Task 6: Whole-branch check

- [ ] `backend: npm run build && npm test`, `frontend: npx tsc --noEmit && npm test`, `portal: npm test && npx tsc --noEmit` → all PASS.
- [ ] Prod-mode run of the full flow on the local stack (motion-api 4015 + motion-client 9013 + staff app): activation → approve 600 → card shows 600 / used 0 → increase with two files → approve 3,000 → card shows 3,000 and 12 months.
- [ ] Update the memory file `peak-flexi.md` with what shipped; commit; open the PR to `master` (deploy only on the owner's word).
