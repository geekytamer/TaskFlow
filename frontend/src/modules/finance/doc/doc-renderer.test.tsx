import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('preview pagination honors manual breaks and flows overflowing blocks to another sheet', async () => {
  const { paginatePreviewBlocks } = await import('./doc-renderer');
  const blocks = [
    { id: 'first', type: 'text', content: 'First' },
    { id: 'break', type: 'pageBreak' },
    { id: 'second', type: 'text', content: 'Second' },
    { id: 'third', type: 'text', content: 'Third' },
  ] as never;

  const pages = paginatePreviewBlocks(blocks, [600, 0, 600, 600], 1000);

  assert.deepEqual(
    pages.map((page) => page.map((block) => block.id)),
    [['first'], ['second'], ['third']],
  );
});

test('preview pagination splits an oversized line-items table across physical sheets', async () => {
  const { paginatePreviewContent } = await import('./doc-renderer');
  const table = { id: 'items', type: 'lineItems' } as never;

  const pages = paginatePreviewContent(
    [table],
    [{ height: 1600, rowHeights: [300, 300, 300, 300, 300] }],
    1000,
  );

  assert.deepEqual(
    pages.map((page) => page.map((entry) => ({
      id: entry.block.id,
      start: entry.lineItemStart,
      end: entry.lineItemEnd,
    }))),
    [
      [{ id: 'items', start: 0, end: 3 }],
      [{ id: 'items', start: 3, end: 5 }],
    ],
  );
});

