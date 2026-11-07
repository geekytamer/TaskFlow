import assert from 'node:assert/strict';
import test from 'node:test';

// Writing a document like in Word (spec 2026-11-07-document-writer-design).

const tokensOf = (node: any, out: string[] = []): string[] => {
  if (node.type === 'token') out.push(node.attrs.token);
  (node.content ?? []).forEach((child: any) => tokensOf(child, out));
  return out;
};

test('the wording of an MoU becomes the body; logo and signatures stay around it', async () => {
  const { buildStarter } = await import('./starter-templates');
  const { writableRange, blocksToBody, withWrittenBody, blocksAroundWording } = await import('./written-body');
  const { doc } = buildStarter('mou', 'ar');
  const range = writableRange(doc.body)!;
  assert.ok(range, 'an MoU has wording to write over');
  assert.equal(doc.body[range.start - 1].type, 'image', 'the logo is before the wording');
  assert.equal(doc.body[range.end].type, 'container', 'the signatures are after it');
  const body = blocksToBody(doc.body.slice(range.start, range.end), 'بند إضافي عن {{client.name}}');
  const types = body.content!.map((n) => n.type);
  assert.equal(types[0], 'heading', 'the title');
  assert.equal(body.content![0].attrs!.textAlign, 'center');
  assert.ok(types.includes('paragraph'));
  const tokens = tokensOf(body);
  for (const t of ['field.purpose', 'field.term', 'client.name', 'company.name', 'document.date']) assert.ok(tokens.includes(t), t);
  assert.ok(!tokens.includes('document.notes'), 'the notes are written in, not left as a field');
  assert.ok(JSON.stringify(body).includes('بند إضافي عن '), 'the notes text is in the body');

  const printed = withWrittenBody(doc, JSON.stringify(body));
  assert.equal(printed.body[0].type, 'image', 'logo kept');
  assert.equal(printed.body.at(-1)!.type, 'container', 'signatures kept');
  const written = printed.body.filter((b) => b.type === 'richText');
  assert.equal(written.length, body.content!.length, 'one block per paragraph, so pages break between them');
  assert.ok(!printed.body.some((b) => b.type === 'text' || b.type === 'heading'), 'the template wording is gone');
  assert.deepEqual(blocksAroundWording(doc).map((b) => b.type), ['image', 'container']);
});

test('line breaks, paragraphs and empty text come out the way the editor needs them', async () => {
  const { blocksToBody } = await import('./written-body');
  const body = blocksToBody([
    { id: 'a', type: 'text', content: 'Line one\nLine {{field.two}}\n\nNext paragraph' },
    { id: 'b', type: 'text', content: '' },
    { id: 'c', type: 'heading', level: 3, content: 'Clause' },
  ] as any);
  const [p1, p2, empty, h] = body.content!;
  assert.deepEqual(p1.content!.map((n) => n.type), ['text', 'hardBreak', 'text', 'token']);
  assert.equal(p2.content![0].text, 'Next paragraph');
  assert.equal(empty.content, undefined, 'an empty paragraph has no empty text node');
  assert.equal(h.attrs!.level, 3);
  assert.deepEqual(blocksToBody([]).content, [{ type: 'paragraph' }]);
});

test('a missing or broken body prints the template as it is', async () => {
  const { withWrittenBody, parseBody } = await import('./written-body');
  const { buildStarter } = await import('./starter-templates');
  const { doc } = buildStarter('blank', 'en');
  assert.equal(withWrittenBody(doc, undefined), doc);
  assert.equal(withWrittenBody(doc, '{not json'), doc);
  assert.equal(withWrittenBody(doc, JSON.stringify({ type: 'paragraph' })), doc);
  assert.equal(parseBody('"<script>"'), null);
});

test('the longest run of wording is the one written over', async () => {
  const { writableRange } = await import('./written-body');
  const b = (type: string) => ({ id: type + Math.random(), type, content: '', level: 1 }) as any;
  assert.deepEqual(writableRange([b('text'), b('image'), b('heading'), b('text'), b('text'), b('lineItems'), b('text')]), { start: 2, end: 5 });
  assert.equal(writableRange([b('image'), b('lineItems')]), null);
});

test('fields in a body keep the name they were given; new field keys never clash', async () => {
  const { bodyFields, newFieldToken, bodyText } = await import('./written-body');
  const body = { type: 'doc', content: [
    { type: 'paragraph', content: [
      { type: 'text', text: 'Fee ' },
      { type: 'token', attrs: { token: 'field.f_1', label: 'مدة العقد' } },
      { type: 'token', attrs: { token: 'client.name' } },
      { type: 'hardBreak' },
      { type: 'token', attrs: { token: 'field.fee' } },
    ] },
    { type: 'table', content: [{ type: 'tableRow', content: [
      { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
      { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
    ] }] },
  ] };
  assert.deepEqual(bodyFields(body), [{ token: 'field.f_1', label: 'مدة العقد' }, { token: 'field.fee' }]);
  assert.equal(newFieldToken('Contract length', []), 'field.contract_length');
  assert.equal(newFieldToken('Contract length', ['field.contract_length']), 'field.contract_length_1');
  assert.equal(newFieldToken('مدة العقد', ['field.f_1']), 'field.f_2');
  const text = bodyText(body, (t) => (t === 'client.name' ? 'Sea Pearl' : `[${t}]`));
  assert.match(text, /Fee \[field\.f_1\]Sea Pearl\n\[field\.fee\]/);
  assert.match(text, /A\tB/);
});
