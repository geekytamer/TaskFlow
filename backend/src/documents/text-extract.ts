import zlib from 'zlib';

/**
 * Text out of a file, so documents can be searched and read (spec
 * 2026-11-06-documents-hub-design, stage 4). Plain text, Word/Excel/PowerPoint
 * (zip + XML, read here) and PDF (pdf.js through unpdf). Images would need OCR,
 * which is not installed: they are reported as unsupported, never guessed.
 */

export type ExtractStatus = 'ok' | 'empty' | 'unsupported' | 'failed';
export interface Extracted { status: ExtractStatus; text: string; note?: string }

/** What we keep per file; enough for any contract or proposal. */
export const MAX_TEXT_CHARS = 200_000;
const PDF_TIMEOUT_MS = 20_000;

const ext = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '');

const TEXT_EXTS = new Set(['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'html', 'htm', 'log', 'rtf']);
const OFFICE_EXTS = new Set(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff']);

const decodeEntities = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

/** Markup to text: block ends become line breaks, tags go, entities decode. */
export function markupToText(xml: string): string {
  return decodeEntities(xml
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(w:p|a:p|text:p|p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<(w:tab|w:br|br|text:tab)\b[^>]*\/?>/gi, (m) => (/tab/i.test(m) ? '\t' : '\n'))
    .replace(/<\/(c|t:c|td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The files of a zip (stored or deflated), by name. Enough for Office files; no zip64. */
export function readZip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Broken zip directory.');
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (buf.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compressed);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, zlib.inflateRawSync(data, { maxOutputLength: 50 * 1024 * 1024 }));
  }
  return files;
}

const byNumber = (a: string, b: string) => (Number(a.match(/(\d+)\.xml$/)?.[1] ?? 0) - Number(b.match(/(\d+)\.xml$/)?.[1] ?? 0));

function officeText(buf: Buffer, kind: string): string {
  const zip = readZip(buf);
  const read = (name: string) => zip.get(name)?.toString('utf8') ?? '';
  const parts: string[] = [];
  if (kind === 'docx') {
    const names = [...zip.keys()].filter((n) => /^word\/(header\d*|document|footnotes|footer\d*)\.xml$/.test(n));
    // Body first, then headers/footers/footnotes.
    names.sort((a, b) => Number(!a.endsWith('document.xml')) - Number(!b.endsWith('document.xml')));
    for (const n of names) parts.push(markupToText(read(n)));
  } else if (kind === 'xlsx') {
    const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => markupToText(m[1]));
    const sheets = [...zip.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort(byNumber);
    for (const n of sheets) {
      const rows = [...read(n).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) =>
        [...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(([, attrs, inner]) => {
          const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
          if (/t="s"/.test(attrs)) return shared[Number(v)] ?? '';
          if (/t="inlineStr"/.test(attrs)) return markupToText(inner);
          return decodeEntities(v);
        }).filter(Boolean).join('\t'));
      parts.push(rows.filter(Boolean).join('\n'));
    }
  } else if (kind === 'pptx') {
    const slides = [...zip.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNumber);
    for (const n of slides) parts.push(markupToText(read(n)));
  } else {
    parts.push(markupToText(read('content.xml')));
  }
  return parts.filter(Boolean).join('\n\n');
}

const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

/**
 * pdf.js returns a right-to-left line's words in visual order (reversed). A line
 * with Arabic and no Latin letters is put back in reading order; mixed lines are
 * left as they came, since their order can't be told apart reliably.
 */
export function fixRtlLines(text: string): string {
  return text.split('\n').map((line) => (ARABIC.test(line) && !LATIN.test(line) ? line.split(/\s+/).reverse().join(' ') : line)).join('\n');
}

let unpdf: Promise<{ extractText: Function; getDocumentProxy: Function }> | undefined;
/** unpdf is an ES module; Node 22+ loads it from CommonJS on first use. */
const loadUnpdf = () => (unpdf ??= Promise.resolve().then(() => require('unpdf')));

async function pdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await loadUnpdf();
  const work = (async () => {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return fixRtlLines(String(text ?? ''));
  })();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(new Error('PDF took too long to read.')), PDF_TIMEOUT_MS); });
  try { return await Promise.race([work, timeout]); } finally { clearTimeout(timer); }
}

