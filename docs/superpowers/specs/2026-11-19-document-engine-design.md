# One document engine for every record

**Date:** 2026-11-19
**Status:** Draft, waiting for the owner's review
**Owner's ask:** "Improve how quotations are created and how the quote document can be customised… can we generalise this for all documents?"

## 1. Problem

The template designer (blocks, styling, page setup, brand assets, two languages) is already general. **The data that feeds it is not.** The renderer (`frontend/src/modules/finance/doc/doc-renderer.tsx`) and the token resolver (`doc/tokens.ts`) only understand an `Invoice`. Every other record is dressed up as an invoice before it can be drawn:

| Record | What happens today | What gets lost |
|---|---|---|
| Quotation | `getPublicQuotation` maps it to an invoice; valid-until goes in `dueDate` | salesperson, contact person, opportunity, valid-until as its own field |
| Delivery note | `getPublicDelivery` sets prices to 0; carrier, tracking and SO number are joined into `notes` | every delivery field; ordered vs delivered quantities |
| Vendor bill | shown as an invoice with "Billed by" swapped in | supplier reference, bill due date wording |
| Sales order, purchase order, RFQ, credit note, payment receipt | **no printed document at all** | everything |

Effects of the same root cause:
- Template tokens are `invoice.*`, `client.name/address/email` and `company.name/address/phone/email` only.
- Line columns are `sku, description, quantity, unitPrice, amount, custom`. There is no discount, VAT, line number, unit or delivered quantity column, and `custom` has no value to show.
- `visibleWhen` has five fixed conditions (`always, hasNotes, hasBankAccounts, hasLogo, hasStamp, hasSignature`).
- The only text you can write per document is `notes`. Terms, intro and scope are fixed in the template.
- Each kind has its own public route, public page, PDF function and QR entry (`/public/invoices`, `/public/quotations`, `/public/deliveries`, `/public/vendor-bills`, `/public/documents`, `/public/resolve`), copied and pasted.

## 2. Goals and non-goals

**Goals**
1. Any record type can have designed, printable documents without pretending to be an invoice.
2. Each type exposes its **own fields, line columns, conditions and wording** to the designer, in Arabic and English.
3. Each document can carry **its own written text** (intro, scope, terms, closing) on top of the template's defaults.
4. One way out for every kind: print, PDF, share link with QR, WhatsApp, email.
5. **Nothing already printed changes.** Every stored template and every QR code already printed keeps working.

**Non-goals (separate specs)**
- Customer accepting or signing a quote online, quote revisions, follow-up reminders (from the quotation review of 2026-11-19).
- Rewriting the designer UI. It stays and gets a data picker per kind.
- Renaming the `invoice_templates` table or the `InvoiceDoc` type. Names stay; meaning widens.
- AI-generated content.

## 3. Decisions

Owner preference: decide and record. Each decision lists the option rejected.

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | The **server** turns a record into a neutral `DocData` payload (one adapter per kind). | Frontend adapters, as today | PDF, WhatsApp, email and the assistant all run on the server and need the same data; one place to secure and test. |
| D2 | One public payload route `GET /public/doc/:kind/:id` and one public page `/d/:kind/:id`. | Keeping one route per kind | Six copies become one. |
| D3 | Old URLs (`/invoice/:id`, `/quotation/:id`, `/delivery/:id`, `/vendor-bill/:id`, `/document/:id`) and `/public/resolve/:id` **stay forever** and render through the new page. | Redirecting or removing them | QR codes are printed on paper already in customers' hands. |
| D4 | Old tokens (`invoice.*`, `document.*`) stay as **aliases** of the new ones, resolved forever. | Migrating stored template JSON | Rewriting saved templates on prod is risky and buys nothing. |
| D5 | Per-document text lives in **one new table** `document_content` keyed by kind + record id + slot. | A new column on every record table | One migration instead of six; works for kinds added later. |
| D6 | Issued financial documents (invoice, credit note, receipt) keep a **frozen template snapshot**, like invoices today (`templateSnapshot`). Drafts and non-financial kinds follow the live template. | Freezing everything / nothing | What was sent must reprint the same; drafts should pick up design fixes. |
| D7 | Kinds are defined once, in a **server registry** (`backend/src/documents/kinds/`). The designer reads each kind's fields, columns, conditions, slots and wording from `GET /doc-kinds` (signed-in). | Duplicating field lists in both apps | The designer's data picker and the server adapter must never disagree. |
| D8 | Line sections and optional lines are **part of the line data** (`SalesOrderLineItem`), not only of the document. | Document-only decoration | Optional lines change totals and conversion (quote → SO), so the store must know about them. |

## 4. Architecture

```
record (quote, invoice, PO…)
   │  kind adapter (server)                 backend/src/documents/kinds/<kind>.ts
   ▼
DocData  ── neutral payload ──►  GET /public/doc/:kind/:id
   │                                         │
   │                                         ▼
   │                            /d/:kind/:id page → DocRenderer(doc, data, kind)
   │                                         │
   └── PDF / WhatsApp / email ── headless print of the same page (document-pdf.ts)
```

