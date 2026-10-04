const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const request = require('supertest');

const { DataStore } = require('../dist/data/store');
const { createPortalRouter } = require('../dist/portal/routes');
const { makeTmpDir } = require('./helpers/tmp');

const COMPANY = 'c1';
const PASSWORD = 'correct horse battery';
const quiet = { error() {} };

const build = ({ enforceRateLimits = false, getBranding } = {}) => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-routes-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const app = express();
  app.use(express.json());
  app.use('/portal-api', createPortalRouter({
    portal: store.portal,
    companyId: COMPANY,
    getBranding: getBranding ?? (() => ({ name: 'Peak Media', logoUrl: undefined })),
    getSubjectName: (contactId) => (contactId === 'contact-1' ? 'Acme Foods' : undefined),
    enforceRateLimits,
    logger: quiet,
  }));
  return { app, portal: store.portal };
};

const activeUser = (portal, overrides = {}) => {
  const { token } = portal.inviteUser({
    companyId: COMPANY, audience: 'client', contactId: 'contact-1',
    email: 'ada@acme.test', name: 'Ada', role: 'client_admin', ...overrides,
  });
  return portal.acceptInvitation(token, PASSWORD);
};

const login = (app, audience, body) => request(app).post(`/portal-api/${audience}/auth/login`).send(body);
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

test('branding is public for both audiences and unknown audiences do not exist', async () => {
  const { app } = build();
  const client = await request(app).get('/portal-api/client/branding');
  assert.equal(client.status, 200);
  assert.deepEqual(client.body, { name: 'Peak Media', logoUrl: null, audience: 'client' });
  assert.equal((await request(app).get('/portal-api/influencer/branding')).body.audience, 'influencer');
  assert.equal((await request(app).get('/portal-api/admin/branding')).status, 404);
  assert.equal(client.headers['cache-control'], 'no-store');
});

test('signing in returns a session, and me describes it without leaking ids', async () => {
  const { app, portal } = build();
  activeUser(portal);

  const res = await login(app, 'client', { email: 'ADA@acme.test', password: PASSWORD });
  assert.equal(res.status, 200);
  assert.ok(res.body.token && res.body.expiresAt);

  const me = await request(app).get('/portal-api/client/me').set(bearer(res.body.token));
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, {
    user: { name: 'Ada', email: 'ada@acme.test', audience: 'client', role: 'client_admin' },
    subject: { name: 'Acme Foods' },
    company: { name: 'Peak Media', logoUrl: null, currency: null },
  });
  assert.doesNotMatch(JSON.stringify(me.body), /contact-1|"id"|companyId|c1/);
});

test('a failed sign-in says the same thing whether or not the email exists', async () => {
  const { app, portal } = build();
  activeUser(portal);
  const wrongPassword = await login(app, 'client', { email: 'ada@acme.test', password: 'not the password' });
  const unknownEmail = await login(app, 'client', { email: 'nobody@acme.test', password: 'not the password' });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(wrongPassword.body, unknownEmail.body);
  assert.equal((await login(app, 'client', { email: 'ada@acme.test' })).status, 400);
  assert.equal((await login(app, 'client', 'nope')).status, 400);
});

test('a session only opens its own audience', async () => {
  const { app, portal } = build();
  activeUser(portal);
  activeUser(portal, { audience: 'influencer', role: 'influencer', contactId: 'contact-9', email: 'inf@x.test', name: 'Inf' });
  const clientToken = (await login(app, 'client', { email: 'ada@acme.test', password: PASSWORD })).body.token;
  const influencerToken = (await login(app, 'influencer', { email: 'inf@x.test', password: PASSWORD })).body.token;

  assert.equal((await request(app).get('/portal-api/influencer/me').set(bearer(clientToken))).status, 401);
  assert.equal((await request(app).get('/portal-api/client/me').set(bearer(influencerToken))).status, 401);
  assert.equal((await request(app).get('/portal-api/client/me').set(bearer(clientToken))).status, 200);
  assert.equal((await request(app).get('/portal-api/client/me')).status, 401);
  assert.equal((await request(app).get('/portal-api/client/me').set({ Authorization: 'Bearer nonsense' })).status, 401);
  assert.equal((await request(app).get('/portal-api/client/me').set({ Authorization: clientToken })).status, 401, 'no Bearer prefix');
});

