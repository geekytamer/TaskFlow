# Peak Portals Phase 2 — Client Portal Plan

Date: 2026-09-30
Branch: `feature/peak-portal`
Design: `docs/superpowers/specs/2026-09-21-peak-media-client-portal-design.md` (amended below)
Principles: `feedback-design-principles` memory — this plan applies 1–7.

## How this plan differs from Phase 1's

Phase 1's plan pre-wrote ~3,000 lines of code and then drifted from the repository. This
plan fixes **contracts** (tables, endpoints, response shapes, tests, risks) and leaves the
code to execution time, written against the real files. Work ships in four **vertical
slices**, each going DB → API → portal page → staff control → browser check (dev *and*
`next start`) → commit. A slice is not done until it passes in production mode.

## Design amendments made while planning

1. **No `pass_through` pricing mode.** It was defined as "shown price = the influencer's
   rate", which contradicts the rule (2026-09-28) that clients never see real rates.
   Modes are now `markup` and `retainer`. No raw rate leaves the server in any mode.
2. **Catalogue listing is a table, not a column.** `portal_catalogue(companyId, contactId,
   addedByUserId, addedAt)` replaces `contacts.portalVisible`. A column would have meant
   editing the shared `Contact` type, decoder and update path for a portal-only concern;
   a table is fully additive and invisible to existing contact code.
3. **No influencer contact details, ever.** Email, phone and address stay off every
   client response: a client who can reach an influencer directly can bypass the agency.
   Public social handles and profile URLs are shown, because a client has to be able to
   judge the creator. (Flip this with one DTO change if Peak prefers anonymous listings.)

## Slices

### 2a — Catalogue

**Status: done and verified 2026-09-30** (commits `ef9eaaf`, `9d72517`, `f47b005`).
Backend 317 tests, portal 11, both typechecks, portal production build. Driven in the
browser (dev) and under `next start`: listing and unlisting from the staff sheet,
markup and retainer pricing from the client Access sheet, filters, detail pages,
Arabic at phone width, a staff-typed `javascript:` link rendered as plain text, a
signed-in influencer getting 404 for the catalogue. Found and fixed during the slice:
the `javascript:` link (XSS), filters hiding all results on phones, Latin/Arabic
reordering in chips. Deferred: bulk listing (one switch per influencer for now).

- **Tables (migration 085):** `portal_catalogue` as above, primary key
  `(companyId, contactId)`; `client_pricing_profiles(contactId PK, companyId, mode
  'markup'|'retainer', markupPercent, updatedByUserId, updatedAt)`.
- **Client API:** `GET /portal-api/client/catalogue?q&platform&niche&availability&minFollowers`,
  `GET /portal-api/client/catalogue/:contactId` (404 unless listed, in this company, and
  still holding the Influencer role).
- **Response shape (allowlist):** `id, name, niche, location, languages, availability,
  platforms[{platform, handle, url, followers, avgViews, engagementRate}], price:
  {kind: 'indicative'|'retainer'|'on_request', amount?, currency?}`.
- **Pricing:** no profile → `on_request`; `retainer` → `retainer`; `markup` →
  `rateCardAmount × (1 + markupPercent/100)`, rounded to whole units; missing rate →
  `on_request`. Computed server-side from the session's own contact's profile.
- **Staff API (permission `contacts:portal.manage`):** `PUT/DELETE
  /companies/:companyId/portal-catalogue/:contactId`, `GET .../portal-catalogue` (ids),
  `GET/PUT /companies/:companyId/pricing-profiles/:contactId`.
- **Staff UI:** "Show in client portal" switch in the influencer edit sheet; "Portal
  pricing" section in the client Access sheet.
- **Portal UI:** navigation, catalogue page with search and filters, influencer detail page.
- **Tests:** listed vs unlisted; other company; role removed after listing; influencer
  audience cannot reach catalogue; detail 404s; **poison fixture** (`rateCardAmount`,
  `notes`, `email`, `phone`, `address`, `tags`, `customFields`,
  `influencerAccounts[].notes`, `influencerAccounts[].estimatedAvg`, `ownerUserId`) absent
  from every response; each pricing mode; profile validation; staff permission.
- **Risks:** leaking a raw rate through rounding tricks (markup is internal, so the ratio
  is unknown to the client; acceptable); large rosters (list is filtered server-side, capped at 200).

### 2b — Requests and proposals

- `portal_campaign_requests`, `portal_request_influencers` (shortlist from the catalogue).
- Submit creates an `Opportunity` (stage `New`) on the client contact, plus a `FollowUp`
  for the contact owner, through existing store methods.
- Proposals with status `Sent`, `Accepted` or `Declined` for this contact are visible; accept and decline call
  `updateCrmProposalStatus`, the same transition staff use. Line items are shown as staff
  wrote them (the client-facing price); nothing else from the opportunity.
- Staff side: request list on the contact, link from the created opportunity.
- Tests: poison fixture on proposals (opportunity notes, probability, expectedRevenue,
  owner); cannot accept another client's proposal; cannot accept a `Draft`.

### 2c — Campaigns and deliverable review

- Campaigns for this contact: name, status, dates, assigned influencers (name + handle
  only), deliverables (title, platform, due date, status, `contentUrl` once submitted).
- `deliverable_reviews` (client stage only here): approve or request changes with a
  comment; notifies the campaign owner.
- Tests: poison fixture on campaign (`budget`, `notes`, deliverable `cost`/`price`,
  assignment `agreedRate`, expenses, `vendorBillId`); other client's campaign 404.

### 2d — Messages and referrals

- `account_messages`, `portal_referrals`, `referral_commissions` per the communication
  design. Append-only messages; notification to `ownerUserId` on portal posts.
- Staff: "Shared with them" thread on the contact; referral queue with convert/decline.

## Exit criteria (whole phase)

Roadmap Phase 2 exit criteria, plus: every client-facing endpoint has a poison-fixture
test, and the whole flow has been driven under `next start`, not only `next dev`.
