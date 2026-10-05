# Client Portal UX and Brand Games Report — Design

Date: 2026-10-05
Branch: `feature/client-portal-ux` (from `feature/peak-portal`)
Status: Draft for review
Builds on: `2026-09-21-peak-media-client-portal-design.md`, `2026-09-27-portal-communication-and-referrals-design.md`, `../plans/2026-10-05-games-g2-live-metrics.md`

## 1. Problem

The client portal works and leaks nothing, but a critique (impeccable, two independent
assessments, 2026-10-05) scored it 20/40. A client cannot find out how to pay an
invoice, a proposal staff send without a request cannot be found again, the overview
shows three equal calls to action, the phone menu hides Billing and Games, there are
no loading or error states, and a brand's own restricted game answers "Page not
found". Brands also have no way to see how their games performed without being added
as viewers one by one.

## 2. Goals

- A client can do every job from a phone in Arabic or English: answer a proposal,
  review content, follow a campaign, pay an invoice, message the account manager.
- One clear next action per screen; the overview ranks what needs the client.
- Every screen has real loading, empty and error states, inside the signed-in shell.
- A new look at the category's best (Stripe Dashboard, Mercury), chosen by the owner:
  standard controls, one accent, precise numbers.
- Staff link a game to a client; that client's portal users see a games report
  (status, players, interactions over time by type, posts, top fans, winners, CSV, PDF)
  without being added as viewers, and never see fraud flags, exclusion reasons,
  likers-capture gaps or staff names.

## 3. Non-goals

- "Ask for a game" in the request form (owner: no).
- Online payment. Paying stays off-platform; the portal shows how.
- Read/unread tracking for messages.
- Changing the influencer portal or the public lobby beyond shared components
  (both must still build and look right).

## 4. Owner decisions (2026-10-05)

| Decision | Answer |
| --- | --- |
| Visual identity | New identity, "category standard" played straight; craft bar Stripe Dashboard and Mercury (recorded in `portal/PRODUCT.md`) |
| Phone navigation | Bottom tab bar |
| Ask for a game | No |
| Approving content | Confirm step, then an "Approved" note on the row |
| Theme (amended same day) | Both portals take Peak's own brand from peak-creative.agency, not a generic standard; Stripe Dashboard and Mercury stay the bar for craft and structure |
| Client analytics | Results across campaigns; by creator and platform; cost per result |
| Influencer analytics | Account growth; post results; audience; earnings |

## 5. Visual system

**Amended 2026-10-05:** the palette, type and logo come from Peak's brand
(peak-creative.agency). The site could not be read from this environment (network
policy), so the exact values are an open input (section 11). The structure below
stands; only token values and faces change.

Mode: Operate. Restrained colour strategy. Light, because the use scene is a brand
manager on a phone between meetings, often outdoors or in bright offices, and company
logos are drawn for light grounds.

- **Tokens** (CSS variables, same `color-mix` Tailwind mechanism, new values and names
  added additively): canvas cool grey, surface white, ink near-black (not pure black),
  ink-soft for secondary text (≥4.5:1 on both canvas and surface), line hairline, field
  (≥3:1 input border), one accent (indigo-violet family, the category's standard, ≥4.5:1
  as text on white), and semantic `success`, `warning`, `danger`, each with a tinted
  background step. No colour carries meaning alone: every status has a word.
- **Type:** keep Manrope (Latin) and IBM Plex Sans Arabic, one family stack, fixed rem
  scale (12/13/14/16/18/22/28), tabular numerals on every figure, weights 400/500/600.
- **Shape:** one radius scale: 8px controls, 12px panels, full for pills. Shadows only
  on floating layers (menus, the bottom bar), tinted, with offset and blur.
- **Shell:**
  - Desktop (≥1024px): left sidebar with the company brand, primary items, a second
    group for less frequent items, and the user's name with sign out and language at
    the bottom. Content area max 72rem.
  - Phone and tablet: compact top bar (brand, language) and a fixed bottom tab bar with
    five items: Home, Campaigns, Creators (influencers), Messages, More. "More" opens a
    sheet with Requests and proposals, Billing, Referrals, Games, language and sign out.
    Each tab is ≥44px; the bar respects `env(safe-area-inset-bottom)`.
  - Counts on tabs only where derived truth exists (content to review on Campaigns,
    answers owed on Home).
- **States:** `loading.tsx` skeletons per route group shaped like the page; `error.tsx`
  with a plain message and "Try again"; `not-found.tsx` inside the shell for portal
  routes.
- **Motion:** 150–200 ms colour and opacity transitions only; reduced motion respected.

## 6. Screen changes

1. **Home (overview).** "Needs you" list ranked: overdue invoices (amount, days late),
   proposals awaiting an answer, content awaiting review (count per campaign). The top
   item gets the one solid button; the rest are rows. Below: a snapshot of active
   campaigns (pieces published of total, next due date), the outstanding balance with
   the overdue part, and the latest message from the team. The account details move to
   the More sheet / sidebar footer.
