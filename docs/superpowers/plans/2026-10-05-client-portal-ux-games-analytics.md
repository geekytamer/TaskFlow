# Client Portal UX, Brand Games Report and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the client portal's UX on a Peak-branded, Stripe/Mercury-grade shell, add a brand games report, and add analytics for clients and influencers.

**Architecture:** Backend adds one additive migration, allow-listed DTO modules (`games/brand-report.ts`, `portal/analytics.ts`) and client/influencer routes registered in `portal/routes.ts`. The portal (Next 15, one build per audience) gets a new shell (desktop sidebar, phone bottom bar), route-group loading/error/not-found states, pure helpers in `lib/` written test first, and server-rendered SVG charts.

**Tech Stack:** Express + better-sqlite3 (backend, `node --test` + supertest on `dist/`), Next 15 / React 18 / Tailwind 3 (portal, `node --test` via tsx), Next + shadcn (staff frontend).

**Spec:** `docs/superpowers/specs/2026-10-05-client-portal-ux-and-games-report-design.md`

## Global Constraints

- Clients never see influencer rates, costs, margins, internal notes or staff-only data; influencers never see market-rate benchmarks.
- Every new client- or influencer-readable shape is an allow-listed DTO with a poison test; each secrecy guard is mutation-checked (break, see red, restore).
- Additive DB changes only: migration `099_game_client_link` appended last in `backend/src/data/store.ts`, id pinned in `backend/test/api.test.js`.
- Messages stay append-only.
- Portal writes go through `portal/src/app/api/*` with `forwardWrite` (POST, same-origin); downloads through `backendDownload` (GET).
- `'use client'` files never import anything reaching `next/headers`; browser-safe types in `*-types.ts`.
- Colours are CSS-variable tokens through `color-mix(... <alpha-value> ...)` in `portal/tailwind.config.ts`.
- Every string in `portal/src/lib/i18n.ts` in en and ar, no em/en dashes; `dir="auto"` on typed text, `<bdi>` for handles/numbers, `ar-u-nu-latn`.
- Touch targets ≥44px; no horizontal scroll at 375px.
- No AI filler copy.
- Peak brand values are an open input; tokens are structured so only values change when they arrive.

## Review Focus

1. A game linked to client A, viewed by client B's user → 404 everywhere (report, CSV, PDF, lobby route). Test in Task 2.
2. A game with zero events / zero players → report renders zeros and an empty-chart state, not a crash or NaN. Test in Task 2 (backend) and Task 9 (chart helper with empty series).
3. Analytics with results but no invoices, or invoices in two currencies → cost per result is `null` (dash) or per currency, never mixed. Test in Task 4.
4. Influencer with no connected account → analytics answers with `growth: null`, `audience: null`, not 500. Test in Task 5.
5. Invoice issued from a template with no bank accounts → `payment.accounts` is `[]` and instructions may be null. Test in Task 6.

---

### Task 1: Link a game to a client (migration, store, staff endpoint)

**Files:**
- Modify: `backend/src/data/store.ts` (append migration `099_game_client_link`: `ALTER TABLE games ADD COLUMN clientContactId TEXT; CREATE INDEX IF NOT EXISTS idx_games_client ON games (companyId, clientContactId);`)
- Modify: `backend/src/games/games-store.ts` (`Game.clientContactId: string | null`; `forClient(companyId, contactId): Game[]`; `setClient(id, contactId | null)`)
- Modify: `backend/src/games/staff-routes.ts` (`PUT ${base}/:id/client`; `view()` adds `clientContactId`, `clientName`)
- Modify: `backend/test/api.test.js` (pin `'099_game_client_link'`)
- Test: `backend/test/brand-games.test.js`

**Interfaces:**
- Produces: `store.games.forClient(companyId: string, contactId: string): Game[]` (published or not; callers filter), `store.games.setClient(id: string, contactId: string | null): Game | undefined`.