test('letterhead renders as a fixed layer repeated by Chromium on every printed page', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const html = renderToStaticMarkup(
    <DocRenderer
      doc={{
        version: 1,
        page: {
          size: 'A4',
          orientation: 'portrait',
          margin: { top: 30, right: 20, bottom: 25, left: 20 },
        },
        theme: {
          fontFamily: 'Arial',
          primaryColor: '#111827',
          accentColor: '#2563eb',
          textColor: '#0f172a',
        },
        body: [
          { id: 'first', type: 'text', content: 'First page' },
          { id: 'break', type: 'pageBreak' },
          { id: 'second', type: 'text', content: 'Second page' },
        ],
      }}
      invoice={{
        id: 'invoice-1',
        invoiceNumber: 'INV-1',
        issueDate: new Date('2026-07-27T00:00:00.000Z'),
        dueDate: new Date('2026-08-27T00:00:00.000Z'),
        lineItems: [],
      } as never}
      template={{
        id: 'template-1',
        companyId: 'company-1',
        name: 'Multi-page letterhead',
        layout: 'letterhead',
        primaryColor: '#111827',
        accentColor: '#2563eb',
        letterheadImageUrl: 'data:image/png;base64,letterhead',
      } as never}
    />,
  );

  assert.equal((html.match(/data-doc-preview-page="/g) ?? []).length, 2);
  assert.match(
    html,
    /data-doc-preview-page="1"[^]*First page[^]*data-doc-preview-page="2"[^]*Second page/,
  );
  assert.doesNotMatch(
    html,
    /data-doc-preview-page="1"[^]*Second page[^]*data-doc-preview-page="2"/,
  );
  assert.match(html, /data-letterhead-background="true"/);
  assert.match(html, /\.doc-letterhead-background\s*\{[^}]*position:\s*fixed/);
  assert.match(html, /@page\s*\{[^}]*margin:\s*0/);
  assert.match(html, /\.doc-letterhead-background\s*\{[^}]*top:\s*0/);
  assert.match(html, /\.doc-letterhead-background\s*\{[^}]*left:\s*0/);
  assert.match(html, /\.doc-letterhead-background\s*\{[^}]*width:\s*100%/);
  assert.match(html, /\.doc-letterhead-background\s*\{[^}]*height:\s*100%/);
  assert.match(html, /\.doc-render-content\s*\{[^}]*position:\s*relative[^}]*z-index:\s*1/);
  assert.match(html, /\.doc-render-content\s*\{[^}]*padding:\s*30mm 20mm 25mm 20mm/);
  assert.match(html, /\.doc-render-content\s*\{[^}]*box-decoration-break:\s*clone/);
  assert.match(html, /\.doc-print-flow\s*\{[^}]*background:\s*#fff\s*!important/);
  assert.match(html, /html,\s*body\s*\{[^}]*background:\s*#fff\s*!important/);
  assert.match(
    html,
    /\[data-invoice-rendered=true\][^}]*background:\s*#fff\s*!important/,
  );
  assert.doesNotMatch(html, /data-invoice-rendered=&quot;true&quot;/);
  assert.doesNotMatch(html, /background-repeat:\s*repeat-y/);
  assert.doesNotMatch(html, /calc\(100% \+/);
});

test('a document written like in Word prints its own text, fields filled in, never as HTML', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const body = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [{ type: 'text', text: 'My own MoU' }] },
      { type: 'paragraph', content: [
        { type: 'text', text: 'Between us and ' },
        { type: 'token', attrs: { token: 'client.name' } },
        { type: 'text', text: ' for ', marks: [{ type: 'bold' }] },
        { type: 'token', attrs: { token: 'field.fee' } },
        { type: 'text', text: '<img src=x onerror=alert(1)>' },
      ] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First duty' }] }] }] },
      { type: 'weirdNode', content: [{ type: 'text', text: 'dropped' }] },
    ],
  };
  const html = renderToStaticMarkup(
    <DocRenderer
      doc={{
        version: 1,
        page: { size: 'A4', orientation: 'portrait', margin: { top: 20, right: 20, bottom: 20, left: 20 } },
        theme: { fontFamily: 'Arial', primaryColor: '#111827', accentColor: '#2563eb', textColor: '#111827' },
        body: [
          { id: 'logo', type: 'image', binding: 'logo' },
          { id: 't', type: 'heading', level: 1, content: 'Template title' },
          { id: 'p', type: 'text', content: 'Template wording' },
          { id: 'sign', type: 'text', content: 'Signature line' },
        ] as never,
      }}
      invoice={{ id: 'd1', invoiceNumber: 'D1', companyId: 'c1', clientId: 'cl', issueDate: new Date(), dueDate: new Date(), lineItems: [], total: 0, status: 'Draft', notes: '', currency: '', taxRate: 0 } as never}
      client={{ id: 'cl', name: 'Sea Pearl' } as never}
      publicUrl=""
      fields={{ 'field.fee': '1,200 OMR', 'document.body': JSON.stringify(body) }}
    />,
  );
  assert.match(html, /My own MoU/);
  assert.match(html, /Between us and Sea Pearl<strong> for <\/strong>1,200 OMR/);
  assert.match(html, /<ol[^>]*>.*First duty/);
  assert.doesNotMatch(html, /Template wording|Template title|Signature line/, 'the whole run of wording is replaced');
  assert.doesNotMatch(html, /<img src=x/, 'text that looks like HTML stays text');
  assert.match(html, /&lt;img src=x/);
  assert.doesNotMatch(html, /dropped/, 'unknown nodes are not drawn');
});

const discountDoc = (direction: 'ltr' | 'rtl') => ({
  version: 1,
  direction,
  page: { size: 'A4', orientation: 'portrait', margin: { top: 10, right: 10, bottom: 10, left: 10 } },
  theme: { fontFamily: 'Arial', primaryColor: '#111827', accentColor: '#2563eb', textColor: '#111827' },
  body: [
    { id: 'items', type: 'lineItems' },
    { id: 'totals', type: 'totals' },
  ],
});

const discountInvoice = (lineItems: unknown[]) => ({
  id: 'invoice-d',
  invoiceNumber: 'Q-1',
  issueDate: new Date('2026-11-09T00:00:00.000Z'),
  dueDate: new Date('2026-12-09T00:00:00.000Z'),
  currency: 'OMR',
  taxRate: 5,
  lineItems,
});

