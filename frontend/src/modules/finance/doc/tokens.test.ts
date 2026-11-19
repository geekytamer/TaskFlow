import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveToken, resolveTokens, templateSlots, type DocDataContext } from './tokens';
import { isInvoiceDoc, validateInvoiceDoc } from './validation';

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
  const base = { version: 1, page: { size: 'A4', orientation: 'portrait', margin: { top: 10, right: 10, bottom: 10, left: 10 } }, theme: { fontFamily: 'Inter', primaryColor: '#111', accentColor: '#222', textColor: '#333' } };
  const good = { ...base, body: [
    { id: 'a', type: 'slot', slot: 'terms', fallback: 'x' },
    { id: 'b', type: 'lineItems', visibleWhen: 'hasOptionalLines', columns: [
      { id: 'i', key: 'index', label: '#', visible: true },
      { id: 'd', key: 'discount', label: 'Disc', visible: true },
      { id: 'u', key: 'unit', label: 'Unit', visible: true },
    ] },
    { id: 'c', type: 'text', content: 'x', visibleWhen: 'lang:ar' },
  ] };
  assert.deepEqual(validateInvoiceDoc(good), []);
  assert.equal(isInvoiceDoc(good), true, 'render-time check still recognises it');
  assert.notDeepEqual(validateInvoiceDoc({ ...base, body: [{ id: 'a', type: 'slot', slot: 'Bad!' }] }), []);
});

test('inherited object names are not tokens', () => {
  const c = ctx({ extras: {} });
  assert.equal(resolveTokens('a{{constructor}}b{{toString}}c{{__proto__}}d', c), 'abcd');
  assert.equal(resolveTokens('a{{constructor}}b', ctx()), 'ab');
});

test('a fill-in field wins over an extras entry of the same name', () => {
  const c = ctx({ fields: { 'field.x': 'mine' }, extras: { 'field.x': { type: 'text', value: 'theirs' } } });
  assert.equal(resolveToken('field.x', c), 'mine');
});

test('templateSlots lists each slot once, including inside containers', () => {
  const doc = { body: [
    { id: 'a', type: 'slot', slot: 'intro', fallback: 'Hello' },
    { id: 'b', type: 'container', children: [{ id: 'c', type: 'slot', slot: 'terms', title: 'Terms' }, { id: 'd', type: 'slot', slot: 'intro' }] },
  ] };
  assert.deepEqual(templateSlots(doc), [
    { slot: 'intro', title: undefined, fallback: 'Hello' },
    { slot: 'terms', title: 'Terms', fallback: undefined },
  ]);
  assert.deepEqual(templateSlots(undefined), []);
});

const lineInvoice = (lines: unknown[], issue = '2026-11-19', due = '2026-12-04') => ctx({
  invoice: { id: 'q1', invoiceNumber: 'QT-1', issueDate: new Date(issue), dueDate: due ? new Date(due) : undefined, lineItems: lines, total: 0, status: 'Draft', currency: 'OMR' } as never,
});

test('fields.validity counts whole days from issue to valid-until', () => {
  assert.equal(resolveToken('fields.validity', lineInvoice([])), '15 days');
  assert.equal(resolveToken('fields.validity', { ...lineInvoice([]), locale: 'ar' }), '15 يومًا');
  assert.equal(resolveToken('fields.validity', lineInvoice([], '2026-11-19', '2026-11-20')), '1 day');
  assert.equal(resolveToken('fields.validity', { ...lineInvoice([], '2026-11-19', '2026-11-20'), locale: 'ar' }), 'يوم واحد');
  assert.equal(resolveToken('fields.validity', lineInvoice([], '2026-11-19', '')), '');
});

test('line1.* reads the first priced line, skipping sections and optional lines', () => {
  const c = {
    ...lineInvoice([
      { lineType: 'section', description: 'Package', quantity: 0, unitPrice: 0, amount: 0 },
      { description: 'Extra', optional: true, quantity: 1, unitPrice: 5, amount: 5 },
      { description: 'Dates', descriptionAr: 'تمور', descriptionEn: 'Dates EN', unit: 'MT', quantity: 12.5, unitPrice: 300, amount: 3750 },
      { description: 'Second', quantity: 1, unitPrice: 1, amount: 1 },
    ]),
    formatMoney: (v: number) => `M${v}`,
  };
  assert.equal(resolveToken('line1.description', c), 'Dates EN');
  assert.equal(resolveToken('line1.description', { ...c, locale: 'ar' }), 'تمور');
  assert.equal(resolveToken('line1.quantity', c), '12.5');
  assert.equal(resolveToken('line1.unit', c), 'MT');
  assert.equal(resolveToken('line1.unitPrice', c), 'M300');
  assert.equal(resolveToken('line1.amount', c), 'M3750');
  assert.equal(resolveToken('line1.quantity', lineInvoice([{ description: 'x', quantity: 1.23456789, unitPrice: 1, amount: 1 }])), '1.2346');
  assert.equal(resolveToken('line1.quantity', lineInvoice([{ description: 'x', quantity: 12000, unitPrice: 1, amount: 1 }])), '12,000');
  for (const t of ['description', 'quantity', 'unit', 'unitPrice', 'amount']) assert.equal(resolveToken(`line1.${t}`, lineInvoice([])), '');
});

test('line1 money uses the text formatter when the renderer provides one; old tokens keep formatMoney', () => {
  const c = { ...lineInvoice([{ description: 'x', quantity: 1, unitPrice: 2, amount: 2 }]), formatMoney: (v: number) => String(v), formatMoneyText: (v: number) => `OMR ${v}`, total: 7 };
  assert.equal(resolveToken('line1.amount', c), 'OMR 2');
  assert.equal(resolveToken('invoice.total', c), '7');
});

test('owner.title comes through extras', () => {
  const c = ctx({ extras: { 'owner.title': { type: 'text', value: 'Sales Manager' } } });
  assert.equal(resolveToken('owner.title', c), 'Sales Manager');
  assert.equal(resolveToken('owner.title', ctx()), '');
});

test('the quote picker lists the new tokens', async () => {
  const { QUOTE_TOKEN_GROUP, localizedTokenGroups } = await import('./tokens');
  const names = QUOTE_TOKEN_GROUP.tokens.map((t) => t.token);
  for (const t of ['owner.title', 'fields.validity', 'line1.description', 'line1.quantity', 'line1.unit', 'line1.unitPrice', 'line1.amount']) assert.ok(names.includes(t), t);
  const ar = localizedTokenGroups([QUOTE_TOKEN_GROUP], 'ar')[0].tokens.map((t) => t.label);
  assert.ok(ar.includes('المسمى الوظيفي لمسؤول المبيعات') && ar.includes('مدة الصلاحية') && ar.includes('البند الأول: المبلغ'));
});

test('details layout accepts inline and rows only', () => {
  const base = { version: 1, page: { size: 'A4', orientation: 'portrait', margin: { top: 10, right: 10, bottom: 10, left: 10 } }, theme: { fontFamily: 'Inter', primaryColor: '#111', accentColor: '#222', textColor: '#333' } };
  const mk = (layout: unknown) => ({ ...base, body: [{ id: 'a', type: 'details', layout, fields: [{ label: 'a', value: 'b' }] }] });
  assert.deepEqual(validateInvoiceDoc(mk('rows')), []);
  assert.deepEqual(validateInvoiceDoc(mk('inline')), []);
  assert.deepEqual(validateInvoiceDoc(mk(undefined)), []);
  assert.notDeepEqual(validateInvoiceDoc(mk('table')), []);
});
