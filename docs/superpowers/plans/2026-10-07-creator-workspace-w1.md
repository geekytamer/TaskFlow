# Creator Workspace W1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Influencers keep their own contacts and deals (with deliverables, files, notes) in the portal, see Peak assignments as deals beside them, and staff see it all on the influencer's contact page.

**Architecture:** A `backend/src/workspace/` module with its own store (`store.workspace`), portal routes under `/portal-api/influencer/workspace/*`, and one staff route module (`src/routes/workspace.ts`). Peak assignments are mapped at read time from today's `toAssignmentDto`, never copied. The portal gains Deals and Contacts pages; Assignments redirects to Deals.

**Tech Stack:** Express + better-sqlite3, node:test + supertest; Next.js app router portal (server components, `/api/*` write proxies), Tailwind tokens from `ui.tsx`; staff app Next + shadcn.

**Spec:** `docs/superpowers/specs/2026-10-07-creator-workspace-design.md` (§1, §3, §4 Deals, §5, §6 Deals/Contacts, §7 Assignments, §9).

## Global Constraints

- Every `ws_*` query filters on `companyId` AND `ownerContactId`; another influencer's id answers 404, never 403.
- Amounts keep their own `currency`; no conversion; default currency = `ws_settings.defaultCurrency`, else the company currency.
- Deal statuses: `lead`, `confirmed`, `delivered`, `paid`, `cancelled`. Contact kinds: `brand`, `agency`, `manager`, `other`.
- Peak deals are read-only in the workspace and keep today's controls (respond, start, submit, publish).
- No staff route other than `src/routes/workspace.ts` reads `ws_*` tables.
- Staff workspace routes: Admin and Manager only.
- Portal writes go through `/api/*` POST proxies (`forwardWrite(..., 'influencer')`); updates and deletes are POSTs (`/x/:id`, `/x/:id/delete`).
- All copy in English and Arabic (`t()` keys in `portal/src/lib/i18n.ts`; `tr()` in the staff app). Phone first, 44px targets.
- Migrations pinned in `backend/test/api.test.js`; after route changes run `npm run authz:extract`.

## Review Focus

1. A deal whose brand contact is archived or deleted: deal still opens, shows the brand name it had (store the name on read via join; archived contacts still resolve).
2. A file upload that is not PDF/PNG/JPEG/WebP or over 10 MB: 400 with the existing portal messages, nothing stored.
3. Arabic and mixed-direction names in contacts and deals: `<bdi>` and `dir="auto"` on every user-entered string.
4. A Peak assignment declined or hidden by staff: never appears as a deal (same `isVisibleAssignment` rule).
5. Staff "make a Peak contact" clicked twice or by two people at once: one Peak contact (transaction + existing `peakContactId` check).

---

### Task 1: Workspace store and migration

**Files:**
- Create: `backend/src/workspace/workspace-store.ts`
- Modify: `backend/src/data/store.ts` (migration `119_creator_workspace`; `readonly workspace: WorkspaceStore`)
- Modify: `backend/test/api.test.js` (pin `119_creator_workspace`)
- Test: `backend/test/workspace-store.test.js`

