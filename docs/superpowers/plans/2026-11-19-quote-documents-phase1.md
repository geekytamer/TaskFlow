# Quote Documents (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quotations get a salesperson, per-quote text (intro/scope/terms), section and optional lines, more line columns, quote data tokens, quote conditions, a Proposal starter layout, "Copy quote" and two-language search, all on today's document engine.

**Architecture:** The server stores the new data (one migration: `quotations.ownerUserId` + a kind-neutral `document_content` table) and adds it to the public quote payload as `extras`, `content` and richer lines. The frontend renderer reads those through `DocDataContext.extras` / `content` using the token names the shared engine (spec Phase 2) will keep. Nothing changes for a quote that uses none of the new features.

**Tech Stack:** Node + Express + better-sqlite3 (`backend/src/data/store.ts`), Next.js + React (`frontend/src`), tests with `node:test` (backend: supertest against `dist/`; frontend: `tsx`).

**Spec:** `docs/superpowers/specs/2026-11-19-document-engine-design.md`, sections 4.3–4.6 and 5 (Phase 1).

## Global Constraints

- Every existing quote template prints identically when no new feature is used (gate in Task 12).
- Old tokens (`invoice.*`, `client.*`, `company.*`, `document.*`, `field.*`) keep resolving exactly as today.
- New token names are final engine names: `fields.validUntil`, `contact.name`, `contact.phone`, `owner.name`, `owner.email`, `to.name`, `to.address`, `to.email`, `to.phone`, `to.taxId`, `doc.number`, `doc.date`, `doc.discount`, `doc.optionalTotal`.
- The public quote never carries the opportunity id or title (existing test `the public quotation shows the document and nothing internal`).
- Stored line fields: `lineType?: 'section'` (absent = item), `optional?: true`, `details?: string` (≤2000 chars), `unit?: string` (≤40 chars). Old lines without them behave exactly as today.
- Section rows and unticked optional lines never reach a sales order or invoice in Phase 1. A ticked optional line becomes a normal line.
- Migration id: `177_quote_documents`. If 177 is taken on master when you start, use the next free number and say so in the commit.
- All user-facing text has English and Arabic (`tr(en, ar)` or `docStrings`).
- Backend tests: `cd backend && NODE_ENV=test npm test` (builds first; node 24). One file: `cd backend && npm run build && NODE_ENV=test node --require ./test/helpers/loopback.js --test test/quote-documents.test.js`.
- Frontend tests: `cd frontend && npm test`; one file: `cd frontend && node --import tsx --test src/path/file.test.ts`. Type check: `cd frontend && npx tsc --noEmit`.
- Commit after every task; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/types.ts` | `SalesOrderLineItem` new optional fields; `Quotation.ownerUserId/ownerName/content` |
| `backend/src/data/store.ts` | migration 177; `normalizeQuotationItems`; quote totals skip section/optional; owner; `document_content` methods; `quoteSaleLines`; `copyQuotation` |
| `backend/src/routes/quotations.ts` | `parseQuotationItems`, `parseDocContent`, owner validation, `content` on create/update/get, convert with `includeOptional`, `POST /quotations/:id/copy` |
| `backend/src/server.ts` | public quote payload: richer lines, `extras`, `content` |
| `backend/src/invoice-doc.ts` | accept `slot` block, new column keys, new conditions |
| `backend/test/quote-documents.test.js` | all new backend tests |
| `frontend/src/modules/finance/types.ts` | line fields; column keys; `Quotation` fields |
| `frontend/src/modules/finance/doc/types.ts` | `SlotBlock`, wider `VisibleWhen` |
| `frontend/src/modules/finance/doc/validation.ts` | same acceptance as backend |
| `frontend/src/modules/finance/doc/tokens.ts` | `extras`/`content` on context, new tokens, `QUOTE_TOKEN_GROUP` |
| `frontend/src/modules/finance/doc/quote-lines.ts` (new) | pure helpers: counted lines, optional total, item numbering |
| `frontend/src/modules/finance/doc/strings.ts` | `optional`, `optionalExtras` labels |
| `frontend/src/modules/finance/doc/doc-renderer.tsx` | sections/optional rows, new columns, totals, conditions, slot block |
| `frontend/src/modules/finance/doc/presets.ts` | Proposal starter |
| `frontend/src/services/publicService.ts`, `frontend/src/app/quotation/[id]/page.tsx`, `frontend/src/modules/finance/components/invoice-document.tsx` | carry extras/content to the renderer |
| `frontend/src/modules/finance/components/invoice-designer.tsx` | slot palette item + editor, quote token group, conditions, columns |
| `frontend/src/modules/sales/components/sales-line-items.tsx` | section/optional/details/unit in the editor |
| `frontend/src/modules/sales/components/quotations-panel.tsx` | owner picker, slot boxes, convert dialog, copy, search |
| `frontend/src/services/quotationService.ts` | `content`, `ownerUserId`, `includeOptional`, `copyQuotation`, `getQuotation` |
| `frontend/scripts/quote-print-diff.mjs` (new) | screenshot gate |

---

### Task 1: Quote lines: sections and optional lines on the server

**Files:**
- Modify: `backend/src/types.ts` (`SalesOrderLineItem`, around line 806)
- Modify: `backend/src/data/store.ts` (`quotationTotals` ~16281, `createQuotation` ~16295, `updateQuotation` ~16357, add `normalizeQuotationItems` next to `normalizeSalesOrderItems` ~20522)
- Modify: `backend/src/routes/quotations.ts`
- Create: `backend/test/quote-documents.test.js`

**Interfaces:**
- Produces: `SalesOrderLineItem.lineType?: 'section'`, `.optional?: boolean`, `.details?: string`, `.unit?: string`; store `private normalizeQuotationItems(raw: any[]): SalesOrderLineItem[]`; `isCountedLine(item)` helper (module-level in store.ts) = `item.lineType !== 'section' && !item.optional`.

- [ ] **Step 1: Write the failing tests**

Create `backend/test/quote-documents.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-quote-docs-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false,
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const token = `Bearer ${store.issueToken(admin.id)}`;
  const as = (req) => req.set('Authorization', token);
  return { store, app, as, admin };
}

const tomorrow = () => new Date(Date.now() + 86400000).toISOString();

const mixedLines = [
  { lineType: 'section', description: 'Package A' },
  { description: 'Discovery workshop', quantity: 2, unitPrice: 250, unit: 'day', details: 'Two half-day sessions' },
  { description: 'Design sprint', quantity: 1, unitPrice: 1000, discount: 10, discountType: 'percent' },
  { lineType: 'section', description: 'Extras' },
  { description: 'Extra revision round', quantity: 1, unitPrice: 300, optional: true },
];

async function newQuote(app, as, extra = {}) {
  const res = await as(request(app).post('/companies/1/quotations')).send({
    clientId: 'client-1', issueDate: new Date().toISOString(), validUntil: tomorrow(), taxRate: 5, items: mixedLines, ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('section and optional lines are kept but only counted lines make the total', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  assert.equal(quote.items.length, 5);
  assert.deepEqual(quote.items[0], { lineType: 'section', description: 'Package A', quantity: 0, unitPrice: 0, lineTotal: 0 });
  assert.equal(quote.items[1].unit, 'day');
  assert.equal(quote.items[1].details, 'Two half-day sessions');
  assert.equal(quote.items[4].optional, true);
  assert.equal(quote.items[4].lineTotal, 300);
  assert.equal(quote.subtotal, 1400); // 500 + 900; the optional 300 is left out
  assert.equal(quote.taxAmount, 70);
  assert.equal(quote.totalAmount, 1470);
});

test('a quotation needs at least one counted line', async () => {
  const { app, as } = setup();
  const res = await as(request(app).post('/companies/1/quotations')).send({
    clientId: 'client-1', validUntil: tomorrow(),
    items: [{ lineType: 'section', description: 'Only a heading' }, { description: 'Maybe', quantity: 1, unitPrice: 5, optional: true }],
  });
  assert.equal(res.status, 400);
});

test('old-style lines are stored exactly as before', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as, { items: [{ description: 'Plain line', quantity: 1, unitPrice: 100 }] });
  assert.deepEqual(Object.keys(quote.items[0]).sort(), ['description', 'lineTotal', 'quantity', 'unitPrice']);
});

