/**
 * Writing a document like in Word (spec 2026-11-07-document-writer-design).
 *
 * A template's wording — its run of top-level headings and paragraphs — becomes
 * one editable body per document. The body is stored as editor JSON (never
 * HTML) in the document's field values under `document.body`; fields inside it
 * are `token` nodes that still fill in from the client, company and boxes.
 * Printing swaps that run of blocks for the written body, one block per
 * paragraph so pages still break between paragraphs. Logo, signatures, tables of
 * line items and everything else around the wording stay as the template made them.
 */
import type { Block, InvoiceDoc, RichNode } from '@/modules/finance/doc/types';

export const BODY_KEY = 'document.body';
const NOTES_KEY = 'document.notes';

/** Blocks that are plain wording and can be written over. */
const isWording = (block: Block) => block.type === 'heading' || block.type === 'text';

/**
 * The run of top-level wording blocks that becomes the written body: the
 * longest one (the first, when two are as long). Null when there is none.
 */
export function writableRange(body: Block[]): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  let start = -1;
  body.forEach((block, index) => {
    if (isWording(block)) {
      if (start < 0) start = index;
      const run = { start, end: index + 1 };
      if (!best || run.end - run.start > best.end - best.start) best = run;
    } else {
      start = -1;
    }
  });
  return best;
}

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

/** One line of template text as inline nodes: text, with fields as tokens. */
function inline(text: string): RichNode[] {
  const out: RichNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ type: 'text', text: text.slice(last, at) });
    out.push({ type: 'token', attrs: { token: match[1] } });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** Lines joined by line breaks (a single newline in template text). */
function lines(text: string): RichNode[] {
  const out: RichNode[] = [];
  text.split('\n').forEach((line, index) => {
    if (index > 0) out.push({ type: 'hardBreak' });
    out.push(...inline(line));
  });
  return out;
}

const alignOf = (block: Block) => {
  const align = block.style?.align;
  return align === 'center' || align === 'right' || align === 'left' ? align : null;
};

function paragraphs(text: string, textAlign: string | null): RichNode[] {
  return text.split(/\n{2,}/).map((part) => {
    const content = lines(part);
    return { type: 'paragraph', attrs: { textAlign }, ...(content.length ? { content } : {}) };
  });
}

/**
 * The template's wording as a body to write in. `notes` (what used to go in the
 * notes box) is written in where the template had {{document.notes}}.
 */
export function blocksToBody(blocks: Block[], notes = ''): RichNode {
  const content: RichNode[] = [];
  for (const block of blocks) {
    if (block.type === 'heading') {
      content.push({ type: 'heading', attrs: { level: block.level ?? 2, textAlign: alignOf(block) }, content: inline(block.content.replace(/\n+/g, ' ')) });
    } else if (block.type === 'text') {
      const text = block.content.replace(/\{\{\s*(document|invoice)\.notes\s*\}\}/g, notes);
      content.push(...paragraphs(text, alignOf(block)));
    }
  }
  // Empty text nodes are not allowed in the editor's model.
  const clean = (node: RichNode): RichNode => ({
    ...node,
    ...(node.content ? { content: node.content.filter((c) => c.type !== 'text' || c.text).map(clean) } : {}),
  });
  return { type: 'doc', content: content.length ? content.map(clean) : [{ type: 'paragraph' }] };
}

/** The stored body, or null when it is missing or not a body. */
export function parseBody(raw: string | undefined | null): RichNode | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as RichNode;
    return value && value.type === 'doc' && Array.isArray(value.content) ? value : null;
  } catch {
    return null;
  }
}

/** The design to print: the template with its wording swapped for the written body. */
export function withWrittenBody(doc: InvoiceDoc, raw: string | undefined | null): InvoiceDoc {
  const body = parseBody(raw);
  if (!body) return doc;
  const range = writableRange(doc.body);
  const written: Block[] = (body.content ?? []).map((node, index) => ({ id: `written-${index}`, type: 'richText', node }));
  if (!range) return { ...doc, body: [...doc.body, ...written] };
  return { ...doc, body: [...doc.body.slice(0, range.start), ...written, ...doc.body.slice(range.end)] };
}

/** The design blocks around the wording (what the written body does not replace). */
export function blocksAroundWording(doc: InvoiceDoc): Block[] {
  const range = writableRange(doc.body);
  return range ? [...doc.body.slice(0, range.start), ...doc.body.slice(range.end)] : doc.body;
}

/** Fields used in a body, in order, with the name each was given when added. */
export function bodyFields(body: RichNode | null): Array<{ token: string; label?: string }> {
  const seen = new Map<string, string | undefined>();
  const walk = (node: RichNode) => {
    if (node.type === 'token') {
      const token = String(node.attrs?.token ?? '');
      const label = typeof node.attrs?.label === 'string' && node.attrs.label ? node.attrs.label : undefined;
      if (token.startsWith('field.') && (!seen.has(token) || (!seen.get(token) && label))) seen.set(token, label);
    }
    node.content?.forEach(walk);
  };
  if (body) walk(body);
  return [...seen].map(([token, label]) => ({ token, ...(label ? { label } : {}) }));
}

/** Plain text of a body, fields shown by `fill` (for search and the assistant). */
export function bodyText(body: RichNode | null, fill: (token: string) => string): string {
  const out: string[] = [];
  const walk = (node: RichNode): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'token') return fill(String(node.attrs?.token ?? ''));
    if (node.type === 'hardBreak') return '\n';
    const inner = (node.content ?? []).map(walk).join(node.type === 'tableRow' ? '\t' : '');
    if (node.type === 'tableCell' || node.type === 'tableHeader') return inner.trim();
    return ['paragraph', 'heading', 'listItem', 'tableRow'].includes(node.type) ? `${inner}\n` : inner;
  };
  if (body) out.push(walk(body));
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}

/** A field key for a field named in any language ("مدة العقد" → field.f_2). */
export function newFieldToken(name: string, taken: string[]): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  const base = slug ? `field.${slug}` : 'field.f';
  if (slug && !taken.includes(base)) return base;
  let n = 1;
  while (taken.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export { NOTES_KEY };
