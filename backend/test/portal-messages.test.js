const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * The shared message thread and files. Messages are append-only and live in
 * their own table, so a contact's internal notes can never appear in the
 * thread. Files are accepted by what their bytes are, not what they claim to
 * be, and always download rather than open.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(16, 3)]);
const HTML = Buffer.from('<html><script>alert(localStorage.taskflow_token)</script></html>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const b64 = (buf) => buf.toString('base64');

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-messages-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const staff = (role, name, email) => store.createUser({
    name, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }],
  });
  const owner = staff('Manager', 'Carla Owner', 'carla@peak.test');
  const employee = staff('Employee', 'Eve Employee', 'eve@peak.test');
  const client = store.createContact({
    companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: owner.id,
    notes: 'INTERNAL-CONTACT-NOTE',
  });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer'] });

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();

  const session = async (audience, contact, email, name = email) => {
    const { token } = store.portal.inviteUser({
      companyId: company.id, audience, contactId: contact.id, email, name,
      role: audience === 'client' ? 'client_admin' : 'influencer',
    });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  const auth = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  return { server, store, company, owner, client, rival, lina, session, ownerAuth: auth(owner), employeeAuth: auth(employee) };
};

const upload = (ctx, session, fileName, buffer, audience = 'client') =>
  request(ctx.server).post(`/portal-api/${audience}/files`).set(session).send({ fileName, contentBase64: b64(buffer) });

test('files are accepted by their bytes: PDF, PNG, JPEG and WebP only', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  for (const [name, buf, type] of [['brief.pdf', PDF, 'application/pdf'], ['logo.png', PNG, 'image/png'], ['shot.jpg', JPEG, 'image/jpeg'], ['shot.webp', WEBP, 'image/webp']]) {
    const res = await upload(ctx, omar, name, buf);
    assert.equal(res.status, 201, name);
    assert.equal(res.body.mimeType, type, name);
    assert.equal(res.body.sizeBytes, buf.length);
    assert.equal(JSON.stringify(res.body).includes(b64(buf)), false, 'the bytes are never echoed back');
  }
  for (const [name, buf] of [['page.html', HTML], ['logo.svg', SVG], ['looks-fine.png', HTML], ['brief.pdf', SVG]]) {
    assert.equal((await upload(ctx, omar, name, buf)).status, 415, `${name} refused`);
  }
  assert.equal((await upload(ctx, omar, 'empty.pdf', Buffer.alloc(0))).status, 400);
  assert.equal((await request(ctx.server).post('/portal-api/client/files').set(omar).send({ fileName: 'x.pdf', contentBase64: '%%%not base64%%%' })).status, 400);
});

test('files over 10 MB are refused', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
  assert.equal((await upload(ctx, omar, 'huge.pdf', big)).status, 413);
});

test('a file always downloads, sandboxed, with a name that matches its real type', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const file = (await upload(ctx, omar, 'brand guide.exe', PDF)).body;
  const res = await request(ctx.server).get(`/portal-api/client/files/${file.id}/content`).set(omar).buffer(true).parse((r, cb) => {
    const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.match(res.headers['content-disposition'], /^attachment; filename="brand guide\.pdf"/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /sandbox/);
  assert.deepEqual(res.body, PDF);
});

test('files and messages stay with their own client', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const sara = await ctx.session('client', ctx.rival, 'sara@sidr.test');
  const file = (await upload(ctx, omar, 'brief.pdf', PDF)).body;
  await request(ctx.server).post('/portal-api/client/messages').set(omar).send({ body: 'Our brief is attached.', fileIds: [file.id] });

  assert.equal((await request(ctx.server).get(`/portal-api/client/files/${file.id}/content`).set(sara)).status, 404);
  assert.deepEqual((await request(ctx.server).get('/portal-api/client/messages').set(sara)).body, []);
  const stolen = await request(ctx.server).post('/portal-api/client/messages').set(sara).send({ body: 'mine now', fileIds: [file.id] });
  assert.equal(stolen.status, 400, 'another client cannot attach it');

  const influencer = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  assert.equal((await request(ctx.server).get(`/portal-api/influencer/files/${file.id}/content`).set(influencer)).status, 404);
  assert.deepEqual((await request(ctx.server).get('/portal-api/influencer/messages').set(influencer)).body, []);
});

test('the thread is shared both ways, append-only, and never shows internal notes', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test', 'Omar Al Noor');
  const file = (await upload(ctx, omar, 'brief.pdf', PDF)).body;

  const posted = await request(ctx.server).post('/portal-api/client/messages').set(omar).send({ body: 'Brief attached for the Ramadan launch.', fileIds: [file.id] });
  assert.equal(posted.status, 201);
  assert.deepEqual(posted.body.files.map((f) => f.fileName), ['brief.pdf']);
  assert.equal(ctx.store.listNotifications(ctx.owner.id).filter((n) => /Al Noor Dates/.test(n.title)).length, 1, 'the owner is told');

  const reply = await request(ctx.server).post(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/messages`).set(ctx.ownerAuth)
    .send({ body: 'Thanks Omar, reviewing today.' });
  assert.equal(reply.status, 201);

  const thread = (await request(ctx.server).get('/portal-api/client/messages').set(omar)).body;
  assert.deepEqual(thread.map((m) => [m.author.kind, m.author.name, m.body]), [
    ['you', 'Omar Al Noor', 'Brief attached for the Ramadan launch.'],
    ['team', 'Carla Owner', 'Thanks Omar, reviewing today.'],
  ]);
  assert.equal(JSON.stringify(thread).includes('INTERNAL-CONTACT-NOTE'), false);

  const staffView = (await request(ctx.server).get(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/messages`).set(ctx.ownerAuth)).body;
  assert.equal(staffView.messages.length, 2);
  assert.deepEqual(staffView.files.map((f) => f.fileName), ['brief.pdf'], 'staff see every file the client shared');

  assert.equal((await request(ctx.server).put(`/portal-api/client/messages/${thread[0].id}`).set(omar).send({ body: 'edited' })).status, 404);
  assert.equal((await request(ctx.server).delete(`/portal-api/client/messages/${thread[0].id}`).set(omar)).status, 404);
});

