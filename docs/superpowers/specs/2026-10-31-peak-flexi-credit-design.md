# Peak Flexi credit balance: phase 1 (balance and applications)

Status: design approved by Tamer (owner) 2026-10-31. Branch `feature/peak-flexi-credit`.

## Why

Peak Flexi lets a client company run PEAK services now and pay later: a share up front and the rest in instalments with no fees. Every client gets a **credit balance** they spend on any PEAK service (influencer campaigns, photography, event coverage, brand identity and the rest). Today the idea lives only on the public `/join` page; neither TaskFlow nor the client portal knows a client's balance. This spec makes the balance real.

## The rules (from the owner)

- Not every company qualifies. PEAK staff approve each balance by hand.
- **Activation:** needs only the commercial registration (CR). The standard balance is **850 OMR**; the reviewer may grant less, or refuse.
- **Increase:** needs a bank statement for the last 3 months and solvency papers. The reviewer sets the new balance (e.g. 3,000 or 10,000 OMR), may grant less than asked, or refuse.
- **Default terms:** 40% down payment, up to **6 months**. **12 months** opens only with an approved increase. The reviewer can change both per client.
- No fees on instalments.

## The three phases

1. **Balance and applications** (this spec): activation and increase requests with papers, staff review, the balance on the client record and in the portal.
2. **Paying from the balance:** "pay from my balance" on proposals and requests, instalment schedule, collections and lateness.
3. **Influencer payout terms and Cash Exposure:** full / 30-70 / deferred payouts, the exposure dashboard.

Each phase ships on its own. Phases 2 and 3 get their own specs.

## What already exists (reuse, do not duplicate)

- `clients.creditLimit` with `store.clientCreditExposure(clientId)` (open invoices outstanding plus confirmed uninvoiced sales orders) and `store.withinCreditLimit(...)`, which refuses changes that push a client over the limit (`CREDIT_LIMIT_EXCEEDED`, overridable by `INVOICES_CREDIT_OVERRIDE`).
- **Balance = `creditLimit`. Used = `clientCreditExposure`. Available = balance minus used, never below 0.** No second ledger.
- Contacts reach their finance client through `contacts.clientId`.
- Portal uploads: base64 JSON to `POST /:audience/files`, stored in `portal_files` (PDF/PNG/JPEG/WebP, 10 MB), linked to a parent with `store.thread.attach`. `parentType` is CHECK-limited to `message` and `request`.

## Data

Migration `145_peak_flexi_credit`:

- `clients` gains `flexiEnabled INTEGER NOT NULL DEFAULT 0`, `flexiUpfrontPct REAL` (null = 40), `flexiMaxMonths INTEGER` (null = 6).
- New table `flexi_applications`:
  `id, companyId, contactId, clientId (nullable until approval), kind ('activation'|'increase'), status ('new'|'approved'|'rejected'|'withdrawn'), crNumber, requestedAmount, approvedAmount, upfrontPct, maxMonths, note (client), reviewNote (staff), createdBy (portal user id), reviewedBy, createdAt, reviewedAt`.
- `portal_files.parentType` widened to also allow `flexi_application` (table rebuild in the same migration, copying rows).

Rules enforced in the store (`backend/src/finance/flexi.ts`, `FlexiStore`, exposed as `store.flexi`):

- One open (`new`) application per contact at a time, of either kind.
- An activation needs a CR number and at least one file. It is refused if the client already has Flexi enabled.
- An increase needs Flexi enabled, a requested amount above the current balance, and at least two files (statement and solvency; the form labels them).
- Approve (activation): resolve or create the finance client for the contact (link `contacts.clientId`), set `creditLimit = approvedAmount` (default suggestion 850), `flexiEnabled = 1`, terms from the reviewer (defaults 40% / 6 months).
- Approve (increase): set `creditLimit = approvedAmount` (may be below requested, must be above 0), terms from the reviewer (default max months becomes 12).
- Reject: status only, with a reason shown to the client.
- Every approval or rejection writes the audit log and notifies the applicant's portal account.
- Manual edits to a client's balance from the client form keep using today's credit fields and permissions.

## TaskFlow (staff)

- **Peak Flexi applications** page under CRM (`/crm/flexi`), nav entry next to Client requests. The list shows company, kind, requested amount, current balance, age and status, with filters for new and closed applications. Opening one shows the papers, which download through the existing file endpoints. Approve offers an amount (prefilled with 850 or the requested amount), the down-payment % and max months. Reject takes a reason.
- **Contact detail:** a "Peak Flexi" section with the balance, used, available, terms and application history, plus a link to review an open application.
- New applications notify company Admins and Managers and raise a follow-up on the contact.
- Permissions: new action `finance:flexi.review` (catalogue, gate matrix, regenerated route map); read for the section follows `contacts:contacts.read`.

## Client portal

- **Home:** a "Your Peak Flexi balance" card.
  - Not enabled, no application: "Activate your 850 OMR balance" → activation form.
  - Open application: "Your request is under review".
  - Enabled: balance, used, available, terms, and "Ask for a bigger balance" → increase form.
  - Last application rejected: the reason, and the button to apply again.
- **Forms** (`/flexi/activate`, `/flexi/increase`): CR number and CR copy; or requested amount, bank statement (3 months), solvency papers and an optional note. Uploads reuse the portal file flow.
- Backend routes under `/portal-api/client/flexi`: `GET` (status + balance), `POST /applications`, `POST /applications/:id/withdraw`. Client audience only; a user sees only their own company's data.
- Arabic and English copy; the word is "رصيد", never "حد".

## Out of scope for phase 1

Paying from the balance, instalment schedules, collections, influencer payout terms, Cash Exposure, any automatic approval, and changes to `/join` beyond what already shipped.

## Testing

Backend (node:test + supertest, `buildWorkspace`):

- activation approve sets the limit and terms, creates or links the finance client;
- approve with a lower amount, and reject, behave as described; rejection leaves the limit untouched;
- a second open application is refused; an increase without Flexi enabled is refused; missing papers are refused;
- a client cannot read or withdraw another company's application or download its files;
- only reviewers with `finance:flexi.review` can approve or reject;
- notifications reach Admins and Managers on submit and the applicant on decision.

Portal: unit tests for the card state logic (none / pending / enabled / rejected) and the form validation. Staff app: the page renders and approve/reject calls the right endpoints. A manual check in prod mode on the local stack before asking for "تحديث".