const finish = (text: string): Extracted => {
  const clean = text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  if (!clean) return { status: 'empty', text: '' };
  return { status: 'ok', text: clean.slice(0, MAX_TEXT_CHARS) };
};

/** Text of an uploaded file. Never throws: a file we can't read says why. */
export async function extractFileText(file: { fileName: string; mimeType?: string; content: Buffer }): Promise<Extracted> {
  const type = (file.mimeType ?? '').toLowerCase();
  const e = ext(file.fileName);
  try {
    if (type === 'application/pdf' || e === 'pdf') return finish(await pdfText(file.content));
    if (OFFICE_EXTS.has(e) || type.includes('officedocument') || type.includes('opendocument')) {
      const kind = OFFICE_EXTS.has(e) ? e : type.includes('wordprocessing') ? 'docx' : type.includes('sheet') ? 'xlsx' : type.includes('presentation') ? 'pptx' : 'odt';
      return finish(officeText(file.content, kind));
    }
    if (type.startsWith('text/') || type === 'application/json' || type === 'application/xml' || TEXT_EXTS.has(e)) {
      const raw = file.content.toString('utf8');
      return finish(/html|xml/.test(type) || ['html', 'htm', 'xml'].includes(e) ? markupToText(raw) : raw);
    }
    if (type.startsWith('image/') || IMAGE_EXTS.has(e)) return { status: 'unsupported', text: '', note: 'Reading text in images (OCR) is not available yet.' };
    return { status: 'unsupported', text: '', note: 'This kind of file cannot be read as text.' };
  } catch (error) {
    return { status: 'failed', text: '', note: error instanceof Error ? error.message.slice(0, 200) : 'Could not read the file.' };
  }
}

// ── Documents written like in Word (spec 2026-11-07-document-writer-design) ──
// Mirrors frontend/src/modules/documents/written-body.ts.

interface WrittenNode { type: string; attrs?: Record<string, unknown>; content?: WrittenNode[]; text?: string }

function writtenBody(raw: string | undefined): WrittenNode | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as WrittenNode;
    return value && value.type === 'doc' && Array.isArray(value.content) ? value : null;
  } catch {
    return null;
  }
}

/** The longest run of top-level heading/text blocks: what the written body replaces. */
function wordingRange(blocks: Array<Record<string, unknown>>): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  let start = -1;
  blocks.forEach((block, index) => {
    if (block?.type === 'heading' || block?.type === 'text') {
      if (start < 0) start = index;
      if (!best || index + 1 - start > best.end - best.start) best = { start, end: index + 1 };
    } else {
      start = -1;
    }
  });
  return best;
}

function writtenText(body: WrittenNode, fill: (token: string) => string): string {
  const walk = (node: WrittenNode): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'token') return fill(String(node.attrs?.token ?? ''));
    if (node.type === 'hardBreak') return '\n';
    const inner = (node.content ?? []).map(walk).join(node.type === 'tableRow' ? '\t' : '');
    if (node.type === 'tableCell' || node.type === 'tableHeader') return inner.trim();
    return ['paragraph', 'heading', 'listItem', 'tableRow'].includes(node.type) ? `${inner}\n` : inner;
  };
  return walk(body).replace(/\n{3,}/g, '\n\n').trim();
}