### 4.1 DocData (the neutral payload)

```ts
interface DocData {
  kind: DocKindId;                    // 'invoice' | 'quote' | 'delivery' | 'bill' | 'salesOrder' | 'purchaseOrder' | 'creditNote' | 'receipt' | 'statement' | 'letter' | 'memo' | 'certificate' | 'custom'
  id: string;
  companyId: string;
  number: string;
  date: Date;
  status: string;                     // raw; localised by the renderer
  language?: 'ar' | 'en';             // the record's own language, if it has one
  currency: string;
  parties: {                          // whichever apply to the kind
    from: PartyData;                  // the company
    to?: PartyData;                   // client or supplier
    shipTo?: PartyData;
    contact?: PersonData;             // contact person at the other side
    owner?: PersonData;               // salesperson / buyer / issuer
  };
  fields: Record<string, DocValue>;   // kind fields: 'validUntil', 'dueDate', 'carrier', 'trackingNumber', 'reference'…
  lines?: DocLine[];
  totals?: { gross: number; discount: number; net: number; tax: number; total: number; paid?: number; balance?: number };
  content: Record<string, RichNode | string>;  // per-document text (slots), see 4.4
  publicUrl: string;
}

interface DocLine {
  type: 'item' | 'section';           // a section is a heading row inside the table
  optional?: boolean;                 // shown, not counted in totals
  index?: number;                     // printed line number (items only)
  sku?: string;
  description: string;                // already in the document's language
  details?: string;                   // long description under the line
  imageUrl?: string;
  unit?: string;
  quantity?: number;
  orderedQuantity?: number;           // delivery / receiving
  unitPrice?: number;
  discount?: number;                  // amount, already computed
  discountLabel?: string;             // "15%" or "5.000"
  taxRate?: number;
  amount?: number;
  custom?: Record<string, string>;    // values for custom columns, by column id
}
```

`DocValue` is `{ type: 'text' | 'date' | 'money' | 'number', value }` so the renderer formats dates and money in the document's language and currency. The server never formats.

### 4.2 Kind definition

```ts
interface DocKind {
  id: DocKindId;
  label: { en: string; ar: string };
  module: string;                                 // company module that must be on ('sales', 'invoices', 'purchasing'…)
  financial: boolean;                             // has money totals
  freezeOnIssue: boolean;                         // D6
  fields: FieldDef[];                             // tokens offered in the designer: { key, label: {en, ar}, type }
  columns: ColumnKey[];                           // line columns this kind can show
  conditions: ConditionDef[];                     // 'hasDiscount', 'isOverdue', 'partiallyDelivered', 'hasOptionalLines'…
  slots: SlotDef[];                               // per-document text: 'intro', 'scope', 'terms', 'closing', 'instructions'
  wording: Record<string, { en: string; ar: string }>; // 'to' → "Prepared for" / "أُعدّ لـ"; 'date2' → "Valid until"…
  starter: (template?) => InvoiceDoc;             // the default layout for a new template of this kind
  load: (store, id) => { record, companyId } | undefined;
  toDocData: (store, record, opts: { language? }) => DocData;
}
```

The registry is the only list of kinds. `/public/resolve/:id`, the template-type picker (`DOCUMENT_TEMPLATE_TYPES`), the designer's token groups and the PDF service all read from it.

### 4.3 Tokens