- [ ] Step 1: test `staff link a game to a client`: admin PUT `{contactId: client.id}` → 200 and GET game has `clientContactId`, `clientName: 'Al Noor Dates'`; manager → 403; influencer contact → 400; other company's contact → 400; `{contactId: null}` → unlinks; frozen game → still 200.
- [ ] Step 2: run `cd backend && npm run build && node --test test/brand-games.test.js` → FAIL.
- [ ] Step 3: implement migration, store methods, route (validate with `store.getContactById`, `companyId` match, `roles.includes('Client')`).
- [ ] Step 4: re-run → PASS; pin id in `api.test.js`; run that test.
- [ ] Step 5: commit `feat(games): link a game to a client`.

### Task 2: Brand games report API

**Files:**
- Create: `backend/src/games/brand-report.ts`
- Modify: `backend/src/games/portal-routes.ts` (visibleTo also true when `audience === 'client' && game.clientContactId === session.contactId`; register client routes)
- Test: `backend/test/brand-games.test.js`

**Interfaces:**
- Produces: `brandGameSummary(store, game) → { slug, name, nameAr, status, startsAt, endsAt, players }`; `brandGameReport(store, game, tz: string) → { game, players, totals, daily, posts, topFans, winners }` exactly as spec §7; `brandGameFor(store, companyId, session, slug): Game` (404 otherwise).
- Routes: `GET /portal-api/client/brand-games`, `GET /portal-api/client/brand-games/:slug`.

- [ ] Step 1: tests:
  - `a linked client sees its game without being a viewer` (list has slug; detail 200; `/portal-api/client/games/:slug` 200 for a restricted linked game).
  - `another client, drafts and archived games answer 404` (detail, list excludes).
  - `totals and daily series leave out removed events and excluded actors` (fixture: 3 comments, 1 removed, 1 by excluded actor → `totals.comments === 1`; daily sums equal totals).
  - `top fans match the public board; winners appear only after results freeze`.
  - `zero events → zeros and empty daily days, players 0`.
  - `poison`: plant `EXCLUDE-REASON-POISON`, `AWARD-REASON-POISON`, staff name `Carla`, `same_text`, `burst`, `likersMissed`, `likersWindow`, `lastError` value `LASTERROR-POISON`, `accountId` value `ACC-POISON`, excluded handle `bot_ring1`, `createdByUserId`, `byUserId`; assert none in JSON of list + detail.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Daily buckets by `Intl.DateTimeFormat('en-CA', { timeZone: tz })` date of `occurredAt`, from game start day to min(end, now) day. Action map: comment→comments, reply→replies, mention→tags, like→likes. Excluded = `actorRules` keys. Creators games: totals from `creatorStats` of non-excluded actors, `daily: []`. `posts` from sources: `post`→`comment`, `import` with permalink→`like`.
- [ ] Step 4: run → PASS. Mutation checks: drop the excluded filter → poison/totals test red; return raw `staffBoard` → poison red; restore.
- [ ] Step 5: commit `feat(games): brand games report for linked clients`.

### Task 3: Results CSV and PDF summary

**Files:**
- Create: `backend/src/games/brand-report-doc.ts` (`resultsCsv(rows): string`, `gameSummaryHtml(input): string` using `escapeHtml` from `portal/billing-docs.ts`)
- Modify: `backend/src/games/portal-routes.ts` (pass `pdf?: PortalPdfRenderer` in; `GET .../brand-games/:slug/results.csv`, `GET .../summary.pdf?lang=`)
- Modify: `backend/src/portal/routes.ts` (pass `options.pdf`)
- Test: `backend/test/brand-games.test.js`

- [ ] Step 1: tests: before freeze both → 409; after freeze CSV starts with `﻿rank,handle,points`, a handle row; a cell `=cmd` becomes `'=cmd` (unit test on `resultsCsv`); PDF calls the fake renderer with HTML containing the game name escaped (`<b>` → `&lt;b&gt;`), and contains no poison; other client 404.
- [ ] Step 2–4: run red, implement, run green; mutation: remove CSV neutralising → red; restore.
- [ ] Step 5: commit `feat(games): results CSV and PDF summary for brands`.