/** Text of a document made in the app: its blocks with the fields filled in. */
export function documentText(doc: { title: string; docSnapshot?: unknown; templateSnapshot?: { doc?: unknown } }, tokens: Record<string, string>): Extracted {
  const out: string[] = [doc.title];
  const fill = (s: string) => s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const value = tokens[String(key)] ?? '';
    // Notes may themselves hold fields; one pass only.
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_n, inner) => (/notes$/.test(String(inner)) ? '' : tokens[String(inner)] ?? ''));
  });
  const walk = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks as Array<Record<string, unknown>>) {
      if (typeof b?.content === 'string') out.push(fill(b.content));
      if (typeof b?.title === 'string' && b.title) out.push(fill(b.title));
      if (Array.isArray(b?.fields)) for (const f of b.fields as Array<{ label?: string; value?: string }>) out.push([f.label, fill(String(f.value ?? ''))].filter(Boolean).join(': '));
      walk(b?.children);
    }
  };
  // Older templates freeze their design in docSnapshot; typed ones inside the template snapshot.
  const design = (doc.docSnapshot ?? doc.templateSnapshot?.doc) as { body?: unknown } | undefined;
  const written = writtenBody(tokens['document.body']);
  if (written && Array.isArray(design?.body)) {
    // Written like in Word: the page's own text replaces the template's run of wording.
    const blocks = design.body as Array<Record<string, unknown>>;
    const range = wordingRange(blocks);
    walk(range ? blocks.slice(0, range.start) : blocks);
    out.push(writtenText(written, (token) => fill(`{{${token}}}`)));
    if (range) walk(blocks.slice(range.end));
  } else if (written) {
    out.push(writtenText(written, (token) => fill(`{{${token}}}`)));
  } else {
    walk(design?.body);
  }
  // A document with no design yet still carries what was typed into it.
  if (out.length === 1) for (const [k, v] of Object.entries(tokens)) if (k.startsWith('field.') || k === 'document.notes') out.push(v);
  return finish(out.filter((s) => s && s.trim()).join('\n'));
}

// ── Search normalisation ─────────────────────────────────────────────────────

const HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const AR_PREFIXES = ['وبال', 'وال', 'بال', 'كال', 'فال', 'لل', 'ال'];

/** One word as it is indexed and searched: lower case, Arabic letter variants folded. */
export function normWord(word: string): string {
  return word.toLowerCase()
    .replace(HARAKAT, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // PDFs give the lam-alef ligature as alef-lam; fold both orders together.
    .replace(/لا/g, 'ال');
}

/** The forms of a word: itself, and for Arabic also without a leading article ("ال", "وال"...). */
export function wordForms(word: string): string[] {
  const base = word.toLowerCase().replace(HARAKAT, '').replace(/[أإآٱ]/g, 'ا');
  const forms = new Set([normWord(word)]);
  for (const p of AR_PREFIXES) {
    if (base.startsWith(p) && base.length - p.length >= 2) { forms.add(normWord(base.slice(p.length))); break; }
  }
  return [...forms].filter(Boolean);
}

const WORD = /[\p{L}\p{N}]+/gu;

/** The body stored in the search index: every word in every form. */
export function indexBody(text: string): string {
  return (text.match(WORD) ?? []).flatMap(wordForms).join(' ');
}

/** An FTS5 query: every word must appear (in any of its forms, as a prefix). */
export function ftsQuery(query: string): string | null {
  const words = (query.match(WORD) ?? []).filter((w) => w.length > 1 || /\d/.test(w)).slice(0, 12);
  if (!words.length) return null;
  return words.map((w) => `(${wordForms(w).map((f) => `"${f.replace(/"/g, '')}"*`).join(' OR ')})`).join(' AND ');
}

/** A few words around the first place the query appears in the text. */
export function snippetOf(text: string, query: string, radius = 90): string {
  const words = (query.match(WORD) ?? []).flatMap(wordForms);
  // Search a folded copy, keeping where each folded letter came from.
  const map: number[] = [];
  let folded = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (HARAKAT.test(ch)) { HARAKAT.lastIndex = 0; continue; }
    HARAKAT.lastIndex = 0;
    folded += ch.toLowerCase().replace(/[أإآٱ]/, 'ا').replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي').slice(0, 1);
    map.push(i);
  }
  let at = -1;
  for (const w of words) {
    const variants = [w, w.replace(/ال/g, 'لا')];
    for (const v of variants) {
      const i = folded.indexOf(v);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
  }
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (at < 0) return flat(text.slice(0, radius * 2)) + (text.length > radius * 2 ? '…' : '');
  const start = Math.max(0, map[at] - radius);
  const end = Math.min(text.length, map[at] + radius);
  return `${start > 0 ? '…' : ''}${flat(text.slice(start, end))}${end < text.length ? '…' : ''}`;
}