test('a discounted document shows the total before discount, the discount, and the total after it', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const html = renderToStaticMarkup(
    <DocRenderer
      doc={discountDoc('ltr') as never}
      invoice={discountInvoice([
        // 2 × 100 at 10% off = 180; 1 × 50 with 5 off = 45; 1 × 20 no discount.
        { itemType: 'Manual', description: 'Reel', quantity: 2, unitPrice: 100, discount: 10, discountType: 'percent', amount: 180 },
        { itemType: 'Manual', description: 'Story', quantity: 1, unitPrice: 50, discount: 5, discountType: 'amount', amount: 45 },
        { itemType: 'Manual', description: 'Post', quantity: 1, unitPrice: 20, amount: 20 },
      ]) as never}
    />,
  );
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Total before discount[^A-Za-z]*270/);
  assert.match(text, /Discount[^A-Za-z]*-[^0-9]*25/);
  assert.match(text, /Total after discount[^A-Za-z]*245/);
  // Each discounted line says what came off it.
  assert.match(text, /Discount 10%/);
  assert.doesNotMatch(text, /Subtotal/);
});

test('a document without discounts keeps the plain subtotal', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const html = renderToStaticMarkup(
    <DocRenderer
      doc={discountDoc('rtl') as never}
      invoice={discountInvoice([
        { itemType: 'Manual', description: 'Post', quantity: 3, unitPrice: 20, amount: 60 },
      ]) as never}
    />,
  );
  assert.match(html, /المجموع الفرعي/);
  assert.doesNotMatch(html, /الخصم/);
});

// Shaped like Peak's own designed quote: labels typed in English as plain text.
const peakQuoteDoc = {
  version: 1,
  page: { size: 'A4', orientation: 'portrait', margin: { top: 10, right: 10, bottom: 10, left: 10 } },
  theme: { fontFamily: 'Arial', primaryColor: '#111827', accentColor: '#2563eb', textColor: '#111827' },
  body: [
    { id: 'h', type: 'heading', level: 1, content: 'QUOTATION' },
    { id: 'bill', type: 'details', title: 'Bill To', fields: [{ label: '', value: '{{client.name}}' }] },
    { id: 'dates', type: 'details', title: '', fields: [
      { label: 'Issue date', value: '{{invoice.issueDate}}' },
      { label: 'Due date', value: '{{invoice.dueDate}}' },
    ] },
    { id: 'items', type: 'lineItems' },
    { id: 'n', type: 'text', content: 'Notes' },
    { id: 'mine', type: 'text', content: 'INCLUDES INSTALLMENTS VIA PEAK FLEXI' },
  ],
};
const peakQuote = discountInvoice([{ itemType: 'Manual', description: 'Reel', quantity: 1, unitPrice: 100, amount: 100 }]);

test("a quote design's typed labels read as a quote, in the quote's language", async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const english = renderToStaticMarkup(
    <DocRenderer doc={peakQuoteDoc as never} invoice={peakQuote as never} template={{ id: 't', docType: 'quote' } as never} direction="ltr" />,
  );
  assert.match(english, /Prepared for/);
  assert.match(english, /Valid until/);
  assert.doesNotMatch(english, /Bill To|Due date/);
  assert.match(english, /QUOTATION/);
  // What the company wrote itself stays exactly as written.
  assert.match(english, /INCLUDES INSTALLMENTS VIA PEAK FLEXI/);

  const arabic = renderToStaticMarkup(
    <DocRenderer doc={peakQuoteDoc as never} invoice={peakQuote as never} template={{ id: 't', docType: 'quote' } as never} direction="rtl" />,
  );
  assert.match(arabic, /عرض سعر/);
  assert.match(arabic, /مُعدّ لـ/);
  assert.match(arabic, /صالح حتى/);
  assert.match(arabic, /ملاحظات/);
  assert.match(arabic, /الوصف/);
  assert.doesNotMatch(arabic, /Bill To|Due date|QUOTATION|Prepared for/);
  assert.match(arabic, /INCLUDES INSTALLMENTS VIA PEAK FLEXI/);
});

