const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Seed: admin (companies 1-3), user-2 Manager of 1, user-5 Employee of 1 and
 * Manager of 2. Password emails are captured instead of sent.
 */
function setup(options = {}) {
  const dbPath = path.join(makeTmpDir('taskflow-passwords-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const mail = [];
  const sendPasswordEmail = options.mailFails
    ? async () => ({ sent: false, error: 'mail down' })
    : async (input) => { mail.push(input); return { sent: true }; };
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy', sendPasswordEmail,
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const auth = (id) => `Bearer ${store.issueToken(id)}`;
  const tokenOf = (link) => new URL(link).searchParams.get('token');
  return { app, store, admin, auth, mail, tokenOf, dbPath };
}

const newPerson = { name: 'Noor Al Hinai', email: 'noor@example.om', companyIds: ['1'], companyRoles: [{ companyId: '1', role: 'Employee' }] };

test('a new account gets a link to set its own password, not a password', async () => {
  const { app, admin, auth, mail, tokenOf } = setup();
  const created = await request(app).post('/users').set('Authorization', auth(admin.id)).send(newPerson);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.invite.sent, true);
  assert.equal(created.body.invite.link, undefined, 'the link travels by email only when email works');
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to, 'noor@example.om');
  assert.equal(mail[0].purpose, 'invite');
  assert.match(mail[0].link, /\/set-password\?token=/);

  // Until the link is used, no password signs in.
  assert.equal((await request(app).post('/auth/login').send({ email: 'noor@example.om', password: '' })).status, 400);

  const token = tokenOf(mail[0].link);
  const check = await request(app).get(`/auth/password-token?token=${token}`);
  assert.equal(check.status, 200);
  assert.equal(check.body.purpose, 'invite');
  assert.equal(check.body.name, 'Noor Al Hinai');

  assert.equal((await request(app).post('/auth/set-password').send({ token, password: 'short' })).status, 400);
  const set = await request(app).post('/auth/set-password').send({ token, password: 'Muscat-2026' });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.ok(set.body.token, 'setting the password signs the person in');
  assert.equal((await request(app).get('/auth/me').set('Authorization', `Bearer ${set.body.token}`)).status, 200);
  assert.equal((await request(app).post('/auth/login').send({ email: 'noor@example.om', password: 'Muscat-2026' })).status, 200);

  // A link works once.
  assert.equal((await request(app).post('/auth/set-password').send({ token, password: 'Another-2026' })).status, 400);
  assert.equal((await request(app).get(`/auth/password-token?token=${token}`)).status, 400);
});

test('when the email cannot go out, the admin gets the link to pass on', async () => {
  const { app, admin, auth } = setup({ mailFails: true });
  const created = await request(app).post('/users').set('Authorization', auth(admin.id)).send(newPerson);
  assert.equal(created.status, 201);
  assert.equal(created.body.invite.sent, false);
  assert.match(created.body.invite.link, /\/set-password\?token=/);
});

test('an admin sends a reset link; only someone who manages all of the person\'s companies may', async () => {
  const { app, admin, auth, mail, tokenOf, store } = setup();
  // user-5 also works in company 2, which user-2 does not manage.
  assert.equal((await request(app).post('/users/user-5/password-reset').set('Authorization', auth('user-2'))).status, 403);
  assert.equal((await request(app).post('/users/user-3/password-reset').set('Authorization', auth('user-3'))).status, 403, 'an employee cannot reset someone');

  const res = await request(app).post('/users/user-5/password-reset').set('Authorization', auth(admin.id));
  assert.equal(res.status, 200);
  assert.equal(res.body.sent, true);
  assert.equal(mail.at(-1).purpose, 'reset');

  // Resetting signs the person out everywhere.
  const oldSession = auth('user-5');
  const token = tokenOf(mail.at(-1).link);
  assert.equal((await request(app).post('/auth/set-password').send({ token, password: 'Brand-new-1' })).status, 200);
  assert.equal((await request(app).get('/auth/me').set('Authorization', oldSession)).status, 401);
  assert.ok(store.findUserByEmail(store.getUserById('user-5').email));
});

test('forgot password: same answer for any address; a real one gets a link that expires', async () => {
  const { app, store, mail, tokenOf } = setup();
  const unknown = await request(app).post('/auth/forgot-password').send({ email: 'nobody@example.com' });
  const known = await request(app).post('/auth/forgot-password').send({ email: 'charlie.d@innovatecorp.com' });
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body, known.body, 'the answer never reveals who has an account');
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to, 'charlie.d@innovatecorp.com');

  // Asking again straight away does not send another email.
  await request(app).post('/auth/forgot-password').send({ email: 'charlie.d@innovatecorp.com' });
  assert.equal(mail.length, 1);

  const token = tokenOf(mail[0].link);
  store.db.prepare("UPDATE password_tokens SET expiresAt = '2000-01-01T00:00:00.000Z'").run();
  assert.equal((await request(app).post('/auth/set-password').send({ token, password: 'Too-late-2026' })).status, 400);
});

test('anyone changes their own password with the current one; other devices are signed out', async () => {
  const { app, auth } = setup();
  const here = auth('user-3');
  const elsewhere = auth('user-3');
  assert.equal((await request(app).put('/auth/password').set('Authorization', here).send({ currentPassword: 'wrong', newPassword: 'Better-2026' })).status, 400);
  const ok = await request(app).put('/auth/password').set('Authorization', here).send({ currentPassword: 'password', newPassword: 'Better-2026' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await request(app).get('/auth/me').set('Authorization', here)).status, 200, 'this device stays in');
  assert.equal((await request(app).get('/auth/me').set('Authorization', elsewhere)).status, 401, 'other devices are out');
  assert.equal((await request(app).post('/auth/login').send({ email: 'charlie.d@innovatecorp.com', password: 'Better-2026' })).status, 200);
});

test('an admin setting someone\'s password signs them out', async () => {
  const { app, admin, auth } = setup();
  const theirs = auth('user-3');
  assert.equal((await request(app).put('/users/user-3').set('Authorization', auth(admin.id)).send({ password: 'Admin-set-2026' })).status, 200);
  assert.equal((await request(app).get('/auth/me').set('Authorization', theirs)).status, 401);
});

test('a sign-in unused for 30 days ends', async () => {
  const { app, store, auth } = setup();
  const session = auth('user-3');
  assert.equal((await request(app).get('/auth/me').set('Authorization', session)).status, 200);
  store.db.prepare('UPDATE tokens SET lastUsedAt = ?').run(new Date(Date.now() - 31 * 86_400_000).toISOString());
  assert.equal((await request(app).get('/auth/me').set('Authorization', session)).status, 401);
});

test('passwords left unscrambled from before hashing are scrambled on start', async () => {
  const { store, dbPath } = setup();
  store.db.prepare("UPDATE users SET password = 'legacy-plain' WHERE id = 'user-3'").run();
  store.db.prepare("DELETE FROM schema_migrations WHERE id = '138_hash_plain_passwords'").run();
  const reopened = new DataStore({ dbPath, seedOnEmpty: false });
  const row = reopened.db.prepare("SELECT password FROM users WHERE id = 'user-3'").get();
  assert.match(row.password, /^\$2[aby]\$/);
  const { verifyPassword } = require('../dist/password');
  assert.ok(verifyPassword('legacy-plain', row.password), 'the same password still works');
});
