# Peak Media Client Portal — Design

Date: 2026-09-21
Branch: `feature/peak-portal` (cut from `feature/openfga-permissions`; rebase onto `master` once that merges)
Status: Draft for review

## 1. Problem

Peak Media, an influencer agency in the Al Yarubi Group, wants a portal where its
own clients (brands) can browse the agency's registered influencers, request
campaigns, follow live campaigns, and see invoices and receipts. Later they want
instalment payments ("Peak Flexi") and system-assisted campaign assembly.

TaskFlow already holds the agency back-office: `Contact` with an `Influencer`
role and per-platform `InfluencerAccount`s, `Opportunity` → `CrmProposal` →
`CrmCampaign` → `CampaignAssignment` / `CampaignDeliverable`, `Invoice` with
`campaignId`, `Payment`, `FollowUp` (which already accepts `invoice`). What is
missing is an **external-facing surface with its own identity and strict data
scoping**. This is additive work, not a rebuild.

## 2. Goals

- Clients see only their own campaigns, proposals, invoices and payments.
- Clients never see influencer costs, agreed rates, margins, expenses or
  commissions, in any response, under any pricing arrangement.
- Peak-specific work never forces changes to GIG's or another tenant's behaviour.
- The portal is separable: its own app, subdomain, identity tables and API
  prefix, so it can be exposed, scaled or moved independently.
- Arabic and English from the first release, matching the rest of TaskFlow.
- The mechanism is tenant-neutral (branding and pricing profile come from the
  company), so another agency could be enabled later without new code.

## 3. Non-goals

- Online payment gateway (Phase 5). Payments stay off-platform; staff record them.
- Automatic campaign assembly (Phase 5). The request object is designed so it
  can plug in later.
- Per-client catalogue restrictions or client-specific rate cards. One shared
  catalogue; only the *price shown* varies by client.
- A portal for influencers themselves.
- Clients editing campaigns, deliverables or invoices.
- Changing internal authentication or the OpenFGA permission model.

## 4. Decisions

| Decision | Rationale |
| --- | --- |
| One repo, no fork | A fork forfeits shared fixes to invoicing, notifications and auth, and still leaves the "is this Peak-only?" question unanswered. Work happens on `feature/peak-portal` and merges normally. |
| Peak Media is a new `companies` row (tenant) | Same pattern as GIG. |
| Peak-only scope is controlled by the **existing** per-company module switch (`companies.disabledModules`, migration 082, super-admin only) | No new flag mechanism is needed. Modules irrelevant to an agency (inventory, manufacturing, purchasing, …) are switched off for Peak. The portal itself is not a `MODULES` entry: it is a separate app with its own API prefix, so it cannot be reached by a `disabledModules` accident. |
| New behaviour is additive: new tables and files, no edits to shared entity logic | Peak Flexi is a `payment_plans` table that references an invoice, not new columns on `Invoice`. GIG's invoice code never learns about it. |
| Portal is a **separate Next.js app** in `portal/`, own port and subdomain | No internal UI code or routes are served to external users. Cost: portal-local UI primitives and i18n dictionary instead of importing from `frontend/`. Primitives are copy-in Radix/Tailwind components, not business logic. |
| Portal API is a **dedicated router** under `/portal-api/*` in `backend/src/portal/`, mounted by `createPortalRouter(store)` | One backend process in v1 (SQLite; avoids multi-process write contention), but the boundary is a file boundary. Splitting into its own process later means a new entry file, not a refactor. nginx on the portal domain forwards **only** `/portal-api/*` and the portal app. |
| **Separate identity space**: `portal_users`, `portal_sessions`, `portal_invitations` | Internal `authMiddleware` looks tokens up in the internal user/token store only. A portal token therefore cannot authenticate an internal route, and the reverse, by construction. |
| Scoping is **session-bound SQL, not OpenFGA** (revises the earlier suggestion) | The OpenFGA project is a company-group projection and explicitly excludes record-level rules and authentication. An external surface should not depend on that engine being reachable. Instead the server resolves `{companyId, clientId}` from the session, and every portal query takes them from there. Request params and bodies never supply either. |
| Responses are **allowlist DTOs** (`portal/dto.ts`) | Portal handlers never return an internal entity. Adding a field to an internal type cannot leak it. |
| `contacts.portalVisible` (new column, default 0) gates the catalogue | Imports and existing records are not exposed by accident; staff opt influencers in, individually or in bulk. |
| Invite-only accounts; a client admin can invite teammates for their own client | No public sign-up. Peak staff invite the first user for each client. |

## 5. Data model

Added through the `schema_migrations` list in `backend/src/data/store.ts`
(next ids after `082_company_disabled_modules`).

- `portal_users` — id, companyId, clientId, email (unique per company), name,
  passwordHash (bcrypt, reuse `password.ts`), role (`client_admin` | `client_member`),
  status (`invited` | `active` | `disabled`), lastLoginAt, createdAt.
- `portal_invitations` — id, portalUserId, tokenHash, expiresAt (7 days),
  usedAt, createdByUserId. Single use.
- `portal_sessions` — id, portalUserId, tokenHash (SHA-256; the raw token is
  never stored), expiresAt, createdAt, revokedAt.
- `client_pricing_profiles` — clientId (PK), mode (`markup` | `pass_through` |
  `retainer`), markupPercent, agencyFeePercent, currency, updatedAt.
  `markup`: shown price = rate × (1 + markupPercent). `pass_through`: shown price
  = rate, and the agency fee appears separately on proposals and invoices.
  `retainer`: no per-influencer price is shown ("included in your retainer").