test('editing keeps sections and optional lines', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  const res = await as(request(app).put(`/quotations/${quote.id}`)).send({ items: mixedLines.slice(0, 3) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.items[0].lineType, 'section');
  assert.equal(res.body.subtotal, 1400);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && npm run build && NODE_ENV=test node --require ./test/helpers/loopback.js --test test/quote-documents.test.js`
Expected: FAIL. The section row is rejected with 400 (`items[0].quantity` is required).

- [ ] **Step 3: Implement**

`backend/src/types.ts`, inside `SalesOrderLineItem` after `lineTotal: number;`:

```ts
  /** A heading row inside a quotation's table; no price, no stock (spec 2026-11-19 §4.5). Absent = a normal line. */
  lineType?: 'section';
  /** Shown with its price, left out of the totals. Quotations only. */
  optional?: boolean;
  /** Longer text printed under the line. */
  details?: string;
  /** Unit the quantity counts in ("day", "pcs"). */
  unit?: string;
```

`backend/src/data/store.ts`, module level near the other helpers at the top (after `NOT_ARCHIVED`):

```ts
/** A quotation line that counts toward the price: not a section heading, not optional. */
const isCountedLine = (item: { lineType?: string; optional?: boolean }) => item.lineType !== 'section' && !item.optional;
```

Replace `quotationTotals`:

```ts
  private quotationTotals(items: SalesOrder['items'], taxRate: number) {
    const subtotal = Number(items.filter(isCountedLine).reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
    const rate = Number(taxRate) > 0 ? Number(taxRate) : 0;
    const taxAmount = Number(((subtotal * rate) / 100).toFixed(2));
    return { subtotal, taxRate: rate, taxAmount, totalAmount: Number((subtotal + taxAmount).toFixed(2)) };
  }
```

Add after `normalizeSalesOrderItems`:

```ts
  /** Sales lines plus section headings and optional lines; order is kept. */
  private normalizeQuotationItems(rawItems: any[]): SalesOrder['items'] {
    const clip = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.replace(/[ \t]+/g, ' ').trim().slice(0, max) : undefined);
    const out: SalesOrder['items'] = [];
    for (const item of Array.isArray(rawItems) ? rawItems : []) {
      if (item?.lineType === 'section') {
        const description = clip(item.description, 300);
        if (description) out.push({ lineType: 'section', description, ...this.lineNames(item), quantity: 0, unitPrice: 0, lineTotal: 0 });
        continue;
      }
      const [line] = this.normalizeSalesOrderItems([item]);
      if (!line) continue;
      const details = clip(item?.details, 2000);
      const unit = clip(item?.unit, 40);
      out.push({ ...line, ...(item?.optional === true ? { optional: true } : {}), ...(details ? { details } : {}), ...(unit ? { unit } : {}) });
    }
    return out;
  }
```

`normalizeSalesOrderItems` returns `undefined` keys for missing fields. The "old-style lines" test checks keys, so strip undefined in the returned line: change the spread to `...Object.fromEntries(Object.entries(line).filter(([, v]) => v !== undefined))`. Check that the existing `quotations.test.js` still passes after that change. It does not compare keys.

In `createQuotation` and `updateQuotation`, replace `this.normalizeSalesOrderItems(` with `this.normalizeQuotationItems(`. Replace the empty check in both:

```ts
    if (!items.some(isCountedLine)) throw new Error('A quotation needs at least one priced line.');
```

`backend/src/routes/quotations.ts`, add above `registerQuotationRoutes`:

```ts
/** Quotation lines: a section row needs only a description; other rows parse as sales lines. */
const parseQuotationItems = (value: unknown, parseSalesOrderItems: (v: unknown) => SalesOrderLineItem[]): SalesOrderLineItem[] => {
  if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, 'items must contain at least one line item.');
  if (value.length > 300) throw new HttpError(400, 'A quotation can have at most 300 lines.');
  return value.map((row, index) => {
    const record = asRecord(row, `items[${index}]`);
    if (record.lineType === 'section') {
      return { lineType: 'section', description: requiredString(record.description, `items[${index}].description`), quantity: 0, unitPrice: 0, lineTotal: 0,
        descriptionAr: optionalString(record.descriptionAr), descriptionEn: optionalString(record.descriptionEn) } as SalesOrderLineItem;
    }
    const [line] = parseSalesOrderItems([record]);
    return {
      ...line,
      optional: record.optional === true ? true : undefined,
      details: optionalString(record.details),
      unit: optionalString(record.unit),
    };
  });
};
```

Add `SalesOrderLineItem` to the `import type` from `'../types'`. In the POST and PUT handlers, replace `parseSalesOrderItems(body.items)` with `parseQuotationItems(body.items, parseSalesOrderItems)`.

- [ ] **Step 4: Run to verify they pass**

Run the one-file command, then `node --require ./test/helpers/loopback.js --test test/quotations.test.js` (with NODE_ENV=test).
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/types.ts backend/src/data/store.ts backend/src/routes/quotations.ts backend/test/quote-documents.test.js
git commit -m "feat(quotes): section and optional lines on the server"
```

---

### Task 2: Migration 177, salesperson and per-quote text storage

**Files:**
- Modify: `backend/src/data/store.ts` (migration list after `176_whatsapp_campaigns_auto`; `createQuotation`, `updateQuotation`, `decodeQuotation`, `deleteQuotation`; new content methods)
- Modify: `backend/src/types.ts` (`Quotation`)
- Modify: `backend/src/routes/quotations.ts`
- Test: `backend/test/quote-documents.test.js`

**Interfaces:**
- Produces:
  - `Quotation.ownerUserId?: string`, `Quotation.ownerName?: string`, `Quotation.content?: Record<string, unknown>` (`content` only on single-quote responses)
  - `store.getDocumentContent(kind: string, recordId: string): Record<string, unknown>`
  - `store.setDocumentContent(companyId: string, kind: string, recordId: string, content: Record<string, unknown | null>): void` (null removes a slot)
  - `store.deleteDocumentContent(kind: string, recordId: string): void`
  - routes: `content` (object) and `ownerUserId` (string|null) accepted on POST/PUT `/quotations`

- [ ] **Step 1: Write the failing tests** (append to `quote-documents.test.js`)

```js
const terms = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Valid for 30 days.' }] }] };

test('a quote has a salesperson: the creator unless chosen, and must be a company member', async () => {
  const { app, as, admin, store } = setup();
  const quote = await newQuote(app, as);
  assert.equal(quote.ownerUserId, admin.id);
  assert.equal(quote.ownerName, admin.name);
  const outsider = store.listUsers().find((u) => !(u.companyIds || []).includes('1'));
  if (outsider) {
    const bad = await as(request(app).put(`/quotations/${quote.id}`)).send({ ownerUserId: outsider.id });
    assert.equal(bad.status, 400);
  }
});

test('per-quote text is saved, returned on the quote, editable while open and removed with the quote', async () => {
  const { app, as, store } = setup();
  const quote = await newQuote(app, as, { content: { terms, intro: 'Dear client,' } });
  const read = await as(request(app).get(`/quotations/${quote.id}`));
  assert.deepEqual(read.body.content, { terms, intro: 'Dear client,' });

  const cleared = await as(request(app).put(`/quotations/${quote.id}`)).send({ content: { intro: null } });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.deepEqual(cleared.body.content, { terms });

  assert.equal((await as(request(app).put(`/quotations/${quote.id}`)).send({ content: { 'bad key!': 'x' } })).status, 400);
  assert.equal((await as(request(app).put(`/quotations/${quote.id}`)).send({ content: { scope: 'x'.repeat(60001) } })).status, 400);

  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' });
  assert.equal((await as(request(app).put(`/quotations/${quote.id}`)).send({ content: { terms: 'changed' } })).status, 400);
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Draft' });
  await as(request(app).delete(`/quotations/${quote.id}`));
  assert.deepEqual(store.getDocumentContent('quote', quote.id), {});
});
```

- [ ] **Step 2: Run to verify they fail**

Expected: FAIL (`ownerUserId` undefined; `content` undefined).

- [ ] **Step 3: Implement**

Migration, appended after the `176_whatsapp_campaigns_auto` entry:

```ts
      {
        // Quote documents (spec 2026-11-19): the salesperson on a quote, and
        // text written per document (intro, scope, terms…) for any kind.
        id: '177_quote_documents',
        run: () => {
          const columns = (this.db.prepare('PRAGMA table_info(quotations)').all() as any[]).map((c) => c.name);
          if (!columns.includes('ownerUserId')) this.db.exec('ALTER TABLE quotations ADD COLUMN ownerUserId TEXT;');
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS document_content (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              kind TEXT NOT NULL,
              recordId TEXT NOT NULL,
              slot TEXT NOT NULL,
              body TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_document_content_slot ON document_content (kind, recordId, slot);
          `);
        },
      },
```

Content methods (put them right after `deleteQuotation`):

```ts
  /** Text written for one document, by slot ("terms" → rich-text JSON or plain string). */
  getDocumentContent(kind: string, recordId: string): Record<string, unknown> {
    const rows = this.db.prepare('SELECT slot, body FROM document_content WHERE kind = ? AND recordId = ? ORDER BY slot').all(kind, recordId) as any[];
    return Object.fromEntries(rows.map((r) => [r.slot, this.parseJson(r.body)]));
  }

  /** Sets or (with null) removes slots; slots not named are left alone. */
  setDocumentContent(companyId: string, kind: string, recordId: string, content: Record<string, unknown | null>): void {
    const now = new Date().toISOString();
    const upsert = this.db.prepare(
      `INSERT INTO document_content (id, companyId, kind, recordId, slot, body, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (kind, recordId, slot) DO UPDATE SET body = excluded.body, updatedAt = excluded.updatedAt`,
    );
    const remove = this.db.prepare('DELETE FROM document_content WHERE kind = ? AND recordId = ? AND slot = ?');
    this.db.transaction(() => {
      for (const [slot, body] of Object.entries(content)) {
        if (body === null) remove.run(kind, recordId, slot);
        else upsert.run(uuid(), companyId, kind, recordId, slot, JSON.stringify(body), now);
      }
    })();
  }

  deleteDocumentContent(kind: string, recordId: string): void {
    this.db.prepare('DELETE FROM document_content WHERE kind = ? AND recordId = ?').run(kind, recordId);
  }
```

In `deleteQuotation`, after the `DELETE FROM quotations` line: `this.deleteDocumentContent('quote', id);`

Owner on `createQuotation`: add `ownerUserId?: string` to the input type. Before building `quote`:

```ts
    const opportunity = input.opportunityId ? this.getOpportunityById(input.opportunityId) : undefined;
    const ownerUserId = input.ownerUserId || opportunity?.ownerUserId || this.currentActor?.userId || undefined;
```

Add `ownerUserId` to the `quote` object, to the INSERT column list (`ownerUserId` / `@ownerUserId`) and to the run params (`ownerUserId: ownerUserId ?? null`).

`updateQuotation`: add `ownerUserId?: string | null` to `updates`. Treat it like `language`: it says who handles the quote, not what it offers, so it changes at any stage. Pull it out with `language`:

```ts
    const { language, ownerUserId, ...offer } = updates;
    if (ownerUserId !== undefined) {
      this.db.prepare('UPDATE quotations SET ownerUserId=?, updatedAt=? WHERE id=?').run(ownerUserId ?? null, new Date().toISOString(), id);
    }
```

`decodeQuotation`, add:

```ts
      ownerUserId: row.ownerUserId ?? undefined,
      ownerName: row.ownerUserId ? this.getUserById(row.ownerUserId)?.name : undefined,
```

`backend/src/types.ts` `Quotation`, add after `language`:

```ts
  /** The salesperson handling the quote. */
  ownerUserId?: string;
  ownerName?: string;
  /** Text written for this quote, by slot; only on single-quote responses. */
  content?: Record<string, unknown>;
```

Routes, in `backend/src/routes/quotations.ts`, add helpers:

```ts
const SLOT_KEY = /^[a-z][a-zA-Z0-9]{0,39}$/;
/** `{ slot: rich-text JSON | string | null }`; null removes the slot's own text. */
const parseDocContent = (value: unknown): Record<string, unknown | null> | undefined => {
  if (value === undefined) return undefined;
  const record = asRecord(value, 'content');
  const out: Record<string, unknown | null> = {};
  for (const [slot, body] of Object.entries(record)) {
    if (!SLOT_KEY.test(slot)) throw new HttpError(400, `content.${slot} is not a valid slot name.`);
    if (body !== null && typeof body !== 'string' && (typeof body !== 'object' || Array.isArray(body) || typeof (body as any).type !== 'string')) {
      throw new HttpError(400, `content.${slot} must be text or a rich-text document.`);
    }
    if (body !== null && JSON.stringify(body).length > 60000) throw new HttpError(400, `content.${slot} is too long.`);
    out[slot] = body;
  }
  return out;
};
```

Inside `registerQuotationRoutes`:

```ts
  const ensureOwner = (ownerUserId: string | null | undefined, companyId: string) => {
    if (!ownerUserId) return;
    const user = store.getUserById(ownerUserId);
    if (!user || !(user.companyIds ?? []).includes(companyId)) throw new HttpError(400, 'The salesperson must be a member of this company.');
  };
  const withContent = (quote: Quotation) => ({ ...quote, content: store.getDocumentContent('quote', quote.id) });
