import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { HttpError } from '../http';
import type { PortalFileType } from './files';

export interface AccountMessage {
  id: string;
  companyId: string;
  contactId: string;
  authorType: 'staff' | 'portal';
  authorUserId: string | null;
  authorPortalUserId: string | null;
  body: string;
  createdAt: string;
}

export interface PortalFileMeta {
  id: string;
  companyId: string;
  contactId: string;
  uploaderKind: 'portal' | 'staff';
  portalUserId: string | null;
  userId: string | null;
  fileName: string;
  mimeType: PortalFileType;
  sizeBytes: number;
  parentType: 'message' | 'request' | null;
  parentId: string | null;
  createdAt: string;
}

export type Uploader = { kind: 'portal'; portalUserId: string } | { kind: 'staff'; userId: string };

const META_COLUMNS =
  'id, companyId, contactId, uploaderKind, portalUserId, userId, fileName, mimeType, sizeBytes, parentType, parentId, createdAt';

/** Messages and files between staff and one portal contact. Nothing here is ever edited or deleted. */
export class PortalThreadStore {
  constructor(private readonly db: Database.Database) {}

  addFile(input: { companyId: string; contactId: string; uploader: Uploader; fileName: string; mimeType: PortalFileType; content: Buffer }): PortalFileMeta {
    const id = uuid();
    this.db
      .prepare(
        `INSERT INTO portal_files (id, companyId, contactId, uploaderKind, portalUserId, userId, fileName, mimeType, sizeBytes, content, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, input.companyId, input.contactId, input.uploader.kind,
        input.uploader.kind === 'portal' ? input.uploader.portalUserId : null,
        input.uploader.kind === 'staff' ? input.uploader.userId : null,
        input.fileName, input.mimeType, input.content.length, input.content, new Date().toISOString(),
      );
    return this.getFile(id)!;
  }

  getFile(id: string): PortalFileMeta | undefined {
    return this.db.prepare(`SELECT ${META_COLUMNS} FROM portal_files WHERE id = ?`).get(id) as PortalFileMeta | undefined;
  }

  fileContent(id: string): Buffer | undefined {
    return (this.db.prepare('SELECT content FROM portal_files WHERE id = ?').get(id) as { content: Buffer } | undefined)?.content;
  }

  filesOf(parentType: 'message' | 'request', parentId: string): PortalFileMeta[] {
    return this.db
      .prepare(`SELECT ${META_COLUMNS} FROM portal_files WHERE parentType = ? AND parentId = ? ORDER BY createdAt ASC, rowid ASC`)
      .all(parentType, parentId) as PortalFileMeta[];
  }

  filesForContact(companyId: string, contactId: string): PortalFileMeta[] {
    return this.db
      .prepare(`SELECT ${META_COLUMNS} FROM portal_files WHERE companyId = ? AND contactId = ? AND parentId IS NOT NULL ORDER BY createdAt DESC, rowid DESC`)
      .all(companyId, contactId) as PortalFileMeta[];
  }

  /**
   * Attaches uploaded files to a message or request. Each must belong to this
   * contact, be unattached, and have been uploaded by the same person.
   */
  attach(fileIds: string[], parent: { type: 'message' | 'request'; id: string }, owner: { companyId: string; contactId: string; uploader: Uploader }): void {
    for (const fileId of fileIds) {
      const file = this.getFile(fileId);
      const sameUploader = file && (owner.uploader.kind === 'portal'
        ? file.uploaderKind === 'portal' && file.portalUserId === owner.uploader.portalUserId
        : file.uploaderKind === 'staff' && file.userId === owner.uploader.userId);
      if (!file || file.companyId !== owner.companyId || file.contactId !== owner.contactId || file.parentId || !sameUploader) {
        throw new HttpError(400, 'One of the files cannot be attached here.');
      }
      this.db.prepare('UPDATE portal_files SET parentType = ?, parentId = ? WHERE id = ? AND parentId IS NULL').run(parent.type, parent.id, fileId);
    }
  }

  addMessage(input: Omit<AccountMessage, 'id' | 'createdAt'>): AccountMessage {
    const message: AccountMessage = { ...input, id: uuid(), createdAt: new Date().toISOString() };
    this.db
      .prepare(
        `INSERT INTO account_messages (id, companyId, contactId, authorType, authorUserId, authorPortalUserId, body, createdAt)
         VALUES (@id, @companyId, @contactId, @authorType, @authorUserId, @authorPortalUserId, @body, @createdAt)`,
      )
      .run(message);
    return message;
  }

  messagesFor(companyId: string, contactId: string): AccountMessage[] {
    return this.db
      .prepare('SELECT * FROM account_messages WHERE companyId = ? AND contactId = ? ORDER BY createdAt ASC, rowid ASC')
      .all(companyId, contactId) as AccountMessage[];
  }
}
