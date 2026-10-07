const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/** An influencer's own records: always scoped to that influencer. */

const setup = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-ws-'), 'taskflow.db'), seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const A = { companyId: company.id, ownerContactId: 'lina' };
  const B = { companyId: company.id, ownerContactId: 'noel' };
  return { ws: store.workspace, A, B };
};

test('a deal and its parts belong to one influencer', () => {
  const { ws, A, B } = setup();
  const brand = ws.addContact(A, { name: 'Sidr Coffee', kind: 'brand' });
  const deal = ws.addDeal(A, { title: 'Ramadan reel', wsContactId: brand.id, amount: 500, currency: 'AED', status: 'confirmed' });
  assert.equal(ws.deal(A, deal.id).title, 'Ramadan reel');
  assert.equal(ws.deal(B, deal.id), undefined);
  assert.equal(ws.contact(B, brand.id), undefined);
  assert.equal(ws.updateDeal(B, deal.id, { title: 'Stolen' }), undefined);
  assert.equal(ws.deal(A, deal.id).title, 'Ramadan reel');
  assert.equal(ws.deleteDeal(B, deal.id), false);
  assert.deepEqual(ws.deals(B), []);
  assert.equal(ws.deals(A).length, 1);
});

test('deleting a deal removes its deliverables and files', () => {
  const { ws, A } = setup();
  const deal = ws.addDeal(A, { title: 'Story set', currency: 'OMR', status: 'lead' });
  ws.addDeliverable(A, deal.id, { title: '3 stories', dueDate: '2026-11-01' });
  ws.addFile(A, deal.id, { fileName: 'brief.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF-1.4 x') });
  assert.equal(ws.deliverables(A, deal.id).length, 1);
  assert.equal(ws.files(A, deal.id).length, 1);
  assert.equal(ws.deleteDeal(A, deal.id), true);
  assert.deepEqual(ws.deliverables(A, deal.id), []);
  assert.deepEqual(ws.files(A, deal.id), []);
});

test('an archived contact drops out of the list but still resolves', () => {
  const { ws, A } = setup();
  const brand = ws.addContact(A, { name: 'Old Brand', kind: 'brand' });
  assert.equal(ws.archiveContact(A, brand.id), true);
  assert.deepEqual(ws.contacts(A).map((c) => c.id), []);
  assert.ok(ws.contact(A, brand.id).archivedAt);
  assert.equal(ws.contacts(A, { includeArchived: true }).length, 1);
});