```

(import `Quotation` type.) POST: read `const content = parseDocContent(body.content); const ownerUserId = optionalString(body.ownerUserId); ensureOwner(ownerUserId, companyId);`, pass `ownerUserId` to `createQuotation`, then `if (content) store.setDocumentContent(companyId, 'quote', quote.id, content);` inside the same `withActor` callback, and respond `res.status(201).json(withContent(quote))`.

GET `/quotations/:id`: `res.json(withContent(loadQuotation(req)))`.

PUT: parse `content` and `ownerUserId` (`body.ownerUserId !== undefined ? optionalString(body.ownerUserId) ?? null : undefined`), `ensureOwner`. Content is part of the offer. If `content` is present and the quote is converted, Accepted or Declined, refuse with `400 'An accepted, declined or converted quotation cannot change its text. Reopen it as a draft first.'`. Call `updateQuotation` with `ownerUserId`, then `setDocumentContent`, and respond `withContent(updated)`.

- [ ] **Step 4: Run to verify they pass**

Run the one-file command plus `test/quotations.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/test/quote-documents.test.js
git commit -m "feat(quotes): salesperson and per-quote text (migration 177)"
```

---

### Task 3: Conversion with optional lines, and Copy quote

**Files:**
- Modify: `backend/src/data/store.ts` (new `quoteSaleLines`, `copyQuotation`)
- Modify: `backend/src/routes/quotations.ts` (`/sales-order`, `/invoice`, new `/copy`)
- Test: `backend/test/quote-documents.test.js`

**Interfaces:**
- Consumes: `isCountedLine`, `quotationTotals`, `getDocumentContent`, `setDocumentContent` (Tasks 1–2)
- Produces: `store.quoteSaleLines(quote: Quotation, includeOptional: number[]): { items: SalesOrderLineItem[]; totals: { subtotal; taxRate; taxAmount; totalAmount } }`; `store.copyQuotation(id: string): Quotation`; body `{ includeOptional?: number[] }` (indexes into `quote.items`) on both convert routes; `POST /quotations/:id/copy` → 201 new quote.

- [ ] **Step 1: Write the failing tests**

```js
test('converting drops sections and unticked optional lines; a ticked one counts', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' });
  const order = await as(request(app).post(`/quotations/${quote.id}/sales-order`)).send({ includeOptional: [4] });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.deepEqual(order.body.items.map((i) => i.description), ['Discovery workshop', 'Design sprint', 'Extra revision round']);
  assert.ok(order.body.items.every((i) => i.lineType === undefined && i.optional === undefined));
  assert.equal(order.body.totalAmount, 1700);
});

test('invoicing a quote without ticking optional lines bills only counted lines', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' });
  const invoice = await as(request(app).post(`/quotations/${quote.id}/invoice`)).send({});
  assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
  assert.equal(invoice.body.lineItems.length, 2);
  assert.equal(invoice.body.total, 1470);
  const bad = await as(request(app).post(`/quotations/${(await newQuote(app, as)).id}/invoice`)).send({ includeOptional: [1] });
  assert.equal(bad.status, 400, 'index 1 is not an optional line (and the quote is not accepted)');
});

test('copy quote makes a fresh draft with the same lines, text and salesperson', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as, { content: { terms } , notes: 'n' });
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Declined' });
  const copy = await as(request(app).post(`/quotations/${quote.id}/copy`));
  assert.equal(copy.status, 201, JSON.stringify(copy.body));
  assert.notEqual(copy.body.id, quote.id);
  assert.notEqual(copy.body.quoteNumber, quote.quoteNumber);
  assert.equal(copy.body.status, 'Draft');
  assert.deepEqual(copy.body.items, quote.items);
  assert.equal(copy.body.notes, 'n');
  assert.equal(copy.body.ownerUserId, quote.ownerUserId);
  assert.deepEqual(copy.body.content, { terms });
  assert.ok(new Date(copy.body.validUntil) > new Date(Date.now() + 29 * 86400000));
});
```

- [ ] **Step 2: Run to verify they fail**

Expected: FAIL. The order has 5 items, and `/copy` returns 404.

- [ ] **Step 3: Implement**

Store, next to `linkQuotation`:

```ts
  /** The lines a quote sells: no section rows; optional lines only when ticked (by index), then as normal lines. */
  quoteSaleLines(quote: Quotation, includeOptional: number[] = []) {
    const ticked = new Set(includeOptional);
    for (const index of ticked) {
      if (!quote.items[index]?.optional) throw new Error(`Line ${index + 1} is not an optional line.`);
    }
    const items = quote.items
      .filter((item, index) => item.lineType !== 'section' && (!item.optional || ticked.has(index)))
      .map(({ lineType: _l, optional: _o, details: _d, ...line }) => line);
    return { items, totals: this.quotationTotals(items, quote.taxRate) };
  }

  /** A fresh draft from an existing quote: same client, lines, text and salesperson; dated today, valid 30 days. */
  copyQuotation(id: string): Quotation {
    const source = this.getQuotationById(id);
    if (!source) throw new Error('Quotation not found.');
    const issueDate = new Date();
    const copy = this.createQuotation({
      companyId: source.companyId, clientId: source.clientId, contactId: source.contactId, opportunityId: source.opportunityId,
      issueDate, validUntil: new Date(issueDate.getTime() + 30 * 86400000), items: source.items, taxRate: source.taxRate,
      currency: source.currency, exchangeRate: source.exchangeRate, notes: source.notes, templateId: source.templateId,
      language: source.language ?? null, ownerUserId: source.ownerUserId,
    });
    const content = this.getDocumentContent('quote', source.id);
    if (Object.keys(content).length) this.setDocumentContent(copy.companyId, 'quote', copy.id, content);
    return copy;
  }
```

`details` is dropped on conversion because sales-order and invoice documents don't print it until Phase 2.

Routes. Add a parser:

```ts
const parseIncludeOptional = (value: unknown): number[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => !Number.isInteger(v) || v < 0)) throw new HttpError(400, 'includeOptional must be a list of line numbers.');
  return value as number[];
};
```

In `/sales-order`, after the `Accepted` check: `const sale = asBadRequest(() => store.quoteSaleLines(quote, parseIncludeOptional(body.includeOptional)));`. Move `const body = ...` above it. Replace `quote.items` with `sale.items` in `ensureSalesItemsBelongToCompany` and `createSalesOrder`.

In `/invoice`: same `sale`. Map `sale.items` into `lineItems` and set `total: sale.totals.totalAmount`.

New route before `app.delete`:

```ts
  app.post(
    '/quotations/:id/copy',
    authMiddleware,
    handler((req, res) => {
      const quote = loadQuotation(req);
      ensureSalesItemsBelongToCompany(quote.items.filter((i) => i.lineType !== 'section'), quote.companyId);
      const copy = asBadRequest(() => withActor(req, () => store.copyQuotation(quote.id)));
      res.status(201).json(withContent(copy));
    }),
  );
