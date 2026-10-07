const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { buildWorkspace } = require('./helpers/workspace');

/** The influencer's own contacts, deals, deliverables and files, through the portal API. */

const PDF = Buffer.from('%PDF-1.4\n% brief\n').toString('base64');

test('an influencer records a brand, a deal and a deliverable', async () => {
  const ctx = buildWorkspace();
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  const brand = await lina.post('/contacts', { name: 'Sidr Coffee', kind: 'brand', email: 'hello@sidr.example' });
  assert.equal(brand.status, 201);
  const deal = await lina.post('/deals', { title: 'Ramadan reel', wsContactId: brand.body.id, amount: 500, currency: 'AED', status: 'confirmed' });
  assert.equal(deal.status, 201);
  assert.equal(deal.body.source, 'own');
  const deliverable = await lina.post(`/deals/${deal.body.id}/deliverables`, { title: 'One reel', dueDate: '2026-11-01', platform: 'Instagram' });
  assert.equal(deliverable.status, 201);

  const page = await lina.get(`/deals/${deal.body.id}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.title, 'Ramadan reel');
  assert.equal(page.body.amount, 500);
  assert.equal(page.body.currency, 'AED');
  assert.equal(page.body.brand.name, 'Sidr Coffee');
  assert.deepEqual(page.body.deliverables.map((d) => [d.title, d.dueDate, d.status]), [['One reel', '2026-11-01', 'todo']]);

  const done = await lina.post(`/deliverables/${deliverable.body.id}`, { status: 'done' });
  assert.equal(done.body.status, 'done');
  const contact = await lina.get(`/contacts/${brand.body.id}`);
  assert.deepEqual(contact.body.deals.map((d) => d.id), [deal.body.id]);
  await lina.post(`/contacts/${brand.body.id}/notes`, { body: 'Prefers WhatsApp.' });
  assert.deepEqual((await lina.get(`/contacts/${brand.body.id}`)).body.notes.map((n) => n.body), ['Prefers WhatsApp.']);
});

test('another influencer gets 404 for every workspace id', async () => {
  const ctx = buildWorkspace();
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  const noel = ctx.ws(await ctx.session('influencer', ctx.noel, 'noel@creator.test'));
  const brand = (await lina.post('/contacts', { name: 'Sidr Coffee', kind: 'brand' })).body;
  const deal = (await lina.post('/deals', { title: 'Reel', currency: 'OMR', status: 'lead', wsContactId: brand.id })).body;
  const item = (await lina.post(`/deals/${deal.id}/deliverables`, { title: 'Story' })).body;
  const file = (await lina.post(`/deals/${deal.id}/files`, { fileName: 'brief.pdf', contentBase64: PDF })).body;

  const attempts = [
    noel.get(`/contacts/${brand.id}`), noel.post(`/contacts/${brand.id}`, { name: 'x', kind: 'brand' }), noel.post(`/contacts/${brand.id}/archive`),
    noel.post(`/contacts/${brand.id}/notes`, { body: 'x' }), noel.get(`/deals/${deal.id}`), noel.post(`/deals/${deal.id}`, { title: 'x' }),
    noel.post(`/deals/${deal.id}/delete`), noel.post(`/deals/${deal.id}/deliverables`, { title: 'x' }), noel.post(`/deliverables/${item.id}`, { status: 'done' }),
    noel.post(`/deliverables/${item.id}/delete`), noel.post(`/deals/${deal.id}/files`, { fileName: 'a.pdf', contentBase64: PDF }),
    noel.get(`/files/${file.id}/content`), noel.post(`/files/${file.id}/delete`),
  ];
  for (const res of await Promise.all(attempts)) assert.equal(res.status, 404, `${res.req.method} ${res.req.path}`);
  assert.equal((await noel.post('/deals', { title: 'Mine', currency: 'OMR', status: 'lead', wsContactId: brand.id })).status, 404, 'cannot link to her brand');
  assert.equal((await lina.get(`/deals/${deal.id}`)).body.title, 'Reel');
  assert.deepEqual((await noel.get('/deals')).body.filter((d) => d.source === 'own'), []);
});

test('bad input is refused', async () => {
  const ctx = buildWorkspace();
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  const ok = { title: 'Reel', currency: 'OMR', status: 'lead' };
  assert.equal((await lina.post('/deals', { ...ok, status: 'won' })).status, 400);
  assert.equal((await lina.post('/deals', { ...ok, amount: -5 })).status, 400);
  assert.equal((await lina.post('/deals', { ...ok, currency: 'dollars' })).status, 400);
  assert.equal((await lina.post('/deals', { ...ok, title: ' ' })).status, 400);
  assert.equal((await lina.post('/deals', { ...ok, startDate: '2026-11-10', endDate: '2026-11-01' })).status, 400);
  assert.equal((await lina.post('/deals', { ...ok, startDate: '10/11/2026' })).status, 400);
  assert.equal((await lina.post('/contacts', { name: 'Ali', kind: 'friend' })).status, 400);
  assert.equal((await lina.post('/contacts', { name: '', kind: 'brand' })).status, 400);
  assert.equal((await lina.post('/settings', { defaultCurrency: 'usd' })).status, 400);
  assert.equal((await lina.post('/settings', { defaultCurrency: 'USD' })).body.defaultCurrency, 'USD');
});

test('files: the real type is checked and the size capped; only the owner downloads', async () => {
  const ctx = buildWorkspace();
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  const deal = (await lina.post('/deals', { title: 'Reel', currency: 'OMR', status: 'lead' })).body;
  const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
  assert.equal((await lina.post(`/deals/${deal.id}/files`, { fileName: 'x.pdf', contentBase64: html })).status, 415);
  const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024)]).toString('base64');
  assert.equal((await lina.post(`/deals/${deal.id}/files`, { fileName: 'big.pdf', contentBase64: big })).status, 413);
  assert.deepEqual((await lina.get(`/deals/${deal.id}`)).body.files, []);

  const file = await lina.post(`/deals/${deal.id}/files`, { fileName: 'brief.pdf', contentBase64: PDF });
  assert.equal(file.status, 201);
  const download = await lina.get(`/files/${file.body.id}/content`);
  assert.equal(download.status, 200);
  assert.match(download.headers['content-disposition'], /attachment/);
  assert.equal((await lina.post(`/files/${file.body.id}/delete`)).status, 204);
  assert.equal((await lina.get(`/files/${file.body.id}/content`)).status, 404);
});

test('a deal whose brand is archived still opens with the brand name', async () => {
  const ctx = buildWorkspace();
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  const brand = (await lina.post('/contacts', { name: 'Old Brand', kind: 'brand' })).body;
  const deal = (await lina.post('/deals', { title: 'Reel', currency: 'OMR', status: 'paid', wsContactId: brand.id })).body;
  await lina.post(`/contacts/${brand.id}/archive`);
  assert.deepEqual((await lina.get('/contacts')).body, []);
  const page = await lina.get(`/deals/${deal.id}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.brand.name, 'Old Brand');
  assert.ok(page.body.brand.archived);
  assert.equal((await lina.post('/deals', { title: 'New', currency: 'OMR', status: 'lead', wsContactId: brand.id })).status, 400, 'no new deals for an archived brand');
});

test('a client session cannot reach workspace routes', async () => {
  const ctx = buildWorkspace();
  const client = await ctx.session('client', ctx.client, 'buyer@alnoor.test');
  const res = await request(ctx.server).get('/portal-api/client/workspace/deals').set(client);
  assert.equal(res.status, 404);
  const asInfluencerPath = await request(ctx.server).get('/portal-api/influencer/workspace/deals').set(client);
  assert.ok([401, 403].includes(asInfluencerPath.status));
});