test('a file can be attached once, only by whoever uploaded it', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const colleague = await ctx.session('client', ctx.client, 'hind@alnoor.test');
  const file = (await upload(ctx, omar, 'brief.pdf', PDF)).body;
  assert.equal((await request(ctx.server).post('/portal-api/client/messages').set(colleague).send({ body: 'hi', fileIds: [file.id] })).status, 400);
  assert.equal((await request(ctx.server).post('/portal-api/client/messages').set(omar).send({ body: 'first', fileIds: [file.id] })).status, 201);
  assert.equal((await request(ctx.server).post('/portal-api/client/messages').set(omar).send({ body: 'again', fileIds: [file.id] })).status, 400);
});

test('messages are validated', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  for (const body of [{}, { body: '' }, { body: '   ' }, { body: 'x'.repeat(4001) }, { body: 'ok', fileIds: 'nope' }]) {
    assert.equal((await request(ctx.server).post('/portal-api/client/messages').set(omar).send(body)).status, 400, JSON.stringify(body).slice(0, 40));
  }
});

test('staff need the portal permission, and staff downloads are sandboxed too', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const file = (await upload(ctx, omar, 'brief.pdf', PDF)).body;
  const url = `/companies/${ctx.company.id}/contacts/${ctx.client.id}/messages`;
  assert.equal((await request(ctx.server).get(url).set(ctx.employeeAuth)).status, 403);
  assert.equal((await request(ctx.server).post(url).set(ctx.employeeAuth).send({ body: 'hi' })).status, 403);

  const staffFile = await request(ctx.server).get(`/companies/${ctx.company.id}/portal-files/${file.id}/content`).set(ctx.ownerAuth);
  assert.equal(staffFile.status, 200);
  assert.match(staffFile.headers['content-disposition'], /^attachment/);
  assert.equal(staffFile.headers['x-content-type-options'], 'nosniff');
  assert.equal((await request(ctx.server).get(`/companies/${ctx.company.id}/portal-files/${file.id}/content`).set(ctx.employeeAuth)).status, 403);
});

test('staff can share a file with the client in the thread', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const shared = await request(ctx.server).post(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/files`).set(ctx.ownerAuth)
    .send({ fileName: 'moodboard.png', contentBase64: b64(PNG) });
  assert.equal(shared.status, 201);
  const msg = await request(ctx.server).post(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/messages`).set(ctx.ownerAuth)
    .send({ body: 'Moodboard for your review.', fileIds: [shared.body.id] });
  assert.equal(msg.status, 201);
  const thread = (await request(ctx.server).get('/portal-api/client/messages').set(omar)).body;
  const fileId = thread[0].files[0].id;
  assert.equal((await request(ctx.server).get(`/portal-api/client/files/${fileId}/content`).set(omar)).status, 200);
  assert.equal((await request(ctx.server).post(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/files`).set(ctx.ownerAuth)
    .send({ fileName: 'x.svg', contentBase64: b64(SVG) })).status, 415);
});

test('requests can carry files the client uploaded', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const file = (await upload(ctx, omar, 'guidelines.pdf', PDF)).body;
  const res = await request(ctx.server).post('/portal-api/client/requests').set(omar).send({
    title: 'Eid gifting', objective: 'Short teasers for our Eid gift range.', fileIds: [file.id],
  });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.files.map((f) => f.fileName), ['guidelines.pdf']);
  const [opportunity] = ctx.store.listOpportunities(ctx.company.id);
  assert.match(opportunity.notes, /guidelines\.pdf/, 'staff see the file named in the brief');
});

test('an unanswered client message is one open follow-up, closed when staff reply', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const openReplies = () => ctx.store.listFollowupEntities(ctx.company.id, { status: 'active', entityType: 'contact', entityId: ctx.client.id })
    .filter((f) => f.sourceTrigger === 'portal_message');

  // Intermittent under full-suite load once (2026-10-04, not reproduced in 20 parallel and 6 full runs):
  // the statuses below make the next failure say whether a POST failed or the follow-up was not opened.
  const first = await request(ctx.server).post('/portal-api/client/messages').set(omar).send({ body: 'First question.' });
  const second = await request(ctx.server).post('/portal-api/client/messages').set(omar).send({ body: 'And a second one.' });
  assert.deepEqual([first.status, second.status], [201, 201], JSON.stringify([first.body, second.body]));
  assert.equal(openReplies().length, 1, 'one reminder, not one per message');
  assert.equal(openReplies()[0].ownerUserId, ctx.owner.id);

  await request(ctx.server).post(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/messages`).set(ctx.ownerAuth).send({ body: 'Answered both.' });
  assert.equal(openReplies().length, 0, 'a staff reply closes it');

  await request(ctx.server).post('/portal-api/client/messages').set(omar).send({ body: 'One more thing.' });
  assert.equal(openReplies().length, 1, 'a new message opens a new one');
});