test('an invoice design keeps invoice wording, and the designer shows labels as typed', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const invoice = renderToStaticMarkup(
    <DocRenderer doc={peakQuoteDoc as never} invoice={peakQuote as never} template={{ id: 't', docType: 'invoice' } as never} direction="ltr" />,
  );
  assert.match(invoice, /Bill To/);
  assert.match(invoice, /Due date/);
  const designer = renderToStaticMarkup(
    <DocRenderer doc={peakQuoteDoc as never} invoice={peakQuote as never} template={{ id: 't', docType: 'quote' } as never} direction="rtl" rawLabels />,
  );
  assert.match(designer, /Bill To/);
});

test('a document a little over one page is shrunk to fit; a long one is not', async () => {
  const { fitToOnePage } = await import('./doc-renderer');
  assert.equal(fitToOnePage([400, 400], 899), 1);
  // QT-0004 on Peak's letterhead: 1,065px of content for an 899px page.
  const scale = fitToOnePage([89, 91, 363, 185, 80, 114, 143], 899);
  assert.ok(scale < 1 && scale >= 0.8, String(scale));
  assert.ok([89, 91, 363, 185, 80, 114, 143].reduce((a, b) => a + b, 0) * scale <= 899);
  // Twice a page stays full size and flows onto a second page.
  assert.equal(fitToOnePage([900, 900], 899), 1);
});

test('a quote prints no payment block, and starter sentences and status read in its language', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const doc = {
    ...peakQuoteDoc,
    direction: 'rtl',
    body: [
      { id: 'st', type: 'text', content: '{{invoice.status}}' },
      { id: 'pay', type: 'payment' },
      { id: 'terms', type: 'text', content: 'All amounts are shown in the invoice currency.' },
    ],
  };
  const template = { id: 't', docType: 'quote', paymentInstructions: 'Payment due on receipt unless otherwise agreed.' };
  const html = renderToStaticMarkup(
    <DocRenderer doc={doc as never} invoice={{ ...peakQuote, status: 'Draft' } as never} template={template as never} />,
  );
  assert.match(html, /مسودة/);
  assert.match(html, /جميع المبالغ معروضة بعملة الفاتورة/);
  assert.doesNotMatch(html, /Payment due on receipt|الدفع عند الاستلام|All amounts/);

  // An invoice keeps its payment block, its sentence translated.
  const invoiceHtml = renderToStaticMarkup(
    <DocRenderer doc={doc as never} invoice={{ ...peakQuote, status: 'Draft' } as never} template={{ ...template, docType: 'invoice' } as never} />,
  );
  assert.match(invoiceHtml, /يُستحق الدفع عند الاستلام ما لم يُتفق على غير ذلك/);
});

test('a line picked from a service prints in the document language; a typed line as written', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const doc = { ...peakQuoteDoc, body: [
    { id: 'c', type: 'text', content: '{{client.name}}' },
    { id: 'items', type: 'lineItems' },
  ] };
  const invoice = discountInvoice([
    { itemType: 'Manual', description: 'تهيئة فردية', descriptionAr: 'تهيئة فردية', descriptionEn: 'Solo onboarding', quantity: 1, unitPrice: 500, amount: 500 },
    { itemType: 'Manual', description: 'insta oman', quantity: 1, unitPrice: 250, amount: 250 },
  ]);
  const client = { id: 'c1', name: 'مطعم ليلاس', nameAr: 'مطعم ليلاس', nameEn: 'Lilas Restaurant' };
  const english = renderToStaticMarkup(<DocRenderer doc={doc as never} invoice={invoice as never} client={client as never} direction="ltr" />);
  assert.match(english, /Solo onboarding/);
  assert.doesNotMatch(english, /تهيئة فردية/);
  assert.match(english, /Lilas Restaurant/);
  assert.match(english, /insta oman/);
  const arabic = renderToStaticMarkup(<DocRenderer doc={doc as never} invoice={invoice as never} client={client as never} direction="rtl" />);
  assert.match(arabic, /تهيئة فردية/);
  assert.match(arabic, /مطعم ليلاس/);
  assert.doesNotMatch(arabic, /Solo onboarding|Lilas Restaurant/);
});

