# WhatsApp bundle 3 — linked to the work

Third of the five bundles (owner: go on without check-ins, 2026-11-13).

## What the bundle gives

1. **Send a quotation or an invoice by WhatsApp** from its page: the same PDF
   the customer would print, to the document's contact, with a short message.
2. **The customer beside the chat**: open balance, latest quotations and
   invoices, each with a "send" button, and a link to the contact page.
3. **From a message, a task or a follow-up** in two clicks, prefilled with
   the message's words.

## Decisions

- `POST /companies/:companyId/whatsapp/send-document`
  `{ kind: 'quotation' | 'invoice', id, phone?, caption? }`.
  Needs `whatsapp.send` and the right to print that document
  (`sales.view` for quotations, `invoices.print` for invoices — the same keys
  as their PDF routes). The phone defaults to the document's contact (then
  its client contact). The PDF is rendered by the same code as the PDF
  routes (moved to `pdf/document-pdf.ts`), sent as a file through the
  provider-neutral sender, kept like any sent file, and recorded with
  `contextEntityType/Id` so the chat says what it was. An activity line is
  added on the document ("sent by WhatsApp to …").
- Cloud API: the 24-hour rule applies as for any file (409 `windowClosed`);
  the dialog says to send a template first.
- The default message is in the document's language when it has one, else
  the reader's: "Hello, please find attached quotation QT-0042."
- **Customer card** in the chat panel reads the existing
  `GET /contacts/:id/summary` (already permission-checked and masked):
  outstanding total, last 3 quotations and invoices.
- **Task from a message**: `POST /tasks` (existing), title = the message's
  first 120 characters, description = the full message + a link back to the
  chat, assigned to me, due tomorrow by default; editable before saving.
  **Follow-up from a message**: `POST /companies/:id/followups` (existing),
  only when the chat is linked to a contact; channel WhatsApp.
- No new tables; no migration.
