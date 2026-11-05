import type Database from 'better-sqlite3';
import { ftsQuery, indexBody, type Extracted, type ExtractStatus } from './text-extract';

/** Stored text of attachments and generated documents, and the word index (migration 167). */

export type SourceKind = 'attachment' | 'document';

export interface StoredText {
  sourceKind: SourceKind;
  sourceId: string;
  companyId: string;
  status: ExtractStatus;
  text: string;
  note?: string;
  extractedAt: string;
}

export interface TextHit { sourceKind: SourceKind; sourceId: string; rank: number }

export class DocumentTextStore {
  constructor(private readonly db: Database.Database) {}

  get(kind: SourceKind, id: string): StoredText | undefined {
    const row = this.db.prepare('SELECT * FROM document_texts WHERE sourceKind = ? AND sourceId = ?').get(kind, id) as any;
    return row ? { ...row, note: row.note ?? undefined } : undefined;
  }

  save(kind: SourceKind, id: string, companyId: string, result: Extracted): void {
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO document_texts (sourceKind, sourceId, companyId, status, text, note, extractedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sourceKind, sourceId) DO UPDATE SET companyId = excluded.companyId, status = excluded.status, text = excluded.text, note = excluded.note, extractedAt = excluded.extractedAt`)
        .run(kind, id, companyId, result.status, result.text, result.note ?? null, now);
      this.db.prepare('DELETE FROM document_search WHERE sourceKind = ? AND sourceId = ?').run(kind, id);
      if (result.text) {
        this.db.prepare('INSERT INTO document_search (body, sourceKind, sourceId, companyId) VALUES (?, ?, ?, ?)')
          .run(indexBody(result.text), kind, id, companyId);
      }
    })();
  }

  remove(kind: SourceKind, id: string): void {
    this.db.prepare('DELETE FROM document_texts WHERE sourceKind = ? AND sourceId = ?').run(kind, id);
    this.db.prepare('DELETE FROM document_search WHERE sourceKind = ? AND sourceId = ?').run(kind, id);
  }

  /** Attachments never read; documents never read or changed since. Rows of deleted sources are dropped. */
  unread(): { attachments: string[]; documents: string[] } {
    this.db.exec(`DELETE FROM document_texts WHERE (sourceKind = 'attachment' AND sourceId NOT IN (SELECT id FROM record_attachments))
      OR (sourceKind = 'document' AND sourceId NOT IN (SELECT id FROM documents));
      DELETE FROM document_search WHERE sourceId NOT IN (SELECT sourceId FROM document_texts);`);
    const attachments = (this.db.prepare(`SELECT a.id FROM record_attachments a
      LEFT JOIN document_texts t ON t.sourceKind = 'attachment' AND t.sourceId = a.id
      WHERE t.sourceId IS NULL ORDER BY a.createdAt DESC`).all() as Array<{ id: string }>).map((r) => r.id);
    const documents = (this.db.prepare(`SELECT d.id FROM documents d
      LEFT JOIN document_texts t ON t.sourceKind = 'document' AND t.sourceId = d.id
      WHERE t.sourceId IS NULL OR t.extractedAt < d.updatedAt`).all() as Array<{ id: string }>).map((r) => r.id);
    return { attachments, documents };
  }

  /** Sources of one company whose text has every word of the query, best first. */
  search(companyId: string, query: string, limit = 200): TextHit[] {
    const match = ftsQuery(query);
    if (!match) return [];
    return this.db.prepare(`SELECT sourceKind, sourceId, rank FROM document_search
      WHERE document_search MATCH ? AND companyId = ? ORDER BY rank LIMIT ?`).all(match, companyId, limit) as TextHit[];
  }
}
