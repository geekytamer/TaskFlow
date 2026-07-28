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
