const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { resolveNames, pickName, scriptSide } = require('../dist/names');
const { normalizeSearch, matchesSearch } = require('../dist/search-normalize');
const { makeTmpDir } = require('./helpers/tmp');

function setup(chat) {
  const dbPath = path.join(makeTmpDir('taskflow-names-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false,
    logger: { info() {}, warn() {}, error() {} },
    assistant: chat ? { chat } : undefined,
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const token = `Bearer ${store.issueToken(admin.id)}`;
  return { store, app, as: (req) => req.set('Authorization', token) };
}

test('a name lands on the side its letters say, and name keeps its side', () => {
  assert.equal(scriptSide('تهيئة فردية'), 'ar');
  assert.equal(scriptSide('lilas restaurant'), 'en');
  const fresh = resolveNames({ name: 'تهيئة فردية' });
  assert.equal(fresh.name, 'تهيئة فردية');
  assert.equal(fresh.nameAr, 'تهيئة فردية');
  assert.equal(fresh.nameEn, undefined);
  // Adding the English side to an Arabic-first record keeps `name` Arabic.
  const ar = { name: 'تهيئة فردية', nameAr: 'تهيئة فردية' };
  assert.deepEqual(resolveNames({ nameEn: 'Solo onboarding' }, ar), { name: 'تهيئة فردية', nameAr: 'تهيئة فردية', nameEn: 'Solo onboarding' });
  // Clearing the Arabic side falls back to the English one.
  assert.equal(resolveNames({ nameAr: '' }, { ...ar, nameEn: 'Solo onboarding' }).name, 'Solo onboarding');
  assert.throws(() => resolveNames({ nameAr: '', nameEn: '' }), /Arabic or English/);
  assert.equal(pickName({ name: 'x', nameAr: 'عربي', nameEn: 'English' }, 'en'), 'English');
  assert.equal(pickName({ name: 'x', nameAr: 'عربي' }, 'en'), 'عربي');
});

test('search folds Arabic spelling variants', () => {
  assert.equal(normalizeSearch('أحمد'), normalizeSearch('احمد'));
  assert.equal(normalizeSearch('مؤسسة'), normalizeSearch('موسسه'));
  assert.equal(normalizeSearch('مُصْطَفَى'), normalizeSearch('مصطفي'));
  assert.ok(matchesSearch('LILAS', 'lilas restaurant'));
});

test('services, contacts and clients keep both names; a contact rename reaches its client row', async () => {
  const { store, app, as } = setup();
  const svc = await as(request(app).post('/companies/1/services')).send({ nameAr: 'تهيئة فردية', nameEn: 'Solo onboarding', salePrice: 500 });
  assert.equal(svc.status, 201, JSON.stringify(svc.body));
  assert.equal(svc.body.nameAr, 'تهيئة فردية');
  assert.equal(svc.body.nameEn, 'Solo onboarding');
  assert.equal(svc.body.name, 'Solo onboarding', 'a new record takes the side sent as `name` (nameOf: English first)');
  assert.equal((await as(request(app).post('/companies/1/services')).send({ nameAr: '', nameEn: '' })).status, 400);

  const contact = await as(request(app).post('/companies/1/contacts')).send({ name: 'ليلاس', nameAr: 'ليلاس', nameEn: 'Lilas', roles: ['Client'] });
  assert.equal(contact.status, 201, JSON.stringify(contact.body));
  assert.equal(contact.body.name, 'ليلاس');
  const clientId = store.ensureClientRowForContact(contact.body.id);
  const renamed = await as(request(app).put(`/contacts/${contact.body.id}`)).send({ nameEn: 'Lilas Restaurant' });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
  const row = store.db.prepare('SELECT name, nameAr, nameEn FROM clients WHERE id = ?').get(clientId);
  assert.deepEqual({ ...row }, { name: 'ليلاس', nameAr: 'ليلاس', nameEn: 'Lilas Restaurant' });

  // Search finds the English name with a different case, and the Arabic one spelled with a bare alef.
  const found = await as(request(app).get('/companies/1/search?q=lilas%20rest&lang=en'));
  assert.ok(found.body.find((g) => g.type === 'contacts')?.items.some((i) => i.title === 'Lilas Restaurant'), JSON.stringify(found.body));
  const arabic = await as(request(app).get(`/companies/1/search?q=${encodeURIComponent('تهيئه')}&lang=ar`));
  assert.ok(arabic.body.find((g) => g.type === 'items')?.items.some((i) => i.title === 'تهيئة فردية'), JSON.stringify(arabic.body));
});

test('a line keeps both names from quote to sales order to invoice', async () => {
  const { app, as } = setup();
  const lines = [{ description: 'تهيئة فردية', descriptionAr: 'تهيئة فردية', descriptionEn: 'Solo onboarding', quantity: 1, unitPrice: 500 }];
  const quote = await as(request(app).post('/companies/1/quotations')).send({ clientId: 'client-1', validUntil: new Date(Date.now() + 86400000).toISOString(), items: lines });
  assert.equal(quote.status, 201, JSON.stringify(quote.body));
  assert.equal(quote.body.items[0].descriptionEn, 'Solo onboarding');
  assert.equal((await as(request(app).patch(`/quotations/${quote.body.id}/status`)).send({ status: 'Accepted' })).status, 200);
  const order = await as(request(app).post(`/quotations/${quote.body.id}/sales-order`)).send({});
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.equal(order.body.items[0].descriptionAr, 'تهيئة فردية', JSON.stringify(order.body));
  assert.equal(order.body.items[0].descriptionEn, 'Solo onboarding');
  const shared = await request(app).get(`/public/quotations/${quote.body.id}`);
  assert.equal(shared.body.quotation.items[0].descriptionEn, 'Solo onboarding');
});

test('suggest translation: transliterates names, reports offline, saves nothing', async () => {
  const seen = [];
  const chat = async (messages) => { seen.push(messages); return { content: '<think>hmm</think>\n"Lilas Restaurant"\nnote' }; };
  const { app, as } = setup(chat);
  const ok = await as(request(app).post('/companies/1/name-suggestion')).send({ text: 'مطعم ليلاس', from: 'ar', kind: 'name' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.suggestion, 'Lilas Restaurant');
  assert.match(seen[0][0].content, /transliterate/i);
  assert.equal((await as(request(app).post('/companies/1/name-suggestion')).send({ text: 'x', from: 'fr' })).status, 400);

  const { ModelUnavailableError } = require('../dist/assistant/model');
  const down = setup(async () => { throw new ModelUnavailableError('tunnel down'); });
  const off = await down.as(request(down.app).post('/companies/1/name-suggestion')).send({ text: 'Solo onboarding', from: 'en' });
  assert.equal(off.status, 503);
  assert.equal(off.body.code, 'ASSISTANT_OFFLINE');
});