- `portal_campaign_requests` — id, companyId, clientId, portalUserId, title,
  objective, budget, currency, startDate, endDate, platforms (JSON), notes,
  status (`Draft` | `Submitted` | `In Review` | `Proposal Sent` | `Approved` |
  `Declined` | `Cancelled`), opportunityId, proposalId, submittedAt.
- `portal_request_influencers` — requestId, contactId, note. The shortlist.
- `portal_deliverable_reviews` — id, deliverableId, portalUserId, decision
  (`approved` | `changes_requested`), comment, createdAt.
- `payment_plans` — id, companyId, invoiceId, clientId, tier (`standard` | `plus`),
  installments, feePercent, status (`Requested` | `Approved` | `Active` |
  `Completed` | `Defaulted` | `Cancelled`), requestedByPortalUserId, approvedByUserId.
- `payment_plan_installments` — planId, seq, dueDate, amount, status
  (`Due` | `Paid` | `Overdue`), paymentId (links the existing `Payment`).
- `contacts.portalVisible INTEGER NOT NULL DEFAULT 0` (column added to an
  existing table).

## 6. Security requirements

1. Every portal handler starts from `req.portal = { portalUserId, companyId, clientId, role }`
   resolved from the session. Nothing downstream reads those from the request.
2. Fetching another client's record by id returns **404**, not 403.
3. Fields never present in any DTO: `Contact.rateCardAmount`,
   `CampaignAssignment.agreedRate`, `CampaignDeliverable.cost` and `price`,
   `CampaignExpense.*`, commissions, vendor bills, internal notes, owner
   user ids, other clients' data. `portalVisible = 0` influencers are 404.
4. Login: bcrypt compare, generic error text, per-IP and per-email rate limit,
   using the same trusted-proxy handling as the internal login limiter (commit
   `27faae7`), so each visitor behind nginx has their own budget. Minimum
   password length 10.
5. Invitation and session tokens are random 32 bytes, stored hashed, expire, and
   are revocable. Password change and user disable revoke all sessions.
6. State-changing portal actions run through `store.runAsActor` with an actor
   name of the form `Portal: <name> (<client>)`, so the existing activity trail
   shows who acted.
7. CORS on `/portal-api/*` allows only the portal origin from an env variable.
8. A test suite proves isolation: two clients, two users, every portal endpoint
   asserted to return nothing of the other's, and to return 401 with an
   internal token.

## 7. Phases

Each phase ships and is verified on staging before the next starts.

**Phase 0 — Foundation.** Peak Media company and module switches; migrations;
`backend/src/portal/` (session middleware, DTO helpers, router skeleton);
invitation, set-password, login, logout, `me`; internal "Portal access" panel on
a Client (invite user, disable, set pricing profile) in `frontend/`; `portal/`
app shell with Peak branding from `Company.logoUrl`, en/ar, RTL; nginx and pm2
entries; isolation test harness.

**Phase 1 — Catalogue.** `portalVisible` toggle and bulk action in the internal
influencers page. Portal list with filters (platform, niche, followers,
engagement, language, location, availability) and a detail view showing
per-platform accounts. Indicative price from the client's pricing profile.

**Phase 2 — Requests, proposals, campaigns.** Shortlist and brief →
`portal_campaign_requests`. Submit creates an internal `Opportunity` (stage
`New`) on the contact linked to the client (`Contact.clientId`; one is created
from the client record if none exists) and a `FollowUp` for the owner. Staff build the
`CrmProposal` in the existing UI. When its status becomes `Sent`, it appears in
the portal; the client accepts or declines through
`store.updateCrmProposalStatus`, the same transition staff use. Campaign list and
detail: status, dates, assigned influencers, deliverables with content links.
Deliverable review: approve or request changes, with a comment, notifying the
owner.

**Phase 3 — Invoices and receipts.** Client invoices (`Sent`, `Paid`, `Overdue`;
never `Draft`), balances, PDF via `invoice-doc.ts`. Payments listed as receipts,
with a new receipt document. Statement view by campaign.

**Phase 4 — Peak Flexi.** Client requests a plan on an invoice. `standard` if
outstanding exposure plus the plan stays within `Client.creditLimit`; otherwise
`plus`, which adds a service fee (never called interest). Finance staff always
approve. Installments are recorded by staff against the existing `Payment`.
Overdue installments raise a `FollowUp` on the invoice.

**Phase 5 — Later.** Online payment gateway; system-assisted assembly from a
brief (budget, niche, reach, platform) feeding the same request object.

## 8. Deployment

- `portal/` runs on port 9003, next to `frontend/` (9002). Add to
  `deploy/staging/ecosystem.config.cjs` and the nginx templates.
- The portal domain's nginx block proxies `/` to 9003 and `/portal-api/` to the
  backend, and nothing else. The internal ERP domain does not serve `/portal-api/`.
- Invitation email through the existing Resend setup, with sender and app URL
  from env variables so it reads as Peak Media, not TaskFlow.
- Ship to staging first; production waits on the known production gaps in the
  staging notes.

## 9. Testing

Backend `node --test` files in `backend/test/` following
`company-modules.test.js`: auth and session lifecycle; the isolation matrix in
§6.8; DTO allowlist checks (a fixture entity carrying every forbidden field,
asserted absent from every response); pricing-profile arithmetic for all three
modes; proposal accept/decline; plan eligibility and installment schedule. Each
phase is also driven through a real browser on staging, in English and Arabic.

## 10. Inputs needed before Phase 0

1. The portal domain (for example `clients.<peak-domain>`) and DNS access.
2. Peak Media's legal name, tax number, logo and default currency, for the
   company record and documents.
3. The accountant's view on how the Plus service fee is invoiced (added as an
   invoice line, and whether VAT applies). Needed before Phase 4 only.