**Interfaces:**
- Produces: `class WorkspaceStore` with, all scoped by `(companyId, ownerContactId)` as `Owner = { companyId: string; ownerContactId: string }`:
  - `contacts(o, { includeArchived? }): WsContact[]`, `contact(o, id): WsContact | undefined`, `addContact(o, input): WsContact`, `updateContact(o, id, patch): WsContact | undefined`, `archiveContact(o, id): boolean`, `setPeakContact(o, id, peakContactId): void`
  - `notes(o, wsContactId): WsNote[]`, `addNote(o, wsContactId, body): WsNote`
  - `deals(o): WsDeal[]`, `deal(o, id)`, `addDeal(o, input)`, `updateDeal(o, id, patch)`, `deleteDeal(o, id): boolean` (cascades deliverables and files)
  - `deliverables(o, dealId)`, `addDeliverable(o, dealId, input)`, `updateDeliverable(o, id, patch)`, `deleteDeliverable(o, id)`
  - `files(o, dealId): WsFileMeta[]`, `addFile(o, dealId, { fileName, mimeType, content })`, `fileContent(o, id): { meta, content } | undefined`, `deleteFile(o, id)`
  - `settings(o): { defaultCurrency: string | null }`, `setSettings(o, { defaultCurrency })`
  - `ownersWithData(companyId, ownerContactId): boolean` (for the staff section's "has a workspace")
- Types exported from the same file: `WsContact`, `WsNote`, `WsDeal`, `WsDeliverable`, `WsFileMeta`, `WsDealStatus`, `WsContactKind`.

- [ ] **Step 1: Write the failing test** `backend/test/workspace-store.test.js`:
  - `'a deal and its parts belong to one influencer'`: add a contact and deal for owner A; `deal(B, id)` is undefined; `updateDeal(B, id, …)` returns undefined and leaves A's deal unchanged; `deleteDeal(B, id)` is false.
  - `'deleting a deal removes its deliverables and files'`: after `deleteDeal(A, id)`, `deliverables(A, id)` and `files(A, id)` are `[]`.
  - `'an archived contact drops out of the list but still resolves'`: `contacts(A)` excludes it, `contact(A, id)` returns it with `archivedAt` set.
- [ ] **Step 2: Run** `cd backend && npm run build && NODE_ENV=test node --require ./test/helpers/loopback.js --test test/workspace-store.test.js` — fails (module missing).
- [ ] **Step 3: Implement** the migration (tables `ws_contacts`, `ws_contact_notes`, `ws_deals`, `ws_deliverables`, `ws_files`, `ws_settings` as spec §3, index on `(companyId, ownerContactId)` for each) and `WorkspaceStore`. Store dates as ISO strings; `amount` REAL nullable; `ws_files.content` BLOB.
- [ ] **Step 4: Run** the test file, then `npm test` — all pass.
- [ ] **Step 5: Commit** `feat(workspace): store and migration for influencer contacts and deals`.

### Task 2: Portal workspace API (contacts, notes, deals, deliverables, files)

**Files:**
- Create: `backend/src/workspace/portal-routes.ts` (`registerWorkspacePortalRoutes(router, store, companyId, requireInfluencerSession)`)
- Create: `backend/src/workspace/validation.ts` (`parseContact`, `parseDeal`, `parseDeliverable` from request bodies)
- Modify: `backend/src/portal/routes.ts` (register after influencer routes)
- Test: `backend/test/workspace-portal.test.js`

**Interfaces:**
- Consumes: Task 1 store; `readUpload` and `downloadHeaders` from `src/portal/files.ts`.
- Produces routes (prefix `/portal-api/influencer/workspace`), JSON DTOs with ISO dates:
  - `GET /contacts`, `POST /contacts`, `GET /contacts/:id` (contact + notes + its own deals), `POST /contacts/:id`, `POST /contacts/:id/archive`, `POST /contacts/:id/notes`
  - `GET /deals` (own + Peak, see Task 3), `POST /deals`, `GET /deals/:id` (deal + brand + deliverables + files), `POST /deals/:id`, `POST /deals/:id/delete`
  - `POST /deals/:id/deliverables`, `POST /deliverables/:id`, `POST /deliverables/:id/delete`
  - `POST /deals/:id/files` (body `{ fileName, contentBase64 }` like `/files`), `GET /files/:id/content`, `POST /files/:id/delete`
  - `GET /settings`, `POST /settings`

- [ ] **Step 1: Write the failing tests** (supertest against `createServer` with a portal company, two influencer sessions as in `portal-influencer.test.js`):
  - `'an influencer records a brand, a deal and a deliverable'`: create contact → deal with `wsContactId`, amount 500, currency `'AED'` → deliverable due `2026-11-01`; `GET /deals/:id` returns them; brand name present.
  - `'another influencer gets 404 for every workspace id'`: B's GET/POST on A's contact, deal, deliverable and file ids → 404.
  - `'bad input is refused'`: deal status `'won'` → 400; amount `-5` → 400; currency `'dollars'` → 400 (must match `/^[A-Z]{3}$/`); contact kind `'friend'` → 400.
  - `'files: real type checked, size capped'` (Review Focus 2): HTML bytes named `x.pdf` → 400; 10 MB + 1 byte → 413 (same status the existing `/files` route returns); a PDF → 201 and downloadable by owner only.
  - `'a deal whose brand is archived still opens with the brand name'` (Review Focus 1).
  - `'a client session cannot reach workspace routes'` → 401/404 as for other influencer routes.
- [ ] **Step 2: Run** the test file — fails.
- [ ] **Step 3: Implement** routes and validation. Text fields trimmed with length caps (name 120, title 160, notes 4000, note body 4000); dates `YYYY-MM-DD`; `endDate >= startDate`.
- [ ] **Step 4: Run** test file and `npm test`.
- [ ] **Step 5: Commit** `feat(workspace): portal API for contacts, deals, deliverables and files`.

### Task 3: Peak assignments as deals

**Files:**
- Create: `backend/src/workspace/peak-mirror.ts`
- Modify: `backend/src/workspace/portal-routes.ts` (`GET /deals` merges; `GET /deals/peak-:assignmentId` returns the Peak deal)
- Test: `backend/test/workspace-peak.test.js`

**Interfaces:**
- Consumes: `toAssignmentDto`, `isVisibleAssignment` (`src/portal/influencer.ts`), `payoutsFor` (`src/portal/payouts.ts`).
- Produces: `peakDeals(store, companyId, contact, currency): PeakDeal[]` where `PeakDeal = { id: 'peak-<assignmentId>', source: 'peak', title, brand, amount, currency, status: WsDealStatus, startDate, endDate, assignment: AssignmentDto }`. Own deals carry `source: 'own'`. Status map: `awaiting_reply → lead`, `confirmed → confirmed`, `completed → delivered`, and `paid` when every payout bill for that campaign is paid; `declined`/`cancelled` assignments are omitted.

- [ ] **Step 1: Write the failing tests:**
  - `'a confirmed Peak assignment appears as a confirmed Peak deal'` with campaign name as title and agreed rate as amount.
  - `'declined, cancelled and hidden assignments never appear'` (Review Focus 4).
  - `'a completed assignment whose payouts are all paid shows as paid'`.
  - `'GET /deals lists own and Peak deals; ?source=peak and ?source=own filter'`.
- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement** `peakDeals` and the merge (sort by most recent of startDate/createdAt, newest first).
- [ ] **Step 4: Run** test file and `npm test`.
- [ ] **Step 5: Commit** `feat(workspace): Peak assignments appear as deals`.

### Task 4: Staff "Work outside Peak" API and making a Peak contact

**Files:**
- Create: `backend/src/routes/workspace.ts` (`registerWorkspaceRoutes(app, ctx)`)
- Create: `backend/src/workspace/staff-view.ts` (`workspaceSummary(store, companyId, contactId)`)
- Modify: `backend/src/server.ts` (register after the contacts section), `backend/src/scripts/extract-gates.ts` only if the route's module does not infer as `contacts`
- Modify: `backend/src/data/store.ts` (migration `120_workspace_staff_permission`: grant `contacts:workspace.read` and `contacts:workspace.write` — the exact qualified names `npm run authz:extract` produces — to existing Admin and Manager groups, following `116_shipments_write`)
- Test: `backend/test/workspace-staff.test.js`

**Interfaces:**
- Routes: `GET /contacts/:id/workspace` → `{ contacts: [{ id, name, kind, company, email, phone, peakContactId }], deals: [{ id, title, brandId, brandName, amount, currency, status, startDate, endDate }], byBrand: [{ brandId, brandName, currency, total, deals }], lastActivityAt }`; `POST /contacts/:id/workspace/contacts/:wsContactId/peak-contact` → `{ peakContactId }`.
- Both: `requireCompanyRoles(req, contact.companyId, ['Admin', 'Manager'])`; 404 when the contact is not in the caller's company or the workspace contact is not that influencer's.

- [ ] **Step 1: Write the failing tests:**
  - `'staff see an influencer's outside clients and totals'`: two own deals with brand X in AED and one in OMR → `byBrand` has two rows for X (one per currency).
  - `'Employee and Accountant are refused'` → 403.
  - `'making a Peak contact twice gives one contact'` (Review Focus 5): two calls → same id; `listContacts` count grows by one; contact is Organization, role Lead, email/phone/company copied, ownerUserId = caller.
  - `'workspace data stays out of Peak's screens'`: with a workspace brand named `Zebra Poison`, Peak contacts list, `/companies/:id/search?q=Zebra`, opportunities and dashboard responses contain no `Zebra Poison` (until made a Peak contact).
- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement**; run `npm run authz:extract`; add the grant migration with the generated permission names; pin it.
- [ ] **Step 4: Run** test file, `npm test`, and confirm `git diff` of catalogue/seed shows only the new permissions.
- [ ] **Step 5: Commit** `feat(workspace): staff view of an influencer's outside work; make a Peak contact`.

### Task 5: Portal Deals and Contacts (and the Assignments redesign)

Use the impeccable skill (Operate mode, refinement on the incumbent portal look; `ui.tsx` building blocks) for the layout of these pages.

**Files:**
- Create: `portal/src/lib/workspace.ts` (+ `workspace-types.ts`): `getDeals(source?)`, `getDeal(id)`, `getContacts()`, `getContact(id)`, `getWorkspaceSettings()`
- Create pages: `portal/src/app/(portal)/deals/page.tsx`, `deals/[id]/page.tsx`, `deals/new/page.tsx`, `contacts/page.tsx`, `contacts/[id]/page.tsx`
- Create components: `deal-form.tsx`, `deliverable-rows.tsx`, `deal-files.tsx`, `contact-form.tsx`, `contact-notes.tsx`, `offer-card.tsx` (Peak offer awaiting reply: accept/decline, reusing `AssignmentActions`)
- Create proxies under `portal/src/app/api/workspace/...` mirroring Task 2's write routes, each `forwardWrite(request, path, body, 'influencer')`
- Modify: `portal/src/lib/nav.ts` (influencer: primary Home, Deals, Calendar placeholder omitted until W2 → Home, Deals, Messages, Contacts; bar Home, Deals, Messages, Payouts until W2), `portal/src/app/(portal)/assignments/page.tsx` (redirect to `/deals?source=peak`), `portal/src/lib/i18n.ts` (keys `deal.*`, `wsc.*`, `nav.deals`, `nav.contacts`), `nav-icon.tsx` (deals, contacts icons)
- Test: `portal/src/lib/workspace.test.ts` (pure helpers: `dealSort`, `statusLabelKey`)

- [ ] **Step 1: Write the failing test** for `dealSort` (offers awaiting reply first, then by most recent date) and `statusLabelKey` (every `WsDealStatus` maps to an existing i18n key in both languages).
- [ ] **Step 2: Run** `cd portal && npm test` — fails.
- [ ] **Step 3: Implement** pages: Deals list = offer cards on top, then compact rows (title, brand, amount, status text, next due deliverable) with a source filter (All / Mine / Peak); deal page = header figures, deliverables with inline add/done/remove (Peak deliverables use `WorkControls`), files, notes; Contacts list and page with notes timeline and their deals. Empty states say how to add the first deal/contact.
- [ ] **Step 4: Verify** `npx tsc --noEmit`, `npm test`, and in the browser on `localhost:9004` (English and Arabic, phone width 375 and desktop): create contact → deal → deliverable → upload file → mark done; accept a Peak offer from Deals; `/assignments` redirects. Screenshot both widths.
- [ ] **Step 5: Commit** `feat(portal): Deals and Contacts for influencers; assignments become Peak deals`.

### Task 6: Staff app "Work outside Peak"

**Files:**
- Create: `frontend/src/modules/contacts/components/workspace-section.tsx`, `frontend/src/services/workspaceService.ts`
- Modify: `frontend/src/modules/contacts/components/contact-detail-page.tsx` (render for influencer contacts with a portal account, Admin/Manager)

- [ ] **Step 1: Implement** the section: clients table (name, kind, deals, totals per currency, "Make a Peak contact" / link to the Peak contact), recent deals list; bilingual `tr()`.
- [ ] **Step 2: Verify** `npx tsc --noEmit`, lint, browser on `localhost:9002` as an Admin: section shows data created in Task 5; button creates the contact once; an Employee does not see the section.
- [ ] **Step 3: Commit** `feat(staff): an influencer's work outside Peak on their contact page`.
