import type { DataStore } from '../data/store';
import type { DocumentRecord } from '../types';
import { documentText, extractFileText, type Extracted } from './text-extract';
import type { SourceKind, StoredText, TextHit } from './text-store';

export type { SourceKind, StoredText, TextHit } from './text-store';

/**
 * Reads the text of every attachment and generated document (spec
 * 2026-11-06-documents-hub-design, stage 4): in the background after an upload
 * or a document save, and once at start-up for what was stored before. Who may
 * see a file is never decided here: callers filter hits through the library's
 * per-record rule.
 */
export class DocumentTextIndex {
  private queue: Promise<void> = Promise.resolve();
  private pending = new Set<string>();

  constructor(
    private readonly store: DataStore,
    /** Field values of a generated document, as its print view fills them. */
    private readonly documentTokens: (doc: DocumentRecord) => Record<string, string>,
    private readonly logger: Pick<Console, 'warn'> = console,
  ) {}

  private get texts() { return this.store.documentTexts; }

  get(kind: SourceKind, id: string): StoredText | undefined { return this.texts.get(kind, id); }

  remove(kind: SourceKind, id: string): void { this.texts.remove(kind, id); }

  /** Read one attachment's text now. */
  async indexAttachment(id: string): Promise<StoredText | undefined> {
    const meta = this.store.getRecordAttachmentById(id);
    if (!meta) { this.remove('attachment', id); return undefined; }
    const file = this.store.getRecordAttachmentContent(id);
    const result: Extracted = file
      ? await extractFileText({ fileName: meta.fileName, mimeType: meta.mimeType, content: file.content })
      : { status: 'unsupported', text: '', note: 'Only a link is stored for this attachment.' };
    // The file may have gone while it was being read.
    if (!this.store.getRecordAttachmentById(id)) { this.remove('attachment', id); return undefined; }
    this.texts.save('attachment', id, meta.companyId, result);
    return this.get('attachment', id);
  }

  /** Read one generated document's text now. */
  indexDocument(id: string): StoredText | undefined {
    const doc = this.store.getDocumentById(id);
    if (!doc) { this.remove('document', id); return undefined; }
    this.texts.save('document', id, doc.companyId, documentText(doc, this.documentTokens(doc)));
    return this.get('document', id);
  }

  /** Read in the background, one at a time; a source already waiting is not queued twice. */
  enqueue(kind: SourceKind, id: string): Promise<void> {
    const key = `${kind}:${id}`;
    if (this.pending.has(key)) return this.queue;
    this.pending.add(key);
    this.queue = this.queue.then(async () => {
      this.pending.delete(key);
      try {
        if (kind === 'attachment') await this.indexAttachment(id);
        else this.indexDocument(id);
      } catch (error) {
        this.logger.warn(`[documents] could not read ${key}: ${error instanceof Error ? error.message : error}`);
      }
    });
    return this.queue;
  }

  /** Everything not read yet (files stored before this existed, a restart mid-queue). */
  backfill(): Promise<void> {
    const { attachments, documents } = this.texts.unread();
    for (const id of attachments) void this.enqueue('attachment', id);
    for (const id of documents) void this.enqueue('document', id);
    return this.queue;
  }

  /** Resolves once everything queued so far is read (tests). */
  idle(): Promise<void> { return this.queue; }

  /** Sources of one company whose text has every word of the query, best first. */
  search(companyId: string, query: string, limit = 200): TextHit[] {
    try {
      return this.texts.search(companyId, query, limit);
    } catch (error) {
      this.logger.warn(`[documents] search failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }
}
