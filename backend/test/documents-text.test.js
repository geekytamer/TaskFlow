const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const X = require('../dist/documents/text-extract');
const { makeTmpDir } = require('./helpers/tmp');

/** Documents hub stage 4: text out of files, Arabic-aware search, read routes. */

/** A zip with deflated entries, enough to stand in for an Office file. */
function makeZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = zlib.deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(8, 10); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(nameBuf.length, 28); dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dirBuf, end]);
}

/** A one-page PDF with a line of Latin text (pdf.js reads it like any other). */
function makePdf(line) {
  const content = `BT /F1 18 Tf 72 720 Td (${line}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

test('Arabic words are folded so spellings, the article and PDF ligatures still match', () => {
  assert.equal(X.normWord('الأتعاب'), X.normWord('األتعاب'), 'lam-alef as PDFs give it');
  assert.equal(X.normWord('مذكّرة'), X.normWord('مذكرة'), 'harakat');
  assert.equal(X.normWord('إتفاقية'), X.normWord('اتفاقيه'), 'alef and taa marbuta');
  assert.ok(X.wordForms('الطرفين').includes(X.normWord('طرفين')), 'without the article');
  assert.ok(X.wordForms('والخدمات').includes(X.normWord('خدمات')));
  assert.equal(X.ftsQuery('a'), null, 'nothing to search');
  assert.match(X.ftsQuery('Zubair hotel'), /AND/);
  assert.equal(X.fixRtlLines('تفاهم مذكرة\nService Agreement'), 'مذكرة تفاهم\nService Agreement', 'Arabic-only lines read in order; mixed lines untouched');
});

test('text comes out of Word, Excel, PowerPoint, plain text and PDF; images are unsupported', async () => {
  const docx = makeZip({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>مذكرة تفاهم</w:t></w:r></w:p><w:p><w:r><w:t>Fee: 250 &amp; VAT</w:t></w:r></w:p></w:body></w:document>' });
  const word = await X.extractFileText({ fileName: 'mou.docx', content: docx });
  assert.equal(word.status, 'ok');
  assert.equal(word.text, 'مذكرة تفاهم\nFee: 250 & VAT');

  const xlsx = makeZip({
    'xl/sharedStrings.xml': '<sst><si><t>Service</t></si><si><t>Price</t></si><si><t>Reels</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c t="s"><v>2</v></c><c><v>250</v></c></row></sheetData></worksheet>',
  });
  assert.equal((await X.extractFileText({ fileName: 'prices.xlsx', content: xlsx })).text, 'Service\tPrice\nReels\t250');

  const pptx = makeZip({ 'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>', 'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>First</a:t></a:r></a:p></p:sld>' });
  assert.equal((await X.extractFileText({ fileName: 'deck.pptx', content: pptx })).text, 'First\n\nSecond', 'slides in order');

  assert.equal((await X.extractFileText({ fileName: 'n.txt', mimeType: 'text/plain', content: Buffer.from(' hello \r\n') })).text, 'hello');
  assert.equal((await X.extractFileText({ fileName: 'p.html', content: Buffer.from('<p>One</p><script>x()</script><p>Two</p>') })).text, 'One\nTwo');

  const pdf = await X.extractFileText({ fileName: 'contract.pdf', mimeType: 'application/pdf', content: makePdf('Service agreement with Zubair Hotel') });
  assert.equal(pdf.status, 'ok', pdf.note);
  assert.match(pdf.text, /Service agreement with Zubair Hotel/);

  assert.equal((await X.extractFileText({ fileName: 'scan.jpg', mimeType: 'image/jpeg', content: Buffer.from([1, 2]) })).status, 'unsupported');
  assert.equal((await X.extractFileText({ fileName: 'broken.docx', content: Buffer.from('not a zip') })).status, 'failed');
  assert.equal((await X.extractFileText({ fileName: 'blank.txt', content: Buffer.from('  ') })).status, 'empty');
});

test('a generated document reads with its fields filled in', () => {
  const doc = { title: 'MoU', docSnapshot: { body: [
    { type: 'heading', content: 'مذكرة تفاهم' },
    { type: 'container', children: [{ type: 'text', content: 'Purpose: {{field.purpose}}' }] },
    { type: 'text', content: '{{document.notes}}' },
  ] } };
  const out = X.documentText(doc, { 'field.purpose': 'joint campaigns', 'document.notes': 'Signed with {{client.name}}', 'client.name': 'Zubair Hotel' });
  assert.equal(out.text, 'MoU\nمذكرة تفاهم\nPurpose: joint campaigns\nSigned with Zubair Hotel');
});

test('a snippet shows the words around the match, in the original spelling', () => {
  const text = `${'x '.repeat(80)}ويلتزم الطرفان بدفع الأتعاب خلال ثلاثين يوماً ${'y '.repeat(80)}`;
  const s = X.snippetOf(text, 'الاتعاب');
  assert.ok(s.includes('الأتعاب'), s);
  assert.ok(s.startsWith('…') && s.endsWith('…'));
});

let seq = 0;
const setup = (engine) => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-doctext-'), 'taskflow.db'), seedOnEmpty: false });
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: { info() {}, warn() {}, error() {} } }).listen(0);
  server.unref();
  const co = store.createCompany({ name: 'Co' });
  const mk = (role) => store.createUser({ name: `${role}${++seq}`, email: `${role}${seq}@doctext.test`, password: 'x', role, companyIds: [co.id], companyRoles: [{ companyId: co.id, role }] });
  const as = (u) => ({
    get: (url) => request(server).get(url).set('Authorization', `Bearer ${store.issueToken(u.id)}`),
    post: (url, body) => request(server).post(url).set('Authorization', `Bearer ${store.issueToken(u.id)}`).send(body ?? {}),
    put: (url, body) => request(server).put(url).set('Authorization', `Bearer ${store.issueToken(u.id)}`).send(body ?? {}),
  });
  return { store, co, mk, as };
};

for (const engine of ['legacy', 'v2']) {
  test(`a file's words find it in the library, and its text can be read page by page (${engine})`, async () => {
    const { store, co, mk, as } = setup(engine);
    const admin = mk('Admin');
    const body = `مذكرة تفاهم مع فندق الزبير\nيلتزم الطرفان بالسرية.\n${'Clause text. '.repeat(1500)}\nEnd of contract.`;
    const up = await as(admin).post(`/companies/${co.id}/records/company/${co.id}/attachments`, { fileName: 'MoU.txt', mimeType: 'text/plain', contentBase64: Buffer.from(body).toString('base64') });
    assert.equal(up.status, 201, JSON.stringify(up.body));

    const first = await as(admin).get(`/record-attachments/${up.body.id}/text`);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.status, 'ok');
    assert.equal(first.body.name, 'MoU.txt');
    assert.equal(first.body.more, true, 'long text comes in pages');
    assert.ok(first.body.text.startsWith('مذكرة تفاهم'));
    const next = await as(admin).get(`/record-attachments/${up.body.id}/text?offset=${first.body.text.length}&limit=50000`);
    assert.equal(next.body.more, false);
    assert.ok(next.body.text.endsWith('End of contract.'));

    const hit = await as(admin).get(`/companies/${co.id}/library?q=${encodeURIComponent('طرفان بالسريه')}`);
    assert.equal(hit.status, 200);
    assert.deepEqual(hit.body.items.map((i) => i.name), ['MoU.txt'], 'found by words inside, any spelling, without the article');
    assert.ok(hit.body.items[0].snippet.includes('بالسرية'), hit.body.items[0].snippet);
    assert.deepEqual((await as(admin).get(`/companies/${co.id}/library?q=nothing-like-this`)).body.items, []);
  });

  test(`text follows the record's rule: an employee can't read it, a switched-off module hides it (${engine})`, async () => {
    const { store, co, mk, as } = setup(engine);
    const admin = mk('Admin');
    const employee = mk('Employee');
    const item = store.createInventoryItem({ companyId: co.id, name: 'Dates', category: 'Food', unit: 'box', unitCost: 1 });
    const up = await as(admin).post(`/companies/${co.id}/records/inventory_item/${item.id}/attachments`, { fileName: 'spec.txt', contentBase64: Buffer.from('cold storage spec').toString('base64') });
    assert.equal((await as(admin).get(`/record-attachments/${up.body.id}/text`)).status, 200);
    assert.equal((await as(employee).get(`/record-attachments/${up.body.id}/text`)).status, 403);
    assert.equal((await as(admin).get(`/companies/${co.id}/library?q=storage`)).body.items.length, 1);
    store.updateCompany(co.id, { disabledModules: ['inventory', 'manufacturing', 'purchasing'] });
    assert.equal((await as(admin).get(`/record-attachments/${up.body.id}/text`)).status, 403);
    assert.deepEqual((await as(admin).get(`/companies/${co.id}/library?q=storage`)).body.items, [], 'a hit on a hidden file is never listed');
  });
}