test('a quote with sections and optional lines totals only counted lines and prints quote data and slots', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const doc = {
    version: 1, direction: 'ltr', page: { size: 'A4', orientation: 'portrait', margin: {} },
    theme: { fontFamily: 'Inter', primaryColor: '#111111', accentColor: '#222222', textColor: '#333333' },
    body: [
      { id: 'd', type: 'details', fields: [{ label: 'Contact', value: '{{contact.name}}' }] },
      { id: 'l', type: 'lineItems', columns: [
        { id: 'n', key: 'index', label: '#', visible: true }, { id: 'ds', key: 'description', label: 'Description', visible: true },
        { id: 'u', key: 'unit', label: 'Unit', visible: true }, { id: 'a', key: 'amount', label: 'Amount', visible: true },
      ] },
      { id: 't', type: 'totals' },
      { id: 's', type: 'slot', slot: 'terms', title: 'Terms', fallback: 'Template terms' },
      { id: 'i', type: 'slot', slot: 'intro', fallback: 'Template intro' },
      { id: 'ar', type: 'text', content: 'ARABIC ONLY', visibleWhen: 'lang:ar' },
    ],
  } as never;
  const invoice = {
    id: 'q1', invoiceNumber: 'QT-1', issueDate: new Date(), dueDate: new Date(), status: 'Draft', currency: 'USD', taxRate: 0, total: 10,
    lineItems: [
      { itemType: 'Manual', lineType: 'section', description: 'Package A', quantity: 0, unitPrice: 0, amount: 0 },
      { itemType: 'Manual', description: 'Workshop', details: 'Half day', unit: 'day', quantity: 1, unitPrice: 10, amount: 10 },
      { itemType: 'Manual', description: 'Extra', quantity: 1, unitPrice: 99, amount: 99, optional: true },
    ],
  } as never;
  const html = renderToStaticMarkup(
    <DocRenderer doc={doc} invoice={invoice} publicUrl="" extras={{ 'contact.name': { type: 'text', value: 'Sara' } }} content={{ terms: 'Our own terms' }} />,
  );
  assert.ok(html.includes('Package A'));
  assert.ok(html.includes('Half day'));
  assert.ok(html.includes('day'));
  assert.ok(html.includes('Sara'));
  assert.ok(html.includes('Our own terms') && !html.includes('Template terms'), 'document text wins over the fallback');
  assert.ok(html.includes('Template intro'), 'fallback used when the document has none');
  assert.ok(html.includes('Optional'));
  assert.ok(!html.includes('ARABIC ONLY'));
  assert.ok(!html.includes('109'), 'the optional 99 is not in the total');
  assert.ok(html.includes('Optional extras'), 'optional extras row shows with the total');
  const hidden = renderToStaticMarkup(<DocRenderer doc={{ ...(doc as object), body: (doc as any).body.map((b: any) => (b.type === 'totals' ? { ...b, showTotal: false } : b)) } as never} invoice={invoice} publicUrl="" />);
  assert.ok(!hidden.includes('Optional extras'), 'optional extras row follows showTotal=false');
});

test('a slot prints the template fallback in the document language but never translates the quote content', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const mk = (direction: string) => ({
    version: 1, direction, page: { size: 'A4', orientation: 'portrait', margin: {} },
    theme: { fontFamily: 'Inter', primaryColor: '#111111', accentColor: '#222222', textColor: '#333333' },
    body: [
      { id: 'i', type: 'slot', slot: 'intro', fallback: 'Thank you for the opportunity. Please find our offer below.' },
      { id: 's', type: 'slot', slot: 'terms', fallback: 'Prices are valid until the date above.' },
    ],
  }) as never;
  const invoice = { id: 'q1', invoiceNumber: 'QT-1', issueDate: new Date(), dueDate: new Date(), status: 'Draft', currency: 'USD', taxRate: 0, total: 0, lineItems: [] } as never;
  const ar = renderToStaticMarkup(<DocRenderer doc={mk('rtl')} invoice={invoice} direction="rtl" publicUrl="" content={{ terms: 'Prices are valid until the date above.' }} />);
  assert.ok(ar.includes('شكرًا لإتاحة الفرصة. تجدون عرضنا أدناه.'), 'template fallback translated');
  assert.ok(!ar.includes('Thank you for the opportunity'));
  assert.ok(ar.includes('Prices are valid until the date above.'), 'quote content stays as written');
  assert.ok(!ar.includes('الأسعار سارية'));
  const en = renderToStaticMarkup(<DocRenderer doc={mk('ltr')} invoice={invoice} publicUrl="" />);
  assert.ok(en.includes('Thank you for the opportunity. Please find our offer below.'));
});