test('users of another company cannot sign in to this portal', async () => {
  const { app, portal } = build();
  activeUser(portal, { companyId: 'other-company' });
  assert.equal((await login(app, 'client', { email: 'ada@acme.test', password: PASSWORD })).status, 401);
});

test('signing out ends the session', async () => {
  const { app, portal } = build();
  activeUser(portal);
  const { token } = (await login(app, 'client', { email: 'ada@acme.test', password: PASSWORD })).body;
  assert.equal((await request(app).post('/portal-api/client/auth/logout').set(bearer(token))).status, 200);
  assert.equal((await request(app).get('/portal-api/client/me').set(bearer(token))).status, 401);
  assert.equal((await request(app).post('/portal-api/client/auth/logout')).status, 401);
});

test('an invitation can be looked up, accepted once, and only in its own portal', async () => {
  const { app, portal } = build();
  const { token } = portal.inviteUser({
    companyId: COMPANY, audience: 'client', contactId: 'contact-1', email: 'new@acme.test', name: 'Nia', role: 'client_admin',
  });

  const lookup = await request(app).get(`/portal-api/client/invitations/${token}`);
  assert.equal(lookup.status, 200);
  assert.deepEqual(lookup.body, { name: 'Nia', email: 'new@acme.test' });
  assert.equal((await request(app).get(`/portal-api/influencer/invitations/${token}`)).status, 404, 'wrong audience');
  assert.equal((await request(app).get('/portal-api/client/invitations/not-a-real-token')).status, 404);

  const wrongPortal = await request(app).post('/portal-api/influencer/auth/accept-invite').send({ token, password: PASSWORD });
  assert.equal(wrongPortal.status, 400);

  const weak = await request(app).post('/portal-api/client/auth/accept-invite').send({ token, password: 'short' });
  assert.equal(weak.status, 400);
  assert.match(weak.body.message, /at least 10/);

  const accepted = await request(app).post('/portal-api/client/auth/accept-invite').send({ token, password: PASSWORD });
  assert.equal(accepted.status, 200);
  assert.equal((await request(app).get('/portal-api/client/me').set(bearer(accepted.body.token))).body.user.name, 'Nia');

  const again = await request(app).post('/portal-api/client/auth/accept-invite').send({ token, password: PASSWORD });
  assert.equal(again.status, 400);
  assert.equal((await request(app).get(`/portal-api/client/invitations/${token}`)).status, 404);
});

test('an unexpected failure returns a plain message, never a stack', async () => {
  const { app } = build({ getBranding: () => { throw new Error('secret internals at /srv/app.js:12'); } });
  const res = await request(app).get('/portal-api/client/branding');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { message: 'Something went wrong.' });
});

test('sign-in is throttled per email and per address when enforcement is on', async () => {
  const { app } = build({ enforceRateLimits: true });
  const attempt = (audience, email) => login(app, audience, { email, password: 'wrong wrong wrong' });

  for (let i = 0; i < 8; i += 1) assert.equal((await attempt('client', 'ada@acme.test')).status, 401);
  assert.equal((await attempt('client', 'ada@acme.test')).status, 429, 'ninth attempt on one email');
  assert.equal((await attempt('influencer', 'ada@acme.test')).status, 401, 'the other audience has its own email budget');

  // Ten requests from this address so far (8 + 1 + 1); ten more are allowed.
  for (let i = 0; i < 10; i += 1) assert.equal((await attempt('client', `try${i}@x.test`)).status, 401);
  assert.equal((await attempt('client', 'last@x.test')).status, 429, 'twenty-first attempt from one address');
});