test('a generated document is searchable and readable with its fields', async () => {
  const { store, co, mk, as } = setup('legacy');
  const admin = mk('Admin');
  const template = store.createInvoiceTemplate({
    companyId: co.id, name: 'MoU', docType: 'custom', layout: 'classic', isDefault: false, primaryColor: '#000', accentColor: '#000',
    watermarkEnabled: false, showCompanyAddress: true, showTaxId: true,
    doc: { version: 1, page: { size: 'A4', orientation: 'portrait', margin: {} }, theme: {}, body: [{ id: 'a', type: 'text', content: 'Purpose: {{field.purpose}}' }] },
  });
  const made = await as(admin).post(`/companies/${co.id}/documents`, { templateId: template.id, title: 'MoU with the café', fieldValues: { 'field.purpose': 'seasonal coffee campaign' } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const read = await as(admin).get(`/documents/${made.body.id}/text`);
  assert.equal(read.status, 200, JSON.stringify(read.body));
  assert.ok(read.body.text.includes('Purpose: seasonal coffee campaign'), read.body.text);
  const found = await as(admin).get(`/companies/${co.id}/library?q=coffee`);
  assert.deepEqual(found.body.items.map((i) => [i.kind, i.name]), [['document', 'MoU with the café']]);
  // An edit shows at once in what is read, without waiting for the background queue.
  await new Promise((r) => setTimeout(r, 5));
  const edited = await as(admin).put(`/documents/${made.body.id}`, { fieldValues: { 'field.purpose': 'winter tea campaign' } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.ok((await as(admin).get(`/documents/${made.body.id}/text`)).body.text.includes('winter tea campaign'));
});