```

Register the new route wherever the authz route registry requires it. Run `grep -n "'/quotations/:id/invoice'" backend/src/authz/*.ts` and add a `'/quotations/:id/copy'` entry next to each match with the same permission as `POST /companies/:companyId/quotations` (`sales.create`). `test/authz-route-registry.test.js` fails if this is missed.

- [ ] **Step 4: Run to verify they pass**

Run the one-file command, `test/quotations.test.js` and `test/authz-route-registry.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/test/quote-documents.test.js
git commit -m "feat(quotes): convert with optional lines; copy quote"
```

---

### Task 4: Public quote payload, and the server accepts the new template pieces

**Files:**
- Modify: `backend/src/server.ts` (`/public/quotations/:id`, ~2321)
- Modify: `backend/src/invoice-doc.ts`
- Test: `backend/test/quote-documents.test.js`

**Interfaces:**
- Produces: the public quote JSON gains `quotation.items[].lineType|optional|details|unit`, `quotation.extras: Record<string, { type: 'text' | 'date'; value: string }>` (keys `fields.validUntil`, `contact.name`, `contact.phone`, `owner.name`, `owner.email`, `to.phone`, `to.taxId`; empty values omitted) and `quotation.content`. The template validator accepts block `{ type: 'slot', slot: string, fallback?: RichNode | string, title?: string }`, column keys `index`, `discount`, `unit`, and `visibleWhen` values `hasDiscount`, `hasOptionalLines`, `lang:ar`, `lang:en`.

- [ ] **Step 1: Write the failing tests**

```js
test('the public quote carries lines, quote data and text, still with no opportunity', async () => {
  const { app, as } = setup();
  const contact = (await as(request(app).post('/companies/1/contacts')).send({ name: 'Gulf Retail LLC', contactPerson: 'Sara', phone: '+968 9000 0000' })).body;
  const opp = (await as(request(app).post('/companies/1/opportunities')).send({ contactId: contact.id, title: 'Secret deal', serviceType: 'Web' })).body;
  const quote = await newQuote(app, as, { opportunityId: opp.id, content: { terms } });
  const res = await request(app).get(`/public/quotations/${quote.id}`);
  assert.equal(res.status, 200);
  const q = res.body.quotation;
  assert.equal(q.items[0].lineType, 'section');
  assert.equal(q.items[4].optional, true);
  assert.equal(q.items[1].details, 'Two half-day sessions');
  assert.equal(q.extras['contact.name'].value, 'Sara');
  assert.equal(q.extras['contact.phone'].value, '+968 9000 0000');
  assert.equal(q.extras['fields.validUntil'].type, 'date');
  assert.ok(q.extras['owner.name'].value);
  assert.deepEqual(q.content, { terms });
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes(opp.id) && !raw.includes('Secret deal'));
});

test('a quote template may use slots, new columns and new conditions', async () => {
  const { app, as } = setup();
  const doc = {
    version: 1, page: { size: 'A4', orientation: 'portrait', margin: { top: 10, right: 10, bottom: 10, left: 10 } },
    theme: { fontFamily: 'Inter', primaryColor: '#111111', accentColor: '#222222', textColor: '#333333' },
    body: [
      { id: 's1', type: 'slot', slot: 'terms', fallback: 'Payment in 30 days.' },
      { id: 'l1', type: 'lineItems', visibleWhen: 'hasOptionalLines', columns: [
        { id: 'c1', key: 'index', label: '#', visible: true }, { id: 'c2', key: 'unit', label: 'Unit', visible: true }, { id: 'c3', key: 'discount', label: 'Off', visible: true },
      ] },
      { id: 't1', type: 'text', content: 'x', visibleWhen: 'lang:ar' },
    ],
  };
  const res = await as(request(app).post('/companies/1/invoice-templates')).send({ name: 'Proposal', docType: 'quote', layout: 'classic', primaryColor: '#111111', accentColor: '#222222', doc });
  assert.ok([200, 201].includes(res.status), JSON.stringify(res.body));
  const bad = await as(request(app).post('/companies/1/invoice-templates')).send({ name: 'Bad', docType: 'quote', layout: 'classic', primaryColor: '#111111', accentColor: '#222222',
    doc: { ...doc, body: [{ id: 's1', type: 'slot', slot: 'Bad Slot!' }] } });
  assert.equal(bad.status, 400);
});
```

Before running, open `backend/test/api.test.js` and search for `invoice-templates` to confirm the create route and its required fields. Adjust the two POST bodies above to match what that test sends.

- [ ] **Step 2: Run to verify they fail**

Expected: FAIL (`extras` undefined; slot block "unsupported").

- [ ] **Step 3: Implement**

`server.ts`, inside the public quotation handler, before `res.json`:

```ts
      // Quote data for the document (spec 2026-11-19 §4.3 names). The opportunity stays out on purpose.
      const contact = quote.contactId ? store.getContactById(quote.contactId) : undefined;
      const owner = quote.ownerUserId ? store.getUserById(quote.ownerUserId) : undefined;
      const extrasRaw: Record<string, { type: 'text' | 'date'; value: string | undefined }> = {
        'fields.validUntil': { type: 'date', value: new Date(quote.validUntil).toISOString() },
        'contact.name': { type: 'text', value: contact?.contactPerson || client?.contactName },
        'contact.phone': { type: 'text', value: contact?.phone || client?.phone },
        'owner.name': { type: 'text', value: owner?.name },
        'owner.email': { type: 'text', value: owner?.email },
        'to.phone': { type: 'text', value: client?.phone || contact?.phone },
        'to.taxId': { type: 'text', value: client?.vatNumber || contact?.taxNumber },
      };
      const extras = Object.fromEntries(Object.entries(extrasRaw).filter(([, v]) => v.value));
```

In the `items` map, add `lineType: item.lineType, optional: item.optional, details: item.details, unit: item.unit,`. Add `extras` and `content: store.getDocumentContent('quote', quote.id)` to `quotation`. `client` must be declared before this block; move the `const client = ...` line up if needed.

`invoice-doc.ts`:
- Add `'slot'` to `blockTypes`. Add `'hasDiscount', 'hasOptionalLines', 'lang:ar', 'lang:en'` to `visibleWhenValues`.
- In the column-key array on line 127, add `'index', 'discount', 'unit'`.
- In the block `switch`, add:

```ts
    case 'slot':
      if (typeof value.slot !== 'string' || !/^[a-z][a-zA-Z0-9]{0,39}$/.test(value.slot)) errors.push(`${path}.slot must be a slot name like "terms".`);
      stringValue(value.title, `${path}.title`, errors, { optional: true, max: 200, allowEmpty: true });
      if (value.fallback !== undefined && typeof value.fallback !== 'string' && !isRecord(value.fallback)) errors.push(`${path}.fallback must be text or a rich-text document.`);
      if (value.fallback !== undefined && JSON.stringify(value.fallback).length > 60000) errors.push(`${path}.fallback is too long.`);
      break;
```

- [ ] **Step 4: Run to verify they pass**

Run the one-file command, `test/quotations.test.js` and `test/api.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/test/quote-documents.test.js
git commit -m "feat(quotes): public quote carries quote data, text and line kinds; templates accept slots"
```

---

### Task 5: Frontend types, validation and tokens

**Files:**
- Modify: `frontend/src/modules/finance/types.ts` (`SalesOrderLineItem` ~131, `InvoiceLineItem` ~63, `InvoiceColumnKey` 240, `Quotation` ~148)
- Modify: `frontend/src/modules/finance/doc/types.ts`
- Modify: `frontend/src/modules/finance/doc/validation.ts`
- Modify: `frontend/src/modules/finance/doc/tokens.ts`
- Test: create `frontend/src/modules/finance/doc/tokens.test.ts`

**Interfaces:**
- Produces:
  - `type DocExtras = Record<string, { type: 'text' | 'date'; value: string }>` (exported from `doc/tokens.ts`)
  - `DocDataContext.extras?: DocExtras`, `DocDataContext.content?: Record<string, RichNode | string>`
  - `QUOTE_TOKEN_GROUP` (one group), `quoteTokenGroups(base)` → base groups + quote group
  - `SlotBlock` `{ type: 'slot'; slot: string; title?: string; fallback?: RichNode | string }`
  - `VisibleWhen` adds `'hasDiscount' | 'hasOptionalLines' | 'lang:ar' | 'lang:en'`
  - `InvoiceColumnKey` adds `'index' | 'discount' | 'unit'`
  - both line types get `lineType?: 'section'; optional?: boolean; details?: string; unit?: string`
  - `Quotation` gets `ownerUserId?`, `ownerName?`, `content?: Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

`frontend/src/modules/finance/doc/tokens.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveToken, resolveTokens, type DocDataContext } from './tokens';
import { validateInvoiceDoc } from './validation';

const ctx = (extra: Partial<DocDataContext> = {}): DocDataContext => ({
  invoice: { id: 'q1', invoiceNumber: 'QT-0500', issueDate: new Date('2026-11-19'), dueDate: new Date('2026-12-19'), lineItems: [], total: 0, status: 'Draft', currency: 'OMR' } as never,
  client: { id: 'c1', name: 'Gulf Retail', address: 'Muscat', email: 'a@b.om' } as never,
  company: { id: '1', name: 'Peak', address: 'Muscat' } as never,
  subtotal: 0, taxAmount: 0, total: 0, formatMoney: (v) => String(v), publicUrl: '', locale: 'en',
  ...extra,
});

test('old tokens still resolve exactly as before', () => {
  assert.equal(resolveToken('invoice.number', ctx()), 'QT-0500');
  assert.equal(resolveToken('client.name', ctx()), 'Gulf Retail');
  assert.equal(resolveToken('company.name', ctx()), 'Peak');
});

test('new names resolve: party aliases, doc fields and quote extras', () => {
  const c = ctx({ extras: { 'contact.name': { type: 'text', value: 'Sara' }, 'fields.validUntil': { type: 'date', value: '2026-12-19T00:00:00.000Z' } } });
  assert.equal(resolveToken('to.name', c), 'Gulf Retail');
  assert.equal(resolveToken('doc.number', c), 'QT-0500');
  assert.equal(resolveToken('contact.name', c), 'Sara');
  assert.match(resolveToken('fields.validUntil', c), /2026/);
  assert.equal(resolveToken('owner.name', c), '', 'missing extra prints nothing');
  assert.equal(resolveTokens('For {{contact.name}}', c), 'For Sara');
});

test('templates may use slots, new columns and new conditions', () => {
  const base = { version: 1, page: { size: 'A4', orientation: 'portrait', margin: {} }, theme: { fontFamily: 'Inter', primaryColor: '#111', accentColor: '#222', textColor: '#333' } };
  assert.deepEqual(validateInvoiceDoc({ ...base, body: [
    { id: 'a', type: 'slot', slot: 'terms', fallback: 'x' },
    { id: 'b', type: 'lineItems', visibleWhen: 'hasOptionalLines', columns: [{ id: 'i', key: 'index', label: '#', visible: true }] },
  ] }), []);
  assert.notDeepEqual(validateInvoiceDoc({ ...base, body: [{ id: 'a', type: 'slot', slot: 'Bad!' }] }), []);
});
```

Before writing the third test, run `grep -n "^export function" frontend/src/modules/finance/doc/validation.ts` to get the exported validator's name. If it isn't `validateInvoiceDoc`, use that name.

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && node --import tsx --test src/modules/finance/doc/tokens.test.ts`
Expected: FAIL (`to.name` resolves to `''`).

- [ ] **Step 3: Implement**

`types.ts`: add the four line fields (with the same comments as the backend) to `SalesOrderLineItem` and `InvoiceLineItem`. Change `InvoiceColumnKey` to `'sku' | 'description' | 'quantity' | 'unitPrice' | 'amount' | 'custom' | 'index' | 'discount' | 'unit'`. Add the three `Quotation` fields.

`doc/types.ts`:

```ts
export type VisibleWhen = 'always' | 'hasNotes' | 'hasBankAccounts' | 'hasLogo' | 'hasStamp' | 'hasSignature'
  | 'hasDiscount' | 'hasOptionalLines' | 'lang:ar' | 'lang:en';

/** Text written per document (spec 2026-11-19 §4.4): the document's own, else the template's fallback. */
export interface SlotBlock extends BaseBlock {
  type: 'slot';
  /** Slot name, e.g. "intro", "scope", "terms". */
  slot: string;
  /** Heading printed above the text; empty prints none. */
  title?: string;
  fallback?: RichNode | string;
}
```

Add `| SlotBlock` to `Block`.

`validation.ts`: the same additions as the backend in Task 4. Add `'slot'` to `BLOCK_TYPES`, the four conditions to `VISIBLE_WHEN` and the three keys to the column list. Add a `case 'slot':` with the same three checks, using this file's `checkString` helper.

`tokens.ts`, top:

```ts
import type { RichNode } from './types';

/** Record data beyond the invoice shape, keyed by final token name (spec 2026-11-19 §4.3). */
export type DocExtras = Record<string, { type: 'text' | 'date'; value: string }>;
```

Add to `DocDataContext`:

```ts
  /** Quote data and other kind fields, by token name ("contact.name", "fields.validUntil"). */
  extras?: DocExtras;
  /** Text written for this document, by slot. */
  content?: Record<string, RichNode | string>;
```

In `resolveToken`, add cases before `default`:

```ts
    case 'doc.number': return invoice.invoiceNumber || '';
    case 'doc.date': return fmtDate(invoice.issueDate, ctx.locale);
    case 'doc.status': return localizeStatus(invoice.status || '', ctx.locale);
    case 'doc.currency': return invoice.currency || 'USD';
    case 'doc.total': return ctx.formatMoney(ctx.total);
    case 'to.name': return resolveToken('client.name', ctx);
    case 'to.address': return client?.address || '';
    case 'to.email': return client?.email || '';
    case 'from.name': return company?.name || '';
    case 'from.address': return company?.address || '';
```

Change `default`:

```ts
    default: {
      const key = token.trim();
      const extra = ctx.extras?.[key];
      if (extra) return extra.type === 'date' ? fmtDate(new Date(extra.value), ctx.locale) : extra.value;
      if (!key.startsWith('field.')) return '';
      return ctx.fields?.[key] || FIELD_FALLBACKS[key]?.(ctx) || '';
    }
```

`doc.discount` and `doc.optionalTotal` need line helpers, so they're added in Task 6.

Add the token group:

```ts
/** Quote data in the designer's picker (quote templates only). */
export const QUOTE_TOKEN_GROUP: (typeof TOKEN_GROUPS)[number] = {
  group: 'Quotation',
  tokens: [
    { token: 'fields.validUntil', label: 'Valid until' },
    { token: 'owner.name', label: 'Salesperson' },
    { token: 'owner.email', label: 'Salesperson email' },
    { token: 'contact.name', label: 'Contact person' },
    { token: 'contact.phone', label: 'Contact phone' },
    { token: 'to.phone', label: 'Client phone' },
    { token: 'to.taxId', label: 'Client tax number' },
    { token: 'doc.discount', label: 'Total discount' },
    { token: 'doc.optionalTotal', label: 'Optional extras total' },
  ],
};
export const quoteTokenGroups = (base: typeof TOKEN_GROUPS): typeof TOKEN_GROUPS => [...base, QUOTE_TOKEN_GROUP];
```

Add Arabic labels to `AR_TOKEN_LABELS`: `Quotation: 'عرض السعر', 'Valid until': 'صالح حتى', Salesperson: 'مسؤول المبيعات', 'Salesperson email': 'بريد مسؤول المبيعات', 'Contact person': 'الشخص المسؤول', 'Contact phone': 'هاتف المسؤول', 'Client phone': 'هاتف العميل', 'Client tax number': 'الرقم الضريبي للعميل', 'Total discount': 'إجمالي الخصم', 'Optional extras total': 'إجمالي الإضافات الاختيارية'`.

- [ ] **Step 4: Run to verify it passes**

Run the test file, then `cd frontend && npx tsc --noEmit`. Expected: PASS, no type errors. If `doc-renderer.tsx` fails exhaustiveness on `Block`, the `default: return null` already covers it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/finance
git commit -m "feat(docs): quote tokens, slot block type, new columns and conditions (types, validation)"
```

