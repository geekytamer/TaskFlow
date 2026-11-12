const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { setGreenFetch } = require('../dist/services/greenApi');
const { setDocumentPdfRenderer } = require('../dist/pdf/document-pdf');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Sending a quotation or an invoice by WhatsApp: the same PDF as the download,
 * to the document's contact, recorded in the chat and on the document.
 * The browser and Green API are faked; every call is recorded.
 */

const quiet = { info() {}, warn() {}, error() {} };
const FAKE_PDF = Buffer.from('%PDF-1.4 fake');

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-wa-docs-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const member = (name, role) => store.createUser({ name, email: `${name.toLowerCase()}@peak.test`, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }] });
  const ada = member('Ada', 'Admin');
  const dan = member('Dan', 'Employee');
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet }).listen(0);
  app.unref();
  const as = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  store.upsertWhatsappInstance(company.id, { idInstance: '1101', apiToken: 'green-token' });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'مطعم الموج', phone: '+968 9555 5555', roles: ['Client'] });
  const at = new Date();
  const later = new Date(Date.now() + 30 * 86400000);
  const quote = store.createQuotation({ companyId: company.id, clientId: client.id, contactId: client.id, issueDate: at, validUntil: later, language: 'ar', items: [{ description: 'باقة', quantity: 1, unitPrice: 150 }] });
  const invoice = store.createInvoice({ companyId: company.id, clientId: client.id, issueDate: at, dueDate: later, status: 'Sent', lineItems: [{ description: 'x', quantity: 1, unitPrice: 50, amount: 50, itemType: 'Manual' }] });
  const rendered = [];
  setDocumentPdfRenderer(async (opts) => { rendered.push(opts.url); return FAKE_PDF; });
  const sentFiles = [];
  setGreenFetch(async (url, init) => {
    const fields = {};
    for (const [k, v] of init.body.entries()) fields[k] = typeof v === 'string' ? v : { name: v.name, bytes: Buffer.from(await v.arrayBuffer()) };
    sentFiles.push({ url: String(url), fields });
    return new Response(JSON.stringify({ idMessage: `G-${sentFiles.length}` }), { status: 200 });
  });
  const send = (user, body) => request(app).post(`/companies/${company.id}/whatsapp/send-document`).set(as(user)).send(body);
  return { app, store, company, ada, dan, client, quote, invoice, rendered, sentFiles, send };
};
test.afterEach(() => { setGreenFetch(null); setDocumentPdfRenderer(null); });

test('a quotation goes as its PDF to its contact, in its own language, and is recorded', async () => {
  const ctx = build();
  const res = await ctx.send(ctx.ada, { kind: 'quotation', id: ctx.quote.id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(ctx.rendered.length, 1);
  assert.match(ctx.rendered[0], new RegExp(`/quotation/${ctx.quote.id}\\?lang=ar$`), 'the same public page as print, in the quote\'s language');
  const [sent] = ctx.sentFiles;
  assert.equal(sent.fields.chatId, '96895555555@c.us', 'to the quote\'s contact');
  assert.equal(sent.fields.fileName, `Quotation-${ctx.quote.quoteNumber}.pdf`);
  assert.ok(sent.fields.file.bytes.equals(FAKE_PDF));
  assert.equal(sent.fields.caption, `مرحباً، تجدون مرفقاً عرض السعر رقم ${ctx.quote.quoteNumber}.`);

  assert.deepEqual([res.body.type, res.body.contextEntityType, res.body.contextEntityId, res.body.contactId], ['document', 'quotation', ctx.quote.id, ctx.client.id]);
  assert.match(res.body.mediaUrl, /^wa-file:/, 'the chat can show the file afterwards');
  const activity = ctx.store.db.prepare("SELECT * FROM activity_events WHERE entityType = 'quotation' AND entityId = ? AND action = 'sent_whatsapp'").get(ctx.quote.id);
  assert.ok(activity, 'the quote\'s history says it was sent');
  const chat = ctx.store.getWhatsappChatSettings(ctx.company.id, '96895555555@c.us');
  assert.deepEqual([chat.status, chat.assigneeUserId], ['waiting', ctx.ada.id]);
});

test('an invoice: another number and words may be given; rights and missing phones are checked', async () => {
  const ctx = build();
  const res = await ctx.send(ctx.ada, { kind: 'invoice', id: ctx.invoice.id, phone: '+968 9666 6666', caption: 'فاتورتكم', language: 'ar' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(ctx.sentFiles[0].fields.chatId, '96896666666@c.us');
  assert.equal(ctx.sentFiles[0].fields.caption, 'فاتورتكم');
  assert.match(ctx.rendered[0], new RegExp(`/invoice/${ctx.invoice.id}\\?lang=ar$`));

  assert.equal((await ctx.send(ctx.dan, { kind: 'invoice', id: ctx.invoice.id })).status, 403, 'needs WhatsApp sending');
  assert.equal((await ctx.send(ctx.ada, { kind: 'order', id: ctx.invoice.id })).status, 400);
  assert.equal((await ctx.send(ctx.ada, { kind: 'invoice', id: 'nope' })).status, 404);

  const nobody = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'No Phone', roles: ['Client'] });
  const quote = ctx.store.createQuotation({ companyId: ctx.company.id, clientId: nobody.id, contactId: nobody.id, issueDate: new Date(), validUntil: new Date(Date.now() + 86400000), items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
  const none = await ctx.send(ctx.ada, { kind: 'quotation', id: quote.id });
  assert.equal(none.status, 400);
  assert.match(none.body.message, /no contact phone/);
  assert.equal(ctx.sentFiles.length, 1, 'nothing else left');
});

test('another company\'s document cannot be sent through this one', async () => {
  const ctx = build();
  const other = ctx.store.createCompany({ name: 'Other', website: '', address: '' });
  ctx.store.addUserToCompany?.(ctx.ada.id, other.id, 'Admin');
  const res = await request(ctx.app).post(`/companies/${other.id}/whatsapp/send-document`).set({ Authorization: `Bearer ${ctx.store.issueToken(ctx.ada.id)}` }).send({ kind: 'quotation', id: ctx.quote.id });
  assert.ok([403, 404].includes(res.status), `refused (${res.status})`);
  assert.equal(ctx.sentFiles.length, 0);
});

test('when the PDF cannot be made, nothing is sent or kept', async () => {
  const ctx = build();
  setDocumentPdfRenderer(async () => { throw new Error('no chromium'); });
  const res = await ctx.send(ctx.ada, { kind: 'quotation', id: ctx.quote.id });
  assert.equal(res.status, 503);
  assert.equal(ctx.sentFiles.length, 0);
  assert.equal(ctx.store.db.prepare('SELECT COUNT(*) AS c FROM whatsapp_media').get().c, 0);
  assert.equal(ctx.store.listWhatsappMessages(ctx.company.id).length, 0);
});

test('the download routes still give the same file through the shared code', async () => {
  const ctx = build();
  const q = await request(ctx.app).get(`/quotations/${ctx.quote.id}/pdf`).set({ Authorization: `Bearer ${ctx.store.issueToken(ctx.ada.id)}` }).buffer(true);
  assert.equal(q.status, 200);
  assert.equal(q.headers['content-disposition'], `attachment; filename="Quotation-${ctx.quote.quoteNumber}.pdf"`);
  const i = await request(ctx.app).get(`/invoices/${ctx.invoice.id}/pdf?lang=en`).set({ Authorization: `Bearer ${ctx.store.issueToken(ctx.ada.id)}` }).buffer(true);
  assert.equal(i.status, 200);
  assert.match(ctx.rendered.at(-1), /\?lang=en$/);
});