- New tokens: `doc.number`, `doc.date`, `doc.status`, `doc.currency`, `doc.total` (and the rest of `totals`), `to.name`, `to.address`, `to.phone`, `to.email`, `to.taxId`, `contact.name`, `contact.phone`, `owner.name`, `owner.phone`, `from.*`, and `fields.<key>` for every kind field (shown in the picker under the kind's own labels, for example "Valid until").
- Aliases (D4): `invoice.number → doc.number`, `invoice.issueDate → doc.date`, `invoice.dueDate → fields.dueDate`, or `fields.validUntil` on a quote or `fields.scheduledFor` on a delivery, `client.* → to.*`, `company.* → from.*`, `document.* → doc.*`. The alias table sits in one file with a test that every old token still resolves.
- `field.<name>` (fill-in boxes on letters and certificates) is unchanged.
- An unknown token resolves to an empty string, as it does today.

### 4.4 Per-document text (slots)

- A new block type, **`slot`**, with `{ slot: 'terms', fallback: RichNode }`. In the designer it shows the template's default text, which the designer edits.
- The record's form (quote form first) shows one rich-text box per slot the chosen template uses, prefilled with the template's default. An unchanged box is **not** stored, so later template edits still flow through.
- Storage (D5): `document_content (id, companyId, kind, recordId, slot, body JSON, updatedAt)`, unique on `(kind, recordId, slot)`. It is deleted with its record and copied along on conversion (quote → SO → invoice) where the target kind has the same slot.
- The existing `notes` field stays and prints where it prints today.

### 4.5 Line features (D8)

`SalesOrderLineItem` gains optional `type: 'item' | 'section'`, `optional`, `details` and `imageUrl`. Rules in the store:
- A section line has a description only. It is skipped by totals, VAT and stock.
- An optional line prints with its price and is left out of `subtotal`, `tax` and `total`. Its own "optional extras" sum is shown when the kind's totals block asks for it.
- When a quote converts to a sales order or an invoice, optional lines are dropped unless the user ticks them in the convert dialog. Sections carry over.
- Old lines without these fields behave exactly as today.

New column keys: `index`, `unit`, `discount`, `tax`, `orderedQuantity`, `image`. `custom` reads `line.custom[columnId]`.

### 4.6 Conditions

`visibleWhen` widens from the fixed list to `string`. The five existing values keep their meaning. Each kind adds its own (`hasDiscount`, `hasOptionalLines`, `isOverdue`, `isPaid`, `partiallyDelivered`, `lang:ar`, `lang:en`). The designer's condition picker lists only the current kind's conditions. An unknown condition shows the block, so a typo never hides content silently.

### 4.7 Delivery out

`document-pdf.ts` gets one `documentPdf(store, kind, id, lang?)` that prints `/d/:kind/:id`. Quote and invoice PDFs call it. WhatsApp "send document" and invoice email take `kind` and use the same function, so every kind that has a template can be sent the same way.

## 5. Phases

Each phase ships on its own and is deployed to prod with the usual backup, swap and rollback recipe.

**Phase 1: engine, with no visible change**
- `DocData`, the registry, adapters for the kinds that print today (invoice, quote, delivery, bill, document/letter/memo/certificate/custom, statement).
- `/public/doc/:kind/:id`, the `/d/:kind/:id` page, old URLs rendering through it, `/public/resolve` from the registry.
- The renderer reads `DocData`; the token alias table; `documentPdf`.
- **Gate:** every template on a copy of the prod database (Peak, GIG, Smart Hammer) renders pixel-identical before and after, in Arabic and English. This is checked by a screenshot-diff script run against both builds in production mode. A difference blocks the release.

**Phase 2: quote features**
- Quote fields (valid-until, salesperson, contact, opportunity, discount totals) and the new columns.
- Slots on the quote form (intro, scope, terms).
- Section and optional lines in the line editor; convert dialog with "include optional lines".
- Kind conditions in the designer.

**Phase 3: new printed documents**
- Sales order, purchase order (to the supplier), credit note, payment receipt. Each one gets a kind adapter, a template type, a starter layout in both languages, and print, PDF, link and WhatsApp buttons on its list.

**Phase 4: starter layouts and polish**
- A quote-only "Proposal" starter (cover, intro, prices, terms, acceptance area), plus starters per kind.
- Designer block names and starter names in Arabic. The data picker groups by party (Us / Them / Contact / Owner / This document).

## 6. Error handling

- Unknown kind, missing record or module switched off: 404 "Document not found." (the same as today; it does not reveal which reason).
- Adapter throws: 500 logged with kind and id. The public page shows "Could not load this document."
- PDF browser unavailable: 503 (unchanged `PdfUnavailableError`).
- A template whose `docType` doesn't match the kind: falls back to the kind's default template, then to `starter()`. A document never fails to print because of a template.

## 7. Security

- Public routes expose exactly what they expose today for existing kinds. A new kind exposes only its `DocData`: no internal notes, cost prices, margins or audit data. Each adapter has a test that lists the payload's keys against an allow-list.
- `module` in the kind definition is checked on every public read, as today.
- Slot text is rich-text JSON rendered through the existing `rich-text.tsx` (no raw HTML).

## 8. Testing

- Unit: each adapter (record → DocData), the alias table (every old token), conditions, totals with sections and optional lines, conversion with and without optional lines.
- Poison fixtures: a record with both-language names, a discount on one line, a zero-VAT line, an optional line and a section, in a non-company currency.
- Render: the Phase 1 screenshot gate. After it, the existing `doc-renderer.test.tsx` runs against `DocData`.
- Mutation check: break an alias or an adapter field on purpose and confirm a test fails.

## 9. Files touched (Phase 1)

- New: `backend/src/documents/kinds/*.ts`, `backend/src/documents/registry.ts`, `backend/src/routes/public-documents.ts`, `frontend/src/app/d/[kind]/[id]/page.tsx`, `frontend/src/modules/finance/doc/aliases.ts`.
- Changed: `doc/doc-renderer.tsx`, `doc/tokens.ts`, `doc/template-to-doc.ts`, `components/invoice-document.tsx`, `services/publicService.ts`, `backend/src/pdf/document-pdf.ts`, `backend/src/server.ts` (public routes and resolve), the old public pages (thin wrappers).
- Migration (Phase 2): `document_content` table; no change to existing tables in Phase 1.
