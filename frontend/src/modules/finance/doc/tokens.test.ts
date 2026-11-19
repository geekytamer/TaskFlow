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