const detailsDoc = (block: object) => ({
  version: 1, direction: 'ltr', page: { size: 'A4', orientation: 'portrait', margin: {} },
  theme: { fontFamily: 'Inter', primaryColor: '#111111', accentColor: '#222222', textColor: '#333333' },
  body: [{ id: 'd', type: 'details', ...block }],
}) as never;
const detailsInvoice = { id: 'q', invoiceNumber: 'N1', issueDate: new Date(), dueDate: new Date(), status: 'Draft', currency: 'USD', taxRate: 0, total: 0, lineItems: [] } as never;
const INLINE_FRAGMENT = '<div><div><div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#94a3b8">Info</div><div style="margin-top:8px;font-size:14px"><div style="margin-top:0"><span style="color:#64748b">Contact: </span><span style="font-weight:500"></span></div><div style="margin-top:2px"><span style="font-weight:600">plain</span></div></div></div></div>';

test('a details block without layout, or inline, prints exactly the old markup', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const fields = [{ label: 'Contact', value: '{{company.name}}' }, { label: '', value: 'plain' }];
  for (const extra of [{}, { layout: 'inline' }]) {
    const html = renderToStaticMarkup(<DocRenderer doc={detailsDoc({ title: 'Info', fields, ...extra })} invoice={detailsInvoice} publicUrl="" />);
    assert.ok(html.includes(INLINE_FRAGMENT), 'inline markup unchanged');
  }
});

test('a details block in rows layout puts label and value on opposite sides with lines between rows', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const fields = [{ label: 'Reference', value: '{{doc.number}}' }, { label: 'Validity', value: '{{fields.validity}}' }, { label: 'Blank', value: '{{field.nothing}}' }];
  const html = renderToStaticMarkup(<DocRenderer doc={detailsDoc({ title: 'Info', layout: 'rows', fields })} invoice={detailsInvoice} publicUrl="" />);
  const first = html.slice(0, html.indexOf('doc-print-flow relative') > 0 ? html.indexOf('data-doc-measure-block') : html.length);
  assert.ok(first.includes('Reference') && first.includes('N1') && first.includes('Validity') && first.includes('Blank'), 'blank rows still show');
  assert.equal((first.match(/justify-content:space-between/g) || []).length, 3);
  assert.equal((first.match(/border-bottom:1px solid #e5e7eb/g) || []).length, 2, 'no line after the last row');
  assert.ok(first.includes('padding:0.45em 0'));
  assert.ok(first.includes('color:#64748b'));
  assert.ok(!/margin-left|margin-right|padding-left|padding-right|text-align:(left|right)/.test(first.replace(/<style>[\s\S]*?<\/style>/, '')));
  assert.ok(first.includes('>Info<'), 'title above');
});

test('money in line1 tokens prints with the document currency while old tokens stay as before', async () => {
  const { DocRenderer } = await import('./doc-renderer');
  const invoice = { ...(detailsInvoice as object), currency: 'OMR', lineItems: [{ itemType: 'Manual', description: 'Dates', quantity: 2, unitPrice: 10, amount: 20 }] } as never;
  const html = renderToStaticMarkup(<DocRenderer doc={detailsDoc({ fields: [{ label: 'Price', value: '{{line1.unitPrice}}' }, { label: 'Total', value: '{{doc.total}}' }] })} invoice={invoice} publicUrl="" />);
  assert.match(html, /OMR/);
  assert.ok(html.includes('<span style="font-weight:500">20</span>'), 'doc.total still raw');
});