2. **Creators (catalogue).** Search always visible; filters behind a "Filters (n)"
   disclosure on phones, inline on desktop. Rows show followers, average views and
   engagement. A checkbox per row builds a shortlist kept in the URL; a sticky bar
   "Request with 3 creators" opens the request form with them preselected. Profile page
   unchanged in substance, restyled.
3. **Requests and proposals.** One page: "Waiting for your answer" (sent proposals,
   including ones not born from a request), then requests. Proposal page unchanged in
   behaviour (it already confirms accept), restyled; totals in a Mercury-style figure.
4. **Campaigns.** List shows progress (published / total, to review). Detail opens with
   a summary strip (to review, in progress, published) and puts "Ready for your review"
   first. Approve asks for confirmation inline, then the row shows "You approved, the
   team has been told". Results and billing for the campaign stay on the page.
5. **Messages.** Thread with the composer pinned under it; the WhatsApp alerts card
   collapses to one line once set up ("WhatsApp alerts on: +968 …, Change").
6. **Referrals.** Form collapsed behind "Refer a business" when the client already has
   referrals; list first.
7. **Billing.** Balance header: outstanding and overdue per currency. Filter: Unpaid /
   All. Invoice page adds **How to pay**: the bank accounts and payment instructions
   already printed on that invoice's issued template (`templateSnapshot.bankAccounts`,
   `paymentInstructions`), with copy buttons for IBAN, account number and the invoice
   number as reference; then "Sent a transfer? Send the proof in Messages" linking to
   Messages. Only these allow-listed fields leave the server (poison-tested).
8. **Games.** For clients, `/games` lists "Your games" (linked to this client) first,
   then public games. A linked game's page shows the report (section 7) instead of the
   public board.

## 7. Brand games report

### Data (additive)

- Migration `099_game_client_link`: `ALTER TABLE games ADD COLUMN clientContactId TEXT`
  (nullable) plus an index on `(companyId, clientContactId)`. Pinned in
  `backend/test/api.test.js`.
- `Game.clientContactId: string | null`; `GamesStore.forClient(companyId, contactId)`.

### Staff

- `PUT /companies/:companyId/games/:id/client` body `{ contactId: string | null }`:
  admins only (existing `authorize`), contact must belong to the company and hold the
  Client role, else 400. Allowed on frozen and archived games (it changes who reads,
  not results). The staff game view gains `clientContactId` and `clientName`.
- Staff UI (`frontend/src/modules/games`): a "Brand (client)" picker in the game detail,
  searchable list of client contacts, with "Not linked". Bilingual like the rest.

### Client API (allow-listed DTOs in `backend/src/games/brand-report.ts`)

All under the client session; a game is reachable only when published, not archived,
in the portal company and `clientContactId === session.contactId`; otherwise 404.

