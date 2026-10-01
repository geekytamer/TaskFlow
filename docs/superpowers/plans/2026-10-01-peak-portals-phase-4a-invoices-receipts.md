# Peak Portals — Phase 4a: Invoices, Receipts and Statements

Date: 2026-10-01
Branch: `feature/peak-portal`
Builds on: roadmap Phase 4 (first half), Phase 2 (client portal).
The second half, Peak Flexi payment plans, waits for the accountant's view on
invoicing the Plus fee.

Contracts and tests only; code is written against the real files (principle 2).

## What the code already has (read before planning)

- `Invoice` (status `Draft | Sent | Paid | Overdue`) with `paidAmount`,
  `creditedAmount` and `outstandingAmount` computed on read, `campaignId`, and two
  links to the customer: `contactId` and the legacy `clientId`.
- `Payment` per invoice (`amount`, `method`, `note`, `paidAt`). `note` is staff-typed.
- Invoice PDFs are rendered by headless Chromium loading the frontend's public
  invoice page (`/invoice/:id`, no auth; the random id is the capability, used by the
  invoice's QR code).
- Line items carry internal fields (`taskId`, `itemType`, `sku`).
- No receipt document exists.

## Decisions

1. **An invoice is the client's** when `contactId` is their contact, or `clientId` is
   their contact or their contact's legacy `clientId`. Drafts are never shown.
2. **The invoice PDF reuses the existing renderer**, behind a portal endpoint that
   checks ownership first. No second invoice layout to keep in sync.
3. **Receipts and statements are rendered from server-side HTML**, not new public
   pages: every value escaped, JavaScript off, and every network request blocked in
   the headless page, so document content can never make the server fetch a URL.
   Nothing new becomes reachable without a session.
4. **A receipt is one payment.** Its number is derived (`R-<invoice number>-<first 6 of
   the payment id>`), stable without a new table. It shows the balance remaining after
   that payment, in payment order.
5. **Client-facing invoice status is derived**: `paid` (nothing outstanding),
   `overdue` (past due), `partly_paid`, else `due`.
6. **The PDF renderer is a server dependency**, so tests inject a fake and never need
   Chromium.

## API (`requireSessionFor('client')`)

- `GET /client/invoices`: number, dates, status, currency, total, paid, credited,
  outstanding, campaign (id, name) or null.
- `GET /client/invoices/:id`: plus line items (description, quantity, unit price,
  discount, amount), tax rate, payments (id, receipt number, date, amount, method;
  never the note), credit notes (number, date, total).
- `GET /client/invoices/:id/pdf`, `GET /client/payments/:id/receipt.pdf`,
  `GET /client/campaigns/:id/statement` and `.../statement.pdf`, each with `?lang=`.

## Tests

Isolation (another client's invoice, payment, statement: 404); drafts hidden; the
poison fixture (payment note, line item `taskId`/`sku`, invoice of another client) never
appears; derived status; receipt number stability and running balance; HTML escaping
of a hostile client name; PDF endpoints call the injected renderer only after the
ownership check (a 404 never renders).

## Portal

Billing page (list), invoice detail with downloads, receipts per payment, and a
billing section with statement download on each campaign.