---

### Task 6: Renderer: sections, optional lines, new columns, totals, conditions, slots

**Files:**
- Create: `frontend/src/modules/finance/doc/quote-lines.ts`
- Modify: `frontend/src/modules/finance/doc/strings.ts`
- Modify: `frontend/src/modules/finance/doc/tokens.ts` (`doc.discount`, `doc.optionalTotal`)
- Modify: `frontend/src/modules/finance/doc/doc-renderer.tsx`
- Test: create `frontend/src/modules/finance/doc/quote-lines.test.ts`; add to `doc-renderer.test.tsx`

**Interfaces:**
- Consumes: `DocDataContext.extras/content`, `SlotBlock`, line fields (Task 5)
- Produces: `countedLines<T>(lines: T[]): T[]`, `optionalTotal(lines): number`, `itemNumbers(lines): (number | null)[]` from `quote-lines.ts`; `DocRendererProps.extras?: DocExtras`, `DocRendererProps.content?: Record<string, RichNode | string>`; `DocStrings.optional`, `DocStrings.optionalExtras`.

- [ ] **Step 1: Write the failing tests**

`quote-lines.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { countedLines, itemNumbers, optionalTotal } from './quote-lines';

const lines = [
  { lineType: 'section' as const, description: 'A', quantity: 0, unitPrice: 0, amount: 0 },
  { description: 'x', quantity: 1, unitPrice: 10, amount: 10 },
  { description: 'y', quantity: 1, unitPrice: 5, amount: 5, optional: true },
  { description: 'z', quantity: 2, unitPrice: 1, amount: 2 },
];

test('only priced, non-optional lines count', () => {
  assert.deepEqual(countedLines(lines).map((l) => l.description), ['x', 'z']);
  assert.equal(optionalTotal(lines), 5);
});

test('numbering skips sections but numbers optional lines', () => {
  assert.deepEqual(itemNumbers(lines), [null, 1, 2, 3]);
});
```

Append to `doc-renderer.test.tsx` (it already imports `renderToStaticMarkup`):

```tsx
test('a quote with sections and optional lines totals only counted lines and prints quote data and slots', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const doc = {
    version: 1, direction: 'ltr', page: { size: 'A4', orientation: 'portrait', margin: {} },
    theme: { fontFamily: 'Inter', primaryColor: '#111111', accentColor: '#222222', textColor: '#333333' },
    body: [
      { id: 'd', type: 'details', fields: [{ label: 'Contact', value: '{{contact.name}}' }] },
      { id: 'l', type: 'lineItems', columns: [
        { id: 'n', key: 'index', label: '#', visible: true }, { id: 'ds', key: 'description', label: 'Description', visible: true },
        { id: 'u', key: 'unit', label: 'Unit', visible: true }, { id: 'a', key: 'amount', label: 'Amount', visible: true },
      ] },
      { id: 't', type: 'totals' },
      { id: 's', type: 'slot', slot: 'terms', title: 'Terms', fallback: 'Template terms' },
      { id: 'i', type: 'slot', slot: 'intro', fallback: 'Template intro' },
      { id: 'ar', type: 'text', content: 'ARABIC ONLY', visibleWhen: 'lang:ar' },
    ],
  } as never;
  const invoice = {
    id: 'q1', invoiceNumber: 'QT-1', issueDate: new Date(), dueDate: new Date(), status: 'Draft', currency: 'USD', taxRate: 0, total: 10,
    lineItems: [
      { itemType: 'Manual', lineType: 'section', description: 'Package A', quantity: 0, unitPrice: 0, amount: 0 },
      { itemType: 'Manual', description: 'Workshop', details: 'Half day', unit: 'day', quantity: 1, unitPrice: 10, amount: 10 },
      { itemType: 'Manual', description: 'Extra', quantity: 1, unitPrice: 99, amount: 99, optional: true },
    ],
  } as never;
  const html = renderToStaticMarkup(
    <DocRenderer doc={doc} invoice={invoice} publicUrl="" extras={{ 'contact.name': { type: 'text', value: 'Sara' } }} content={{ terms: 'Our own terms' }} />,
  );
  assert.ok(html.includes('Package A'));
  assert.ok(html.includes('Half day'));
  assert.ok(html.includes('day'));
  assert.ok(html.includes('Sara'));
  assert.ok(html.includes('Our own terms') && !html.includes('Template terms'), 'document text wins over the fallback');
  assert.ok(html.includes('Template intro'), 'fallback used when the document has none');
  assert.ok(html.includes('Optional'));
  assert.ok(!html.includes('ARABIC ONLY'));
  assert.ok(!html.includes('109'), 'the optional 99 is not in the total');
});
```

- [ ] **Step 2: Run to verify they fail**

Run both test files. Expected: FAIL (`quote-lines` module missing; renderer ignores `extras`/`content`).

- [ ] **Step 3: Implement**

`quote-lines.ts`:

```ts
/** Helpers for quotation lines (spec 2026-11-19 §4.5): sections are headings, optional lines are priced but not counted. */
type QuoteLine = { lineType?: 'section'; optional?: boolean; amount?: number; lineTotal?: number };

const value = (line: QuoteLine) => Number(line.amount ?? line.lineTotal ?? 0) || 0;

export const countedLines = <T extends QuoteLine>(lines: T[]): T[] => lines.filter((l) => l.lineType !== 'section' && !l.optional);

export const optionalTotal = (lines: QuoteLine[]): number =>
  Number(lines.filter((l) => l.lineType !== 'section' && l.optional).reduce((sum, l) => sum + value(l), 0).toFixed(2));

/** Printed line numbers: sections get none; items (optional ones included) count 1, 2, 3… */
export const itemNumbers = (lines: QuoteLine[]): (number | null)[] => {
  let n = 0;
  return lines.map((l) => (l.lineType === 'section' ? null : ++n));
};
```

`strings.ts`: add `optional: string; optionalExtras: string;` to `DocStrings`, `optional: 'Optional', optionalExtras: 'Optional extras'` to `EN` and `optional: 'اختياري', optionalExtras: 'إضافات اختيارية'` to `AR`.

`tokens.ts`: import `countedLines, optionalTotal` from `./quote-lines` and `discountTotals` from `@/lib/discount`. Add these cases:

```ts
    case 'doc.discount': return ctx.formatMoney(discountTotals(countedLines(invoice.lineItems || [])).discount);
    case 'doc.optionalTotal': return ctx.formatMoney(optionalTotal(invoice.lineItems || []));
```

`doc-renderer.tsx`:

1. Import `countedLines, itemNumbers, optionalTotal` from `./quote-lines`, the `SlotBlock` type, and `type DocExtras` from `./tokens`.
2. Add props:

```ts
  /** Record data beyond the invoice shape (quote data), by token name. */
  extras?: DocExtras;
  /** Text written for this document, by slot. */
  content?: Record<string, RichNode | string>;
```

   Add `RichNode` to the type import from `./types`, destructure `extras` and `content` in `DocRenderer`, and add them to `ctx`.
3. Totals use counted lines only. Replace `const vat = invoiceVat(invoice.lineItems, invoice.taxRate || 0);` with:

```ts
  const vat = invoiceVat(countedLines(invoice.lineItems), invoice.taxRate || 0);
```

4. `isVisible`, add cases:

```ts
    case 'hasDiscount': return countedLines(ctx.invoice.lineItems).some((l) => Number(l.discount) > 0);
    case 'hasOptionalLines': return ctx.invoice.lineItems.some((l) => l.optional && l.lineType !== 'section');
    case 'lang:ar': return (ctx.locale ?? getCurrentLocale()).toLowerCase().startsWith('ar');
    case 'lang:en': return !(ctx.locale ?? getCurrentLocale()).toLowerCase().startsWith('ar');
```

5. `LineItemsView`: compute `const numbers = itemNumbers(ctx.invoice.lineItems);` (whole-document numbering, so a table split across pages keeps counting). In `cell`, the `description` case appends details:

```tsx
        const body = note ? <>{text} <span style={{ color: '#64748b', fontSize: 12 }}>({note})</span></> : text;
        const optionalTag = line.optional ? <span style={{ marginInlineStart: 6, fontSize: 11, color: '#64748b' }}>({s?.optional ?? 'Optional'})</span> : null;
        return <>{body}{optionalTag}{line.details && <div style={{ color: '#64748b', fontSize: 12, whiteSpace: 'pre-wrap', marginTop: 2 }}>{line.details}</div>}</>;
```

   Add these cases:

```tsx
      case 'index': return numbers[rowOffset + rowIndex] ?? '';
      case 'unit': return line.unit ?? '';
      case 'discount': return Number(line.discount) > 0 ? (line.discountType === 'amount' ? money(line.discount!) : `${Number(line.discount!.toFixed(2))}%`) : '';
```

   To support `index`, change the signature to `cell(col, line, rowIndex: number)` and pass `i` from the row map. In the `tbody` map, render a section row as one spanning cell:

```tsx
        {rows.map((line, i) => line.lineType === 'section' ? (
          <tr key={rowOffset + i}>
            <td colSpan={columns.length} style={{ padding: '14px 16px 6px', fontWeight: 700, color: theme.primaryColor, borderBottom: `2px solid ${theme.accentColor}` }}>
              {((ctx.locale ?? getCurrentLocale()).toLowerCase().startsWith('ar') ? line.descriptionAr : line.descriptionEn) || line.description}
            </td>
          </tr>
        ) : (
          <tr key={rowOffset + i} style={{ background: (rowOffset + i) % 2 ? '#f8fafc' : '#fff', fontStyle: line.optional ? 'italic' : undefined }}>
            {columns.map((c) => <td key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', textAlign: alignClass[defaultAlign(c)] }}>{cell(c, line, i)}</td>)}
          </tr>
        ))}
```

   In `defaultAlign`, treat `index` and `unit` like `sku` (start-aligned): `col.key === 'description' || col.key === 'sku' || col.key === 'unit' ? 'left' : 'right'`.
6. `TotalsView`: use `const disc = discountTotals(countedLines(ctx.invoice.lineItems));`. After the total row add:

```tsx
        {optionalTotal(ctx.invoice.lineItems) > 0 && (
          <div style={{ ...row, marginTop: 8, color: '#64748b', fontSize: 13 }}><span>{s.optionalExtras}</span><span>{money(optionalTotal(ctx.invoice.lineItems))}</span></div>
        )}
```

7. Slot block, in `renderBlock`'s switch before `default`:

```tsx
      case 'slot': {
        const slot = block as SlotBlock;
        const own = ctx.content?.[slot.slot];
        const body = own ?? slot.fallback;
        if (!body || (typeof body === 'string' && !body.trim())) return null;
        return (
          <div key={block.id} style={base}>
            {slot.title && <div style={{ fontWeight: 600, color: theme.primaryColor, marginBottom: 6 }}>{localizeLabel(slot.title, s)}</div>}
            {typeof body === 'string'
              ? <div style={{ whiteSpace: 'pre-wrap' }}>{resolveTokens(body, ctx)}</div>
              : <RichNodeView node={body} resolve={(token) => resolveToken(token, ctx)} primaryColor={theme.primaryColor} />}
          </div>
        );
      }
```

`base` is the style variable the other cases in this switch already use.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && node --import tsx --test src/modules/finance/doc/quote-lines.test.ts src/modules/finance/doc/doc-renderer.test.tsx src/modules/finance/doc/tokens.test.ts && npx tsc --noEmit`
Expected: PASS. All older tests in `doc-renderer.test.tsx` still pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/finance/doc
git commit -m "feat(docs): quote sections, optional lines, new columns, conditions and slots in the renderer"
```

---

### Task 7: Carry quote data to the printed quote

**Files:**
- Modify: `frontend/src/services/publicService.ts` (`getPublicQuotation`, ~66)
- Modify: `frontend/src/modules/finance/components/invoice-document.tsx`
- Modify: `frontend/src/app/quotation/[id]/page.tsx`
- Test: create `frontend/src/services/publicService.test.ts`

**Interfaces:**
- Consumes: public payload (Task 4); `DocRendererProps.extras/content` (Task 6)
- Produces: `getPublicQuotation` returns `extras: DocExtras` and `content: Record<string, RichNode | string>` too; line items carry `lineType`, `optional`, `details`, `unit`; `InvoiceDocument` props `extras?`, `content?` pass straight to `DocRenderer`.

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

