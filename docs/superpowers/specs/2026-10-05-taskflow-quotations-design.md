# Sales Quotations — Design

Date: 2026-10-05. Branch `fix/taskflow-audit`. Owner's choice: a real sales quotation record. CRM proposals stay as they are.

## Record

`quotations` (migration `100_quotations`):

- number `QT-0001` (company numbering, entity `quotation`)
- client (`clientId`, a client contact), optional `contactId`, optional `opportunityId`
- `issueDate`, `validUntil`
- lines as on sales orders (inventory item, SKU, description, quantity, unit price, discount)
- `taxRate` (VAT %), `currency`, `exchangeRate` (required when not the company base currency)
- `subtotal`, `taxAmount`, `totalAmount` computed by the server
- `notes`, `templateId` (a template whose doc type is `quote`)
- `status`: Draft, Sent, Accepted, Declined. **Expired** is derived: a Draft or Sent quotation past `validUntil` reads as Expired. It is never stored, so extending the date revives it.
- `salesOrderId`, `invoiceId` once converted; `sentAt`, `acceptedAt`, `declinedAt`

## Rules

- Edit only while Draft or Sent (or Expired) and not converted.
- Status moves: Draft ⇄ Sent; Draft/Sent → Accepted or Declined; Declined → Draft (reopen). An expired quotation cannot be accepted; extend `validUntil` first.
- Convert only when Accepted, and only once:
  - to a **sales order** (Confirmed, same lines); invoicing that order later carries the quotation's VAT and currency;
  - or straight to an **invoice** (Draft, same lines with discounts, VAT, currency, optional invoice template).
  - Repeating the same conversion returns the existing record; the other conversion is refused.
- Delete only when not converted. Deleting the sales order or invoice it became clears the link; deleting the opportunity clears `opportunityId`.

## API

- `GET /companies/:companyId/quotations[?opportunityId=]`, `POST` same
- `GET /quotations/:id`, `PUT /quotations/:id`, `PATCH /quotations/:id/status`, `DELETE /quotations/:id`
- `POST /quotations/:id/sales-order`, `POST /quotations/:id/invoice`
- `GET /public/quotations/:id` — allow-listed DTO (no opportunity, no internal ids beyond the record), behind the `sales` module switch.

Roles and module as sales orders (`sales`).

## Screens

- Sales page: a Quotations tab (list, create/edit dialog, send/accept/decline, convert, print).
- Opportunity detail: its quotations with "New quotation" prefilled from the opportunity.
- Print uses the document renderer with the company's `quote` template; the QR opens `/quotation/:id`.

## QR codes (same change)

Each printed document's QR opens its own public page: invoice, delivery, vendor bill, quotation, free document. A scan that lands on the wrong kind falls back to `/public/resolve/:id`, which finds the document of any kind, so a letter never answers "Invoice not found".