- `GET /portal-api/client/brand-games` → `[{ slug, name, nameAr, status, startsAt, endsAt, players }]`.
- `GET /portal-api/client/brand-games/:slug` →
  - `game`: slug, name(Ar), rules(Ar), prize(Ar), status, startsAt, endsAt, audience, tag, updatedAt, frozen
  - `players`: number on the board
  - `totals`: per type `{ comments, replies, tags, likes }` (followers games) or
    `{ posts, views, shares, engagement }` (creators games)
  - `daily`: `[{ date: 'YYYY-MM-DD', comments, replies, tags, likes }]` in the business
    time zone, game window only (followers games)
  - `posts`: `[{ url, kind: 'comment' | 'like' }]` the public post links (same as the
    lobby's "where to play")
  - `topFans`: top 10 `{ rank, handle, points }` from the same board the public sees
  - `winners`: once frozen, the top 3 `{ rank, handle, points }`; else `null`
- `GET .../brand-games/:slug/results.csv`: frozen games only (else 409), rank, handle,
  points, UTF-8 with BOM, cells starting with `= + - @` neutralised.
- `GET .../brand-games/:slug/summary.pdf?lang=`: frozen games only, rendered through the
  existing `PortalPdfRenderer.html` with an escaped, self-contained HTML document
  (same pattern as receipts).
- The existing portal game routes (`/portal-api/:audience/games/:slug`) also treat the
  linked client's users as viewers, so the lobby page stops answering 404.

Counting rules: removed events never count; events by excluded or disqualified actors
are left out of totals and daily series too (otherwise the gap would hint at an
exclusion), and they are absent from top fans and winners, as on the public board.

### Never in any client response (poison-tested)

Integrity flags (`same_text`, `burst`), exclusion kinds and reasons and excluded
handles, award reasons and `byUserId`, `createdByUserId` and any staff name, source
`accountId`, `lastError`, `likersMissed`, `likersWindow`, `likeCount`, fetch timestamps,
viewers, and other clients' games. Each guard gets a mutation check: break it, see the
poison test fail, restore.

### Portal UI

`/games/[slug]` (client host, linked game): header with status and dates; figures
(players, comments, replies, tags, likes); a stacked daily bar chart by type, drawn as
server-rendered SVG with a data table fallback and a legend with words (dataviz skill
for colours and marks); the game posts; top fans; after the end, winners plus
"Download results (CSV)" and "Download summary (PDF)". Downloads go through new
`portal/src/app/api/brand-games/[slug]/…` GET routes using `backendDownload`.

## 7b. Analytics

Both audiences get an **Analytics** page (client: in the sidebar and the More sheet;
influencer: same places in their portal). Every figure is computed on the server from
records the viewer may already see, and returned as an allow-listed DTO.

### Client analytics (`GET /portal-api/client/analytics?from&to&campaign`)

Sources: verified post results (`media_results`, latest checkpoint per post) on this
client's campaigns' deliverables; the client's own non-draft invoices.

- **Totals** for the range: posts with results, views, likes, comments, saves, shares,
  engagements (likes + comments + saves + shares), engagement per view.
- **Over time**: weekly sums by publish date (views; engagements).
- **By creator**: name, handle, posts, views, engagements, engagement per view. No
  money per creator, ever (it would approach a rate).
- **By platform**: same figures per platform.
- **By campaign**: posts, views, engagements, and **cost per result** where the campaign
  has invoices: invoiced total (the client's own price, per currency) / views x 1,000
  (CPM) and / engagements (cost per engagement). Campaigns without invoices or results
  show a dash, not zero.
- Filters: date range presets (30 days, 90 days, this year, all) and campaign.
- Poison: `agreedRate`, deliverable `cost` and `price`, `rateCardAmount`, `budget`,
  expenses, vendor bills, notes, another client's campaigns.

### Influencer analytics (`GET /portal-api/influencer/analytics?from&to`)

Sources: the influencer's own connected accounts' `account_snapshots`, `media_results`
on deliverables they were paid for or assigned to, their own payouts (`payoutsFor`).

- **Account growth**: followers, reach, views, engaged accounts per day (from daily
  snapshots), with change over the range. Needs a connected account; otherwise an empty
  state with the connect action.
- **Post results**: each Peak post with its 24h, 7d and 30d figures, and their averages.
  The client's name is shown only where the assignment already shows it.
- **Audience**: the latest snapshot's demographics (age bands, gender, top cities and
  countries) when Instagram returned them.
- **Earnings**: their payouts per month, paid and pending, per currency.
- Never: market-rate benchmarks, other influencers' figures, the client's price or
  invoices, Peak's margin.
- Poison: `rateCardAmount`, `estimatedAvg`, deliverable `price`, invoice totals,
  other contacts' snapshots, tokens.

### Charts

Server-rendered SVG with a table fallback and worded legends, one chart component
family shared by the games report and both analytics pages (dataviz skill).

## 8. Security and architecture rules kept

- Writes only through `portal/src/app/api/*` with `forwardWrite` and same-origin.
  Downloads are GET through `backendDownload`.
- `'use client'` files never reach `next/headers`; browser-safe types live in `*-types.ts`.
- Every new client-readable shape is an allow-listed DTO with a poison test.
- Additive migration only, appended at the end, id pinned.
- Every string in `portal/src/lib/i18n.ts` in both languages, no em or en dashes,
  `dir="auto"` on typed text, `<bdi>` for handles and numbers, Latin digits in Arabic.

## 9. Testing

- Backend (`node --test`): `brand-games.test.js`: linking (permissions, validation,
  other company, non-client contact), visibility (linked client sees it, another client
  404, draft and archived 404, lobby route no longer 404 for the linked client), totals
  and daily series exclude removed and excluded actors, top fans equal the public board,
  winners only after freeze, CSV and PDF only after freeze with neutralised cells, and
  the poison test. `portal-billing.test.js` gains the "How to pay" fields and a poison
  check that nothing else from `templateSnapshot` leaks.
- Portal (`node --test`): pure helpers written test first: needs-you ranking, shortlist
  URL handling, daily-series to chart geometry, currency totals.
- Browser: every changed screen at 375px and 1280px in English and Arabic, with
  empty, loading, error and full states screenshotted; production build of the client
  portal.

Analytics tests: `portal-analytics.test.js`: totals and series from fixtures,
date filters, cost per result per currency and the dash cases, isolation between two
clients and two influencers, and a poison test per audience with mutation checks.

## 10. Risks

- Restyling shared components touches the influencer portal and lobby; both get a
  screenshot pass.
- Bank details come from the invoice's frozen template; an invoice issued without bank
  accounts shows only the payment instructions, or nothing, plus the Messages link.
- Daily series for long games: capped at the game window; a 90-day game is 90 bars,
  which the chart handles by thinning date labels.
- Analytics read every result row for a client on each request; fine at today's
  scale (hundreds of posts), revisit with caching past a few thousand.

## 11. Open inputs

1. Peak's brand values (colours, typefaces, logo files), from peak-creative.agency or
   supplied directly. Until then the tokens keep today's values.
