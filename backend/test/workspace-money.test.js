const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorkspace } = require('./helpers/workspace');

/** Payments received on a deal and expenses, in the influencer's own workspace. */

const start = async () => {
  const ctx = buildWorkspace();
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  const deal = (await lina.post('/deals', { title: 'Reel', amount: 1000, currency: 'AED', status: 'confirmed' })).body;
  return { ...ctx, lina, deal };
};

test('payments on a deal show on the deal with what has been received', async () => {
  const { lina, deal } = await start();
  const first = await lina.post(`/deals/${deal.id}/payments`, { amount: 400, currency: 'AED', receivedOn: '2026-10-05', note: 'Deposit' });
  assert.equal(first.status, 201);
  await lina.post(`/deals/${deal.id}/payments`, { amount: 250, currency: 'AED', receivedOn: '2026-10-20' });
  const page = (await lina.get(`/deals/${deal.id}`)).body;
  assert.deepEqual(page.payments.map((p) => [p.amount, p.receivedOn, p.note]), [[400, '2026-10-05', 'Deposit'], [250, '2026-10-20', null]]);
  assert.equal(page.received, 650);
  assert.equal((await lina.post(`/payments/${first.body.id}/delete`)).status, 204);
  assert.equal((await lina.get(`/deals/${deal.id}`)).body.received, 250);
});

test('a payment in another currency than its deal is refused', async () => {
  const { lina, deal } = await start();
  const res = await lina.post(`/deals/${deal.id}/payments`, { amount: 100, currency: 'OMR', receivedOn: '2026-10-05' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /AED/);
});

test('expenses with and without a deal; deleting a deal removes its payments and unlinks its expenses', async () => {
  const { lina, deal } = await start();
  await lina.post(`/deals/${deal.id}/payments`, { amount: 400, currency: 'AED', receivedOn: '2026-10-05' });
  const linked = await lina.post('/expenses', { dealId: deal.id, category: 'production', amount: 120, currency: 'AED', spentOn: '2026-10-03', note: 'Props' });
  assert.equal(linked.status, 201);
  await lina.post('/expenses', { category: 'equipment', amount: 60, currency: 'OMR', spentOn: '2026-09-28' });
  assert.deepEqual((await lina.get(`/deals/${deal.id}`)).body.expenses.map((e) => e.amount), [120]);

  await lina.post(`/deals/${deal.id}/delete`);
  const expenses = (await lina.get('/expenses')).body;
  assert.deepEqual(expenses.map((e) => [e.amount, e.dealId]).sort(), [[120, null], [60, null]]);
});

test('another influencer gets 404 for payment and expense ids', async () => {
  const ctx = await start();
  const noel = ctx.ws(await ctx.session('influencer', ctx.noel, 'noel@creator.test'));
  const pay = (await ctx.lina.post(`/deals/${ctx.deal.id}/payments`, { amount: 10, currency: 'AED', receivedOn: '2026-10-05' })).body;
  const exp = (await ctx.lina.post('/expenses', { category: 'travel', amount: 5, currency: 'AED', spentOn: '2026-10-05' })).body;
  assert.equal((await noel.post(`/deals/${ctx.deal.id}/payments`, { amount: 1, currency: 'AED', receivedOn: '2026-10-05' })).status, 404);
  assert.equal((await noel.post(`/payments/${pay.id}/delete`)).status, 404);
  assert.equal((await noel.post(`/expenses/${exp.id}/delete`)).status, 404);
  assert.equal((await noel.post('/expenses', { dealId: ctx.deal.id, category: 'travel', amount: 5, currency: 'AED', spentOn: '2026-10-05' })).status, 404);
  assert.deepEqual((await noel.get('/expenses')).body, []);
});

test('bad input is refused', async () => {
  const { lina, deal } = await start();
  assert.equal((await lina.post(`/deals/${deal.id}/payments`, { amount: -1, currency: 'AED', receivedOn: '2026-10-05' })).status, 400);
  assert.equal((await lina.post(`/deals/${deal.id}/payments`, { amount: 5, currency: 'AED', receivedOn: '05/10/2026' })).status, 400);
  assert.equal((await lina.post(`/deals/${deal.id}/payments`, { amount: 5, currency: 'AED' })).status, 400, 'a payment needs its date');
  assert.equal((await lina.post('/expenses', { category: 'snacks', amount: 5, currency: 'AED', spentOn: '2026-10-05' })).status, 400);
  assert.equal((await lina.post('/expenses', { category: 'travel', amount: 5, currency: 'aed', spentOn: '2026-10-05' })).status, 400);
});