### Task 4: Client analytics API

**Files:**
- Create: `backend/src/portal/analytics.ts` (`clientAnalytics(store, companyId, contactId, q: { from?: string; to?: string; campaign?: string })`)
- Modify: `backend/src/portal/client-campaigns-routes.ts` (`GET /client/analytics`)
- Test: `backend/test/portal-analytics.test.js`

**Interfaces:**
- Produces response `{ range: {from,to}, totals: Totals | null, weekly: [{ week: 'YYYY-MM-DD', views, engagements }], byCreator: [{ name, handle, posts, views, engagements, perView }], byPlatform: [...same without name/handle, + platform], byCampaign: [{ id, name, posts, views, engagements, cost: [{ currency, invoiced, perThousandViews: number|null, perEngagement: number|null }] }], campaigns: [{id,name}] }` where `Totals = { posts, views, likes, comments, saves, shares, engagements, perView }`.

- [ ] Step 1: tests: totals from latest checkpoint per post; date filter by `publishedAt`; campaign filter; creator only if confirmed; cost per result per currency from non-draft invoices with `campaignId`; no invoices → `cost: []`; zero views → `perThousandViews: null`; isolation (other client's results absent); poison (`agreedRate` 33333.19, `cost` 22222.73, `price` 11111.37, `rateCardAmount`, `budget` 98765.43, notes) absent.
- [ ] Step 2–4: red, implement, green. Mutation: include `price` in byCreator → red; restore.
- [ ] Step 5: commit `feat(portal): client analytics`.

### Task 5: Influencer analytics API

**Files:**
- Modify: `backend/src/portal/analytics.ts` (`influencerAnalytics(store, companyId, contactId, currency, q)`)
- Modify: `backend/src/portal/influencer-routes.ts` (`GET /influencer/analytics`)
- Test: `backend/test/portal-analytics.test.js`

**Interfaces:**
- Produces `{ growth: { days: [{ date, followers, reach, views, engaged }], change: { followers, reach, views, engaged } } | null, audience: Demographics | null, posts: [{ id, title, campaign, publishedAt, checkpoints: { '24h'?, '7d'?, '30d'? }: Figures }], averages: Figures | null, earnings: [{ month: 'YYYY-MM', currency, paid, pending }] }`.

- [ ] Step 1: tests: snapshots in range from own active/needs_reconnect accounts only; no account → `growth: null, audience: null`; posts only for deliverables paid to this contact; earnings group `payoutsFor` by month of `paidAt ?? dueDate`; isolation; poison (`rateCardAmount`, `estimatedAvg`, deliverable `price`, invoice total 7777.77, other contact's followers 424242).
- [ ] Step 2–5: red, implement, green, mutation (return other contacts' snapshots → red), commit `feat(portal): influencer analytics`.

### Task 6: How to pay on invoices

**Files:**
- Modify: `backend/src/portal/billing.ts` (`toInvoiceDetail` adds `payment: { instructions: string | null; accounts: Array<{ bankName, accountHolder, accountNumber, iban, swift, currency }> }` from `invoice.templateSnapshot`)
- Test: `backend/test/portal-billing.test.js`

- [ ] Step 1: test: invoice with snapshot `{ paymentInstructions, bankAccounts: [{...}], terms: 'TERMS-POISON', footerNote: 'FOOTER-POISON', signatureUrl: 'SIG-POISON' }` → `payment` has the fields, poison absent; no snapshot → `{ instructions: null, accounts: [] }`.
- [ ] Step 2–5: red, implement (string fields only, trimmed, ≤500 chars), green, mutation (spread whole account object incl. extra key `ACC-EXTRA-POISON`), commit `feat(portal): how to pay on client invoices`.

### Task 7: Staff UI to link a game to a brand

**Files:**
- Modify: `frontend/src/services/gamesService.ts` (`setGameClient(companyId, gameId, contactId: string | null)`, `Game.clientContactId`, `clientName`)
- Create: `frontend/src/modules/games/components/game-client-picker.tsx`
- Modify: `frontend/src/modules/games/components/games-page.tsx` (render picker in `GameDetail`)

- [ ] Step 1: implement picker: Select of client contacts (existing contacts service, filter `roles` includes `Client`), "Not linked" option, bilingual via `tr`, toast on error.
- [ ] Step 2: `cd frontend && npx tsc --noEmit && npx eslint src/modules/games` → clean.
- [ ] Step 3: commit `feat(games): staff link a game to a brand`.

### Task 8: Portal theme tokens, shell and states

**Files:**
- Modify: `portal/src/app/globals.css` (tokens: canvas, surface, ink, ink-soft, line, field, accent, accent-ink, success, warning, danger + `-soft` steps; radius vars), `portal/tailwind.config.ts` (new token names)
- Create: `portal/src/components/app-sidebar.tsx`, `portal/src/components/bottom-bar.tsx` (`'use client'`), `portal/src/components/more-sheet.tsx` (`'use client'`, `<dialog>`), `portal/src/lib/nav.ts` (`navFor(audience): { primary: NavItem[]; secondary: NavItem[]; bar: NavItem[] }` with i18n keys, browser safe)
- Modify: `portal/src/components/portal-shell.tsx`
- Create: `portal/src/app/(portal)/loading.tsx`, `error.tsx`, `not-found.tsx`; `portal/src/app/(lobby)/loading.tsx`, `error.tsx`
- Test: `portal/src/lib/nav.test.ts`

- [ ] Step 1: test `navFor('client').bar` is exactly `['/', '/campaigns', '/influencers', '/messages']` + More; client secondary contains `/requests`, `/billing`, `/analytics`, `/referrals`, `/games`; influencer bar `['/', '/assignments', '/payouts', '/messages']`, secondary has `/analytics`, `/profile`, `/referrals`, `/games`.
- [ ] Step 2–4: red, implement, green. Shell: ≥1024px sidebar (brand, primary, secondary, user + language + sign out at bottom); below, top bar + fixed bottom bar with `pb-[env(safe-area-inset-bottom)]`, main gets bottom padding.
- [ ] Step 5: commit `feat(portal): Peak shell with sidebar and bottom bar; loading, error and not-found states`.

### Task 9: Pure helpers (test first)

**Files:**
- Create: `portal/src/lib/needs-you.ts` + test; `portal/src/lib/shortlist.ts` + test; `portal/src/lib/chart.ts` + test; `portal/src/lib/money.ts` + test

**Interfaces:**
- `rankNeedsYou(input: { overdue: Array<{id, number, outstanding, currency, daysLate}>; proposals: Array<{id, title}>; reviews: Array<{campaignId, name, count}> }): NeedsYouItem[]` ordering overdue (most days late first), proposals, reviews.
- `parseShortlist(value: string | string[] | undefined): string[]` (dedupe, max 20, id pattern `^[\w-]{1,64}$`); `toggleShortlist(ids, id): string[]`; `shortlistHref(ids): string` → `/requests/new?with=a&with=b`.
- `stackedBars(series: Array<Record<string, number> & { label: string }>, keys: string[], box: { width, height }): { bars: Array<{ label, x, width, segments: Array<{ key, y, height, value }> }>; max: number; ticks: number[] }` (empty series → `bars: []`, `max: 0`).
- `sumByCurrency(rows: Array<{ currency: string; amount: number }>): Array<{ currency, amount }>` sorted by currency.

- [ ] Steps: red tests with exact values, implement, green, commit `feat(portal): helpers for needs-you, shortlist, charts and money`.

### Task 10: Home

**Files:** Modify `portal/src/app/(portal)/page.tsx`, `portal/src/components/dashboard.tsx` (client branch rebuilt; influencer branch restyled)
- [ ] Needs-you list from `rankNeedsYou`, top item solid button, others rows; snapshot: active campaigns with published/total and next due, outstanding and overdue by currency, latest team message. Remove account block (moved to sidebar/More). Commit `feat(portal): home ranks what needs the client`.

### Task 11: Creators

**Files:** Modify `influencers/page.tsx`, `influencers/[id]/page.tsx`; create `components/shortlist-bar.tsx` (`'use client'`), `components/catalogue-filters.tsx`
- [ ] Filters in `<details>` on phone (open on desktop via `lg:` and `open` when any filter set); rows show followers, avg views, engagement; checkbox per row toggling `with` params (links, not JS-only); sticky bar "Request with N creators" → `shortlistHref`. Commit.

### Task 12: Requests and proposals

**Files:** Modify `requests/page.tsx` (fetch `getProposals()`; "Waiting for your answer" section first), `proposals/[id]/page.tsx` (restyle; total as large figure). Commit.

### Task 13: Campaigns

**Files:** Modify `campaigns/page.tsx` (progress published/total, to review), `campaigns/[id]/page.tsx` (summary strip; ready-for-review first), `components/deliverable-review.tsx` (approve → inline confirm "Approve this piece? The team will be told." Confirm/Cancel; after success row shows "You approved, the team has been told"). Commit.

### Task 14: Messages and referrals

**Files:** Modify `messages/page.tsx`, `components/whatsapp-alerts.tsx` (collapsed one-line state when on), `referrals/page.tsx` + `components/referral-form.tsx` (collapsed behind "Refer a business" when referrals exist; open by default when none). Commit.

### Task 15: Billing

**Files:** Modify `billing/page.tsx` (outstanding + overdue per currency via `sumByCurrency`; `?show=unpaid|all`, default unpaid when any unpaid), `billing/[id]/page.tsx` (How to pay block), `lib/billing.ts` (types), create `components/copy-button.tsx` (`'use client'`, navigator.clipboard, status text). Commit.

### Task 16: Games for brands (portal)

**Files:** Create `portal/src/lib/brand-games.ts`, `portal/src/lib/brand-games-types.ts`, `portal/src/components/stacked-bar-chart.tsx` (server component using `stackedBars`, SVG + `<table>` fallback in `<details>`), `portal/src/app/(lobby)/games/[slug]/report-view.tsx`, `portal/src/app/api/brand-games/[slug]/results/route.ts`, `.../summary/route.ts`; modify `(lobby)/games/page.tsx` ("Your games" first on client host), `(lobby)/games/[slug]/page.tsx` (client host + linked → report view).
- [ ] Load the dataviz skill before chart code; series colours from tokens; legend with words. Commit.

### Task 17: Analytics pages

**Files:** Create `portal/src/lib/analytics.ts`, `analytics-types.ts`, `portal/src/app/(portal)/analytics/page.tsx` (client vs influencer by audience), components `analytics-client.tsx`, `analytics-influencer.tsx` (server). Range presets as links (`?range=30d|90d|year|all`), campaign select as GET form. Empty states with next action. Commit.

### Task 18: Influencer portal and lobby pass

- [ ] Screenshot every influencer page and lobby at 375/1280 en/ar under the new shell; fix breakage. Commit.

### Task 19: Verification and delivery

- [ ] Backend `npm run build && npm test` all pass; portal `npm test && npx tsc --noEmit`; frontend `npx tsc --noEmit && npx eslint src/modules/games`.
- [ ] `PORTAL_AUDIENCE=client PORTAL_DIST_DIR=.next-client-build npx next build` succeeds.
- [ ] Browser pass (375/1280, en/ar; empty/loading/error/full) with screenshots in `docs/superpowers/plans/screens/2026-10-05/`.
- [ ] `impeccable detect --json` on changed portal files; impeccable polish pass; code-review on the branch; fix findings.
- [ ] Design note `docs/superpowers/plans/2026-10-05-client-portal-ux-notes.md`; push.