test('the public quote keeps line kinds, extras and text for the renderer', async () => {
  const payload = {
    quotation: {
      id: 'q1', quoteNumber: 'QT-1', issueDate: '2026-11-19', validUntil: '2026-12-19', status: 'Draft', taxRate: 5, currency: 'OMR', totalAmount: 10,
      items: [{ lineType: 'section', description: 'A', quantity: 0, unitPrice: 0, lineTotal: 0 }, { description: 'x', quantity: 1, unitPrice: 10, lineTotal: 10, optional: true, unit: 'day', details: 'd' }],
      extras: { 'contact.name': { type: 'text', value: 'Sara' } }, content: { terms: 'T' },
    },
    company: { id: '1' }, client: { id: 'c1' },
  };
  globalThis.fetch = (async () => ({ ok: true, json: async () => payload })) as never;
  const { getPublicQuotation } = await import('./publicService');
  const data = await getPublicQuotation('q1');
  assert.equal(data.invoice.lineItems[0].lineType, 'section');
  assert.equal(data.invoice.lineItems[1].optional, true);
  assert.equal(data.invoice.lineItems[1].unit, 'day');
  assert.equal(data.invoice.lineItems[1].details, 'd');
  assert.deepEqual(data.extras, { 'contact.name': { type: 'text', value: 'Sara' } });
  assert.deepEqual(data.content, { terms: 'T' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && node --import tsx --test src/services/publicService.test.ts`. Expected: FAIL. If importing `publicService` fails on a missing `API_BASE` env, set `process.env.NEXT_PUBLIC_API_URL = 'http://x'` at the top of the test (check `frontend/src/lib/api*.ts` for the variable name).

- [ ] **Step 3: Implement**

In the `lineItems` map in `getPublicQuotation`, add `lineType: it.lineType, optional: it.optional, details: it.details, unit: it.unit,`. Widen the return type with `extras: DocExtras; content: Record<string, RichNode | string>`, and return `extras: q.extras ?? {}, content: q.content ?? {}`. Import the types from `@/modules/finance/doc/tokens` and `@/modules/finance/doc/types`.

`invoice-document.tsx`: add `extras?: DocExtras; content?: Record<string, RichNode | string>;` to its props, destructure them, and pass `extras={extras} content={content}` to `<DocRenderer …/>`.

`quotation/[id]/page.tsx`: add `extras: DocExtras; content: Record<string, RichNode | string>` to the state type, and pass `extras={data.extras} content={data.content}` to `<InvoiceDocument …/>`.

- [ ] **Step 4: Run to verify it passes**

Run the test and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(quotes): printed quote receives quote data, text and line kinds"
```

---

### Task 8: Designer: slot block, quote data, conditions, columns, Proposal starter

**Files:**
- Modify: `frontend/src/modules/finance/components/invoice-designer.tsx` (block factories ~100, `PALETTE` ~106, `BlockProperties` token groups ~605, show-when select ~930, column editor ~1229)
- Modify: `frontend/src/modules/finance/doc/presets.ts`
- Test: add to `frontend/src/modules/finance/components/invoice-designer.test.ts`

**Interfaces:**
- Consumes: `SlotBlock`, `quoteTokenGroups`, new conditions and columns (Tasks 5–6)
- Produces: `invoicePresets` gains `{ id: 'proposal', … }`, offered only when `template.docType === 'quote'`; exported `proposalDoc(template?: InvoiceTemplate): InvoiceDoc`.

- [ ] **Step 1: Write the failing test**

Append to `invoice-designer.test.ts` (match its existing import style):

```ts
test('the proposal starter is a valid quote layout with intro, scope and terms slots', async () => {
  const { proposalDoc } = await import('../doc/presets');
  const { validateInvoiceDoc } = await import('../doc/validation');
  const doc = proposalDoc();
  assert.deepEqual(validateInvoiceDoc(doc), []);
  const slots: string[] = [];
  const walk = (blocks: any[]) => blocks.forEach((b) => { if (b.type === 'slot') slots.push(b.slot); if (b.children) walk(b.children); });
  walk(doc.body);
  assert.deepEqual(slots, ['intro', 'scope', 'terms']);
  const columns = JSON.stringify(doc.body);
  assert.ok(columns.includes('"key":"index"') && columns.includes('"key":"unit"'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && node --import tsx --test src/modules/finance/components/invoice-designer.test.ts`. Expected: FAIL (`proposalDoc` not exported).

- [ ] **Step 3: Implement**

`presets.ts`, add:

```ts
/** A sales proposal (quotes only): heading, intro, scope, priced table with sections and extras, terms, acceptance. */
export function proposalDoc(template?: InvoiceTemplate): InvoiceDoc {
  const base = templateToDoc(template, 'quote');
  const header = base.body.filter((b) => b.type === 'image' || b.type === 'container').slice(0, 1);
  const body: Block[] = [
    ...header,
    { id: 'p-title', type: 'heading', level: 1, content: 'QUOTATION', style: { margin: { top: 12, bottom: 4 } } },
    { id: 'p-meta', type: 'details', fields: [
      { label: 'Quotation', value: '{{doc.number}}' },
      { label: 'Date', value: '{{doc.date}}' },
      { label: 'Valid until', value: '{{fields.validUntil}}' },
      { label: 'Prepared for', value: '{{to.name}}' },
      { label: 'Attention', value: '{{contact.name}}' },
      { label: 'Prepared by', value: '{{owner.name}}' },
    ], style: { margin: { bottom: 16 } } },
    { id: 'p-intro', type: 'slot', slot: 'intro', fallback: 'Thank you for the opportunity. Please find our offer below.', style: { margin: { bottom: 12 } } },
    { id: 'p-scope', type: 'slot', slot: 'scope', title: 'Scope of work', fallback: '', style: { margin: { bottom: 12 } } },
    { id: 'p-lines', type: 'lineItems', columns: [
      { id: 'c-index', key: 'index', label: '#', visible: true, width: 6, align: 'left' },
      { id: 'c-desc', key: 'description', label: 'Description', visible: true, width: 46, align: 'left' },
      { id: 'c-unit', key: 'unit', label: 'Unit', visible: true, width: 10, align: 'left' },
      { id: 'c-qty', key: 'quantity', label: 'Qty', visible: true, width: 10, align: 'right' },
      { id: 'c-price', key: 'unitPrice', label: 'Unit price', visible: true, width: 14, align: 'right' },
      { id: 'c-amount', key: 'amount', label: 'Amount', visible: true, width: 14, align: 'right' },
    ] },
    { id: 'p-totals', type: 'totals', style: { margin: { top: 12 } } },
    { id: 'p-terms', type: 'slot', slot: 'terms', title: 'Terms', fallback: template?.terms || 'Prices are valid until the date above.', style: { margin: { top: 20 } } },
    { id: 'p-notes', type: 'text', content: '{{invoice.notes}}', visibleWhen: 'hasNotes', style: { margin: { top: 12 } } },
    { id: 'p-accept', type: 'container', layout: 'row', gap: 32, style: { margin: { top: 32 } }, children: [
      { id: 'p-accept-text', type: 'text', content: 'Accepted by: ____________________   Date: ____________' },
      { id: 'p-sign', type: 'signature' },
    ] },
    { id: 'p-qr', type: 'qr', style: { align: 'center', margin: { top: 24 } } },
  ];
  return { ...base, body };
}
```

Check what `templateToDoc` accepts in `doc/template-to-doc.ts`. If it reads the doc type from `template.docType` and has no second argument, call `templateToDoc(template ? { ...template, docType: 'quote' } : ({ docType: 'quote' } as InvoiceTemplate))` instead. Every English label above must be a key `localizeLabel` maps (`Quotation`, `Date`, `Valid until`, `Prepared for`, `Description`, `Qty`, `Unit price`, `Amount`, `Terms`). For any that aren't (`Attention`, `Prepared by`, `Scope of work`, `Unit`, `#`, the fallback sentences), add their Arabic to `LABEL_KEYS`/`SENTENCES` in `strings.ts`: `Attention: 'عناية'`, `'Prepared by': 'أعدّه'`, `'Scope of work': 'نطاق العمل'`, `'Thank you for the opportunity. Please find our offer below.': 'شكرًا لإتاحة الفرصة. تجدون عرضنا أدناه.'`, `'Prices are valid until the date above.': 'الأسعار سارية حتى التاريخ المذكور أعلاه.'`, `'Accepted by: ____________________   Date: ____________': 'تمت الموافقة من: ____________________   التاريخ: ____________'`. Follow how `strings.ts` already registers sentences: the `DEFAULT_SENTENCES` array of `[en, ar]`.

Add to `invoicePresets`:

```ts
  { id: 'proposal', name: 'Proposal', description: 'Sales proposal: intro, scope, priced sections, optional extras, terms and acceptance.', build: (template) => proposalDoc(template) },
```

In `invoice-designer.tsx`, filter `availablePresets` so that `proposal` shows only when `template.docType === 'quote'`:

```ts
  const availablePresets = (['invoice', 'delivery', 'quote', 'statement'].includes(template.docType ?? 'invoice') ? invoicePresets : [])
    .filter((p) => p.id !== 'proposal' || template.docType === 'quote');
```

Palette and block factories (quote templates only):

```ts
  slot: () => ({ id: makeId(), type: 'slot', slot: 'terms', title: 'Terms', fallback: '', style: { margin: { top: 16 } } }),
```

Add `{ type: 'slot', label: 'Written per quote', icon: PenLine }` to `PALETTE`. In the `palette` filter, keep `slot` only when `template.docType === 'quote'`, and give `paletteLabel` the Arabic `'نص يُكتب لكل عرض'`.

In `BlockProperties`, add a `docType` prop (pass `template.docType`) and use it:

```ts
tokenGroups={genericDocument ? GENERIC_TOKEN_GROUPS : template.docType === 'quote' ? quoteTokenGroups(TOKEN_GROUPS) : TOKEN_GROUPS}
```

Slot editor, in `BlockProperties` next to the `qr` caption field:

```tsx
      {block.type === 'slot' && (
        <>
          <Field label={tr('Which text', 'أي نص')}>
            <Select value={(block as SlotBlock).slot} onValueChange={(slot) => onChange({ slot } as Partial<Block>)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="intro">{tr('Introduction', 'المقدمة')}</SelectItem>
                <SelectItem value="scope">{tr('Scope of work', 'نطاق العمل')}</SelectItem>
                <SelectItem value="terms">{tr('Terms', 'الشروط')}</SelectItem>
                <SelectItem value="closing">{tr('Closing', 'الخاتمة')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={tr('Heading', 'العنوان')}>
            <Input className="h-8" value={(block as SlotBlock).title ?? ''} onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={tr('Default text (each quote can change it)', 'النص الافتراضي (يمكن تغييره في كل عرض)')}>
            <Textarea dir="auto" rows={4} value={typeof (block as SlotBlock).fallback === 'string' ? (block as SlotBlock).fallback as string : ''} onChange={(e) => onChange({ fallback: e.target.value } as Partial<Block>)} />
          </Field>
        </>
      )}
```

Import `Textarea` if the file doesn't already, and import `SlotBlock`.

In the show-when select, add these items after `hasSignature` (the first two and the language pair are shown only for quote templates; use `docType`):

```tsx
              {docType === 'quote' && <>
                <SelectItem value="hasDiscount">{tr('Quote has a discount', 'العرض فيه خصم')}</SelectItem>
                <SelectItem value="hasOptionalLines">{tr('Quote has optional lines', 'العرض فيه بنود اختيارية')}</SelectItem>
              </>}
              <SelectItem value="lang:ar">{tr('Printed in Arabic', 'مطبوع بالعربي')}</SelectItem>
              <SelectItem value="lang:en">{tr('Printed in English', 'مطبوع بالإنجليزي')}</SelectItem>
```

In the column editor, next to "Add custom column", add a select that adds a standard column not yet present:

```tsx
        <Select value="" onValueChange={(key) => setColumns([...columns, { id: makeId(), key: key as InvoiceColumn['key'], label: { index: '#', unit: 'Unit', discount: 'Discount', sku: 'Code' }[key] ?? key, visible: true, width: 8, align: key === 'index' || key === 'unit' || key === 'sku' ? 'left' : 'right' }])}>
          <SelectTrigger className="h-8 w-44"><SelectValue placeholder={tr('Add column…', 'إضافة عمود…')} /></SelectTrigger>
          <SelectContent>
            {(['index', 'unit', 'discount', 'sku'] as const).filter((k) => !columns.some((c) => c.key === k)).map((k) => (
              <SelectItem key={k} value={k}>{{ index: tr('Line number', 'رقم البند'), unit: tr('Unit', 'الوحدة'), discount: tr('Discount', 'الخصم'), sku: tr('Code', 'الرمز') }[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
```

Show it under the same `!inherited` condition as the custom-column button.

- [ ] **Step 4: Run to verify it passes**

Run the test file and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/finance
git commit -m "feat(docs): designer slot block, quote data, conditions, columns and Proposal starter"
```

---

### Task 9: Line editor: sections, optional lines, unit and details

**Files:**
- Modify: `frontend/src/modules/sales/components/sales-line-items.tsx`
- Test: create `frontend/src/modules/sales/components/sales-line-items.test.ts`

**Interfaces:**
- Consumes: line fields (Task 5)
- Produces: `SalesItemForm` gains `lineType?: 'section'; optional?: boolean; details?: string; unit?: string`; `emptySectionRow(): SalesItemForm`; `formItemsTotal` and `formDiscountTotals` skip section and optional rows; `formOptionalTotal(rows): number`; `prepareItems` keeps section rows (description only) and the new fields; `SalesLineItemsEditor` prop `quoteLines?: boolean` (shows the new controls; sales orders leave it off).

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyItemRow, emptySectionRow, formDiscountTotals, formItemsTotal, formOptionalTotal, itemsToForm, prepareItems } from './sales-line-items';

const rows = [
  { ...emptySectionRow(), description: 'Package A' },
  { ...emptyItemRow(), description: 'Workshop', quantity: '2', unitPrice: '100', unit: 'day', details: 'Half days' },
  { ...emptyItemRow(), description: 'Extra', quantity: '1', unitPrice: '50', optional: true },
];

test('totals skip sections and optional rows; optional rows have their own total', () => {
  assert.equal(formItemsTotal(rows), 200);
  assert.equal(formDiscountTotals(rows).gross, 200);
  assert.equal(formOptionalTotal(rows), 50);
});

test('prepared lines keep sections and the new fields, and round-trip', () => {
  const items = prepareItems(rows, new Map());
  assert.deepEqual(items[0], { lineType: 'section', description: 'Package A', quantity: 0, unitPrice: 0, lineTotal: 0 });
  assert.equal(items[1].unit, 'day');
  assert.equal(items[1].details, 'Half days');
  assert.equal(items[2].optional, true);
  const back = itemsToForm(items);
  assert.equal(back[0].lineType, 'section');
  assert.equal(back[2].optional, true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && node --import tsx --test src/modules/sales/components/sales-line-items.test.ts`. Expected: FAIL (`emptySectionRow` missing).

- [ ] **Step 3: Implement**

Add the four fields to `SalesItemForm`, then:

```ts
export const emptySectionRow = (): SalesItemForm => ({ ...emptyItemRow(), lineType: 'section', quantity: '0', unitPrice: '0' });

const countsInTotal = (row: SalesItemForm) => row.lineType !== 'section' && !row.optional;

export const formItemsTotal = (rows: SalesItemForm[]) =>
  rows.filter(countsInTotal).reduce((sum, item) => sum + lineNet(Number(item.quantity || 0), Number(item.unitPrice || 0), Number(item.discount || 0), item.discountType), 0);

export const formOptionalTotal = (rows: SalesItemForm[]) =>
  Number(rows.filter((r) => r.lineType !== 'section' && r.optional)
    .reduce((sum, item) => sum + lineNet(Number(item.quantity || 0), Number(item.unitPrice || 0), Number(item.discount || 0), item.discountType), 0).toFixed(2));
```

In `formDiscountTotals`, use `rows.filter(countsInTotal)` for `gross`. In `itemsToForm`, copy `lineType`, `optional`, `details` and `unit`. In `prepareItems`, start the map callback with:

```ts
      if (item.lineType === 'section') {
        const description = item.description.trim();
        return description ? { lineType: 'section' as const, description, quantity: 0, unitPrice: 0, lineTotal: 0 } : null;
      }
```

Add these to the returned item:

```ts
        ...(item.optional ? { optional: true } : {}),
        ...(item.details?.trim() ? { details: item.details.trim() } : {}),
        ...(item.unit?.trim() ? { unit: item.unit.trim() } : {}),
```

Editor UI, behind `quoteLines`:
- Header buttons: next to "Add item", add `<Button … onClick={() => onChange([...rows, emptySectionRow()])}>{tr('Add section', 'إضافة قسم')}</Button>`. Define `const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);`.
- Section row: one `TableRow` with a single `TableCell colSpan={7}` holding an `Input` (bold, `placeholder={tr('Section heading', 'عنوان القسم')}`) and the remove button.
- Item rows: under the description input, a small `Textarea` (`rows={2}`, `placeholder={tr('Details (optional)', 'تفاصيل (اختياري)')}`) bound to `details`. Next to the quantity, a short `Input` bound to `unit` (`placeholder={tr('unit', 'الوحدة')}`, `className="mt-1 h-7 w-20 text-xs"`). Under the line total, a `Checkbox` with label `tr('Optional', 'اختياري')` bound to `optional`, using the project's checkbox component at `@/components/ui/checkbox`. The total cell shows the amount muted (`text-muted-foreground`) when optional.
- Let the remove button delete any row while at least one non-section row remains: `disabled={rows.filter((r) => r.lineType !== 'section').length === 1 && item.lineType !== 'section'}`.

- [ ] **Step 4: Run to verify it passes**

Run the test and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/sales/components
git commit -m "feat(quotes): sections, optional lines, unit and details in the line editor"
```

---

### Task 10: Quote form and list: salesperson, written text, convert dialog, copy, search

**Files:**
- Modify: `frontend/src/services/quotationService.ts`
- Modify: `frontend/src/modules/sales/components/quotations-panel.tsx`
- Test: create `frontend/src/modules/sales/components/quote-search.test.ts`

**Interfaces:**
- Consumes: routes from Tasks 2–3; `SalesLineItemsEditor quoteLines`, `formOptionalTotal` (Task 9)
- Produces:
  - `QuotationInput` gains `ownerUserId?: string | null` and `content?: Record<string, unknown | null>`
  - `getQuotation(id): Promise<Quotation>`, `copyQuotation(id): Promise<Quotation>`
  - `convertQuotationToSalesOrder(id, data?: { includeOptional?: number[] })`; `convertQuotationToInvoice(id, data: { templateId?; includeOptional? })`
  - pure `quoteMatches(quote, query, names: { client: string[] }): boolean` exported from new file `frontend/src/modules/sales/lib/quote-search.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteMatches } from '../lib/quote-search';

const quote = { quoteNumber: 'QT-0500', notes: '', items: [{ description: 'تصميم', descriptionEn: 'Design', descriptionAr: 'تصميم' }] } as never;

test('search finds a quote by either language of the client or its lines', () => {
  assert.ok(quoteMatches(quote, 'design', { client: ['Gulf Retail', 'الخليج للتجزئة'] }));
  assert.ok(quoteMatches(quote, 'الخليج', { client: ['Gulf Retail', 'الخليج للتجزئة'] }));
  assert.ok(quoteMatches(quote, 'qt-05', { client: [] }));
  assert.ok(!quoteMatches(quote, 'nothing', { client: ['Gulf Retail'] }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && node --import tsx --test src/modules/sales/components/quote-search.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`frontend/src/modules/sales/lib/quote-search.ts`:

```ts
import type { Quotation } from '@/modules/finance/types';

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[ً-ٰٟ]/g, '');

/** A quote matches when the query is in its number, notes, either name of its client, or either name of any line. */
export function quoteMatches(quote: Quotation, query: string, names: { client: string[] }): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const haystack = [
    quote.quoteNumber, quote.notes || '', ...names.client,
    ...quote.items.flatMap((i) => [i.description, i.descriptionAr || '', i.descriptionEn || '']),
  ];
  return haystack.some((value) => fold(value).includes(q));
}
```

If `frontend/src/lib/display-name.ts` already exports a search-folding helper (spec 2026-11-10 "search folding"), check with `grep -n "export" frontend/src/lib/display-name.ts` and use it instead of `fold`.

`quotationService.ts`: add the two input fields. Add:

```ts
export async function getQuotation(id: string): Promise<Quotation> {
  return parseQuotation(await apiFetch(`/quotations/${id}`));
}
export async function copyQuotation(id: string): Promise<Quotation> {
  return parseQuotation(await apiFetch(`/quotations/${id}/copy`, { method: 'POST' }));
}
```

Use the file's existing fetch and date-parsing helpers. Read lines 1–40 for their names and replace `apiFetch`/`parseQuotation` with them. Change the two convert functions to send `{ includeOptional }` in the JSON body.

`quotations-panel.tsx`:
- **Search:** replace the `shown` filter body with `quoteMatches(quote, search, { client: clientNames(quote) })`. `clientNames` finds the contact as `clientName` does and returns `allNames(contact)` split into its names (`[c.name, c.nameAr, c.nameEn].filter(Boolean)`).
- **Form state:** add `ownerUserId: string` and `content: Record<string, string>` (slot → plain text) to `QuoteForm`, with `''`/`{}` in `blankForm`.
- **Load:** also load `getCompanyMembers(companyId)` into a `members` state.
- **openEdit:** becomes async. It calls `getQuotation(quote.id)` and fills `ownerUserId: full.ownerUserId || ''` and `content` from `full.content`, keeping string values and, for rich-text JSON, the plain text of its paragraphs (`node.content?.map(p => p.content?.map(t => t.text).join('')).join('\n')`). It also keeps a `richSlots` set so the save leaves untouched rich slots alone.
- **Salesperson field** in the dialog grid:

```tsx
            <div className="space-y-1">
              <Label>{tr('Salesperson', 'مسؤول المبيعات')}</Label>
              <Combobox options={members.map((m) => ({ value: m.id, label: displayName(m, language), keywords: allNames(m) }))}
                value={form.ownerUserId} onValueChange={(value) => setForm((prev) => ({ ...prev, ownerUserId: value }))}
                placeholder={tr('Me', 'أنا')} searchPlaceholder={tr('Search people…', 'ابحث عن شخص…')} />
            </div>
```

- **Written text:** find the slots the chosen template uses with a helper `templateSlots(doc)`. Add it to `doc/presets.ts`, or better a new export in `doc/tokens.ts`, so it lives next to `templateFields`:

```ts
/** Slot blocks a template uses, in order: { slot, title, fallback }. */
export function templateSlots(doc: unknown): Array<{ slot: string; title?: string; fallback?: unknown }> {
  const out: Array<{ slot: string; title?: string; fallback?: unknown }> = [];
  const walk = (blocks: any[]) => (blocks || []).forEach((b) => { if (b?.type === 'slot' && !out.some((o) => o.slot === b.slot)) out.push({ slot: b.slot, title: b.title, fallback: b.fallback }); if (Array.isArray(b?.children)) walk(b.children); });
  walk((doc as any)?.body);
  return out;
}
```

  Add a unit test for it in `tokens.test.ts`: nested container plus a duplicate slot gives a single entry. In the dialog, under Notes, for each slot of `quoteTemplates.find(t => t.id === form.templateId)?.doc` (fall back to the default template), render a `Label` (title, or the slot name in both languages: intro مقدمة, scope نطاق العمل, terms الشروط, closing الخاتمة) and a `Textarea dir="auto"`. The textarea's placeholder is the fallback text and its value is `form.content[slot] ?? ''`. An empty box means "use the template's text".
- **Save:** send `ownerUserId: form.ownerUserId || undefined` on create (`|| null` on edit). Send `content`: for each slot shown, a non-empty value becomes a string and an empty one becomes `null`, except slots in `richSlots` the user didn't touch, which are not sent. Pass `quoteLines` to `SalesLineItemsEditor`. Add an "Optional extras" row to the totals `dl` when `formOptionalTotal(form.items) > 0`.
- **Convert dialog:** `toOrder` and the invoice dialog open a shared step when the quote has optional lines (`quote.items.some(i => i.optional)`). It lists them with checkboxes (description + `CurrencyAmount` of `lineTotal`) and calls the convert function with `includeOptional` = the ticked indexes into `quote.items`. Without optional lines it behaves as today.
- **Copy:** in the row's dropdown, before the language items, add `<DropdownMenuItem onClick={() => run(async () => { const c = await copyQuotation(quote.id); toast({ title: tr(`Copied as ${c.quoteNumber}`, `تم النسخ برقم ${c.quoteNumber}`) }); })}>{tr('Copy quote', 'نسخ العرض')}</DropdownMenuItem>`. Show it when `canCreate`.

- [ ] **Step 4: Run to verify**

Run the search test, `tokens.test.ts`, `npx tsc --noEmit` and the full `cd frontend && npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(quotes): salesperson, written text, optional lines on convert, copy, two-language search"
```

---

### Task 11: See it working in the app

**Files:** none (verification)

- [ ] **Step 1:** Start the app (use the project's `.claude/launch.json` entries through the preview tools; never start servers with Bash). Sign in as the seed admin.
- [ ] **Step 2:** In Settings → document templates, create a quote template from the **Proposal** starter. Check that the intro/scope/terms blocks, the line number and unit columns, the Quotation data group and the new show-when options appear, in English and Arabic interface.
- [ ] **Step 3:** Create a quote with that template: a section, two items (one with unit + details, one with 10% off), an optional line, a salesperson, and your own terms. Save, reopen, and check everything came back.
- [ ] **Step 4:** Print in English and Arabic (`/quotation/:id?lang=en|ar`). Check: section heading row, numbering 1–3, details under the line, "Optional" tag, total excludes the optional line, "Optional extras" row, your terms replace the default, intro shows the default, contact/salesperson filled. Take screenshots.
- [ ] **Step 5:** Download the PDF from the list. Accept the quote, convert to a sales order ticking the optional line, and check the order has 3 lines and the right total. Copy the quote and check the copy.
- [ ] **Step 6:** Open an existing quote that uses none of this. It must look exactly as before. Fix and recommit any problem found, with a test where possible.

---

### Task 12: Gate: existing quotes print identically

**Files:**
- Create: `frontend/scripts/quote-print-diff.mjs`

- [ ] **Step 1: Write the script**

It takes a list of quote ids and two base URLs (`--before http://127.0.0.1:3101 --after http://127.0.0.1:3102`). For each id and each `lang` in `ar`/`en`, it opens `/quotation/:id?lang=…` in puppeteer (already a project dependency through the PDF service: check `backend/package.json`, else use `npx puppeteer`). It waits for `[data-invoice-rendered="true"]`, screenshots the `.invoice-print-shell` element, and compares the two PNGs byte-for-byte, then with `pixelmatch` if bytes differ. It prints `SAME`/`DIFF <id> <lang> <pixels>` and exits 1 on any DIFF.

```js
#!/usr/bin/env node
// Usage: node frontend/scripts/quote-print-diff.mjs --before URL --after URL id1 id2 …
import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); const v = args[i + 1]; args.splice(i, 2); return v; };
const before = opt('--before'); const after = opt('--after'); const ids = args;
const browser = await puppeteer.launch({ headless: 'new' });
const shot = async (base, id, lang) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
  await page.goto(`${base}/quotation/${id}?lang=${lang}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-invoice-rendered="true"]');
  const el = await page.$('.invoice-print-shell');
  const png = await el.screenshot();
  await page.close();
  return png;
};
let failed = 0;
for (const id of ids) for (const lang of ['ar', 'en']) {
  const a = PNG.sync.read(await shot(before, id, lang));
  const b = PNG.sync.read(await shot(after, id, lang));
  if (a.width !== b.width || a.height !== b.height) { console.log(`DIFF ${id} ${lang} size ${a.width}x${a.height} vs ${b.width}x${b.height}`); failed++; continue; }
  const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0 });
  console.log(diff ? `DIFF ${id} ${lang} ${diff}` : `SAME ${id} ${lang}`);
  if (diff) failed++;
}
await browser.close();
process.exit(failed ? 1 : 0);
```

Add `pixelmatch` and `pngjs` as frontend devDependencies only if they aren't already present.

- [ ] **Step 2: Run against a prod copy**

Copy the production database to a scratch folder (read-only use, same recipe as earlier releases in `DEPLOY.md`). Run two backends and two frontends **in production mode** (`next build && next start`), one on `origin/master` and one on this branch with migration 177 applied to its own copy. List every quote id of Peak, GIG and Smart Hammer (`SELECT id FROM quotations`), then run the script. Expected: all `SAME`. Any `DIFF` blocks the release; fix it and run again.

- [ ] **Step 3: Commit**

```bash
git add frontend/scripts/quote-print-diff.mjs frontend/package.json frontend/package-lock.json
git commit -m "test(quotes): screenshot gate for existing quote prints"
```

---

## Self-review notes

- **Spec coverage (Phase 1 bullets):**
  - Quote data: Tasks 2, 4, 5, 7
  - Tokens and picker: Tasks 5, 8
  - Columns: Tasks 5, 6, 8
  - Slots and table: Tasks 2, 6, 8, 10
  - Lines and convert dialog: Tasks 1, 3, 9, 10
  - Conditions: Tasks 5, 6, 8
  - Proposal starter: Task 8
  - Copy and search: Tasks 3, 10
  - Gate: Task 12
- **Left out on purpose:**
  - Opportunity in the public payload (privacy promise; spec updated)
  - Per-line custom column values, and sections carried into sales orders or invoices (both Phase 2; spec updated)
- **Names used across tasks:**
  - `isCountedLine` (backend)
  - `countedLines`, `optionalTotal`, `itemNumbers` (frontend)
  - `DocExtras`
  - `normalizeQuotationItems`, `quoteSaleLines`, `copyQuotation`
  - `getDocumentContent`, `setDocumentContent`, `deleteDocumentContent`
  - `parseQuotationItems`, `parseDocContent`, `parseIncludeOptional`
  - `templateSlots`, `quoteMatches`
  - `emptySectionRow`, `formOptionalTotal`, `proposalDoc`
