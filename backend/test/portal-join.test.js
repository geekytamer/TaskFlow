const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { buildWorkspace } = require('./helpers/workspace');

/** The public Peak Flexi application form: a lead for staff, nothing granted to the sender. */

const valid = {
  company: 'Sidr Coffee', name: 'Salim Al Harthy', phone: '+968 9123 4567', email: 'salim@sidr.test',
  industry: 'Food', city: 'Muscat', role: 'marketing', crNumber: '1234567', services: ['influencers', 'ads'], notes: 'Opening a second branch.\nWant a launch campaign.',
};

test('an application becomes a lead, an opportunity and a follow-up, and admins and managers are told', async () => {
  const ctx = buildWorkspace();
  const res = await request(ctx.server).post('/public-api/join').send(valid);
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { ok: true });

  const lead = ctx.store.listContacts(ctx.company.id).find((c) => c.name === 'Sidr Coffee');
  assert.ok(lead, 'lead contact created');
  assert.deepEqual(lead.roles, ['Lead']);
  assert.equal(lead.leadSource, 'Website');
  assert.equal(lead.contactPerson, 'Salim Al Harthy');
  assert.equal(lead.phone, '+968 9123 4567');
  assert.match(lead.notes, /Role: Marketing team/);
  assert.match(lead.notes, /Commercial registration: 1234567/);
  assert.match(lead.notes, /Services wanted: Influencer campaigns, Paid ads/);
  assert.ok(lead.tags.includes('peak-flexi'));
  assert.match(lead.notes, /Opening a second branch\.\nWant a launch campaign\./);

  const opp = ctx.store.listOpportunities(ctx.company.id).find((o) => o.contactId === lead.id);
  assert.equal(opp.title, 'Peak Flexi application: Sidr Coffee');

  const told = (user) => ctx.store.listNotifications(user.id).some((n) => n.title === 'New Peak Flexi application: Sidr Coffee');
  assert.equal(told(ctx.users.admin), true);
  assert.equal(told(ctx.users.manager), true);
  assert.equal(told(ctx.users.employee), false);
  assert.equal(told(ctx.users.accountant), false);
});

test('missing or malformed fields are refused and nothing is created', async () => {
  const ctx = buildWorkspace();
  const before = ctx.store.listContacts(ctx.company.id).length;
  for (const body of [
    { ...valid, company: '  ' },
    { ...valid, name: undefined },
    { ...valid, phone: 'call me' },
    { ...valid, email: 'not-an-email' },
    { ...valid, role: 'boss' },
    { ...valid, role: 'constructor' },
    { ...valid, services: ['loans'] },
    { ...valid, services: 'ads' },
    { ...valid, crNumber: 'x'.repeat(41) },
    { ...valid, company: 'x'.repeat(121) },
    { ...valid, notes: 'x'.repeat(1001) },
    { ...valid, company: { $gt: '' } },
  ]) {
    const res = await request(ctx.server).post('/public-api/join').send(body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(ctx.store.listContacts(ctx.company.id).length, before);
});

test('a filled hidden field (a bot) is accepted quietly and dropped', async () => {
  const ctx = buildWorkspace();
  const before = ctx.store.listContacts(ctx.company.id).length;
  const res = await request(ctx.server).post('/public-api/join').send({ ...valid, website: 'http://spam.test' });
  assert.equal(res.status, 201);
  assert.equal(ctx.store.listContacts(ctx.company.id).length, before);
});
