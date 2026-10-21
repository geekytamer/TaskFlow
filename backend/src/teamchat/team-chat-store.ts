import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * Staff chats: direct (two people) and groups, inside one company. Kept apart
 * from client conversations on purpose: no portal, SLA or contact rules apply,
 * and nothing here can ever be sent outside the company. Only members read a chat.
 */

export type TeamChatKind = 'direct' | 'group';

export interface TeamChatRow {
  id: string;
  companyId: string;
  kind: TeamChatKind;
  name: string | null;
  /** "a:b" with the two user ids sorted: one direct chat per pair. */
  directKey: string | null;
  createdBy: string;
  createdAt: string;
  lastMessageAt: string | null;
}

export interface TeamChatMember {
  chatId: string;
  userId: string;
  joinedAt: string;
  lastReadAt: string | null;
  muted: number;
}

export interface TeamChatMessage {
  id: string;
  chatId: string;
  companyId: string;
  authorUserId: string;
  body: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

/** How long an author can still change or delete what they wrote. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_BODY = 4000;

export const TEAM_CHAT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS team_chats (
    id            TEXT PRIMARY KEY,
    companyId     TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
    name          TEXT,
    directKey     TEXT,
    createdBy     TEXT NOT NULL,
    createdAt     TEXT NOT NULL,
    lastMessageAt TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_team_chats_direct ON team_chats(companyId, directKey) WHERE directKey IS NOT NULL;
  CREATE TABLE IF NOT EXISTS team_chat_members (
    chatId     TEXT NOT NULL,
    userId     TEXT NOT NULL,
    joinedAt   TEXT NOT NULL,
    lastReadAt TEXT,
    muted      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (chatId, userId)
  );
  CREATE INDEX IF NOT EXISTS idx_team_chat_members_user ON team_chat_members(userId);
  CREATE TABLE IF NOT EXISTS team_chat_messages (
    id           TEXT PRIMARY KEY,
    chatId       TEXT NOT NULL,
    companyId    TEXT NOT NULL,
    authorUserId TEXT NOT NULL,
    body         TEXT NOT NULL,
    mentions     TEXT,
    createdAt    TEXT NOT NULL,
    editedAt     TEXT,
    deletedAt    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_team_chat_messages_chat ON team_chat_messages(chatId, createdAt);
`;

const mapMessage = (row: any): TeamChatMessage => {
  let mentions: string[] = [];
  try { mentions = row.mentions ? JSON.parse(row.mentions) : []; } catch { mentions = []; }
  // A deleted message keeps its place in the timeline, never its words.
  return { ...row, body: row.deletedAt ? '' : row.body, mentions: row.deletedAt ? [] : mentions };
};

export class TeamChatStore {
  constructor(private readonly db: Database.Database) {}

  get(chatId: string): TeamChatRow | undefined {
    return this.db.prepare('SELECT * FROM team_chats WHERE id = ?').get(chatId) as TeamChatRow | undefined;
  }

  members(chatId: string): TeamChatMember[] {
    return this.db.prepare('SELECT * FROM team_chat_members WHERE chatId = ? ORDER BY joinedAt').all(chatId) as TeamChatMember[];
  }

  isMember(chatId: string, userId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM team_chat_members WHERE chatId = ? AND userId = ?').get(chatId, userId);
  }

  /** The one direct chat between two people in a company, made on first use. */
  openDirect(companyId: string, userA: string, userB: string): { chat: TeamChatRow; created: boolean } {
    const directKey = [userA, userB].sort().join(':');
    const existing = this.db.prepare('SELECT * FROM team_chats WHERE companyId = ? AND directKey = ?').get(companyId, directKey) as TeamChatRow | undefined;
    if (existing) return { chat: existing, created: false };
    const now = new Date().toISOString();
    const chat: TeamChatRow = { id: uuid(), companyId, kind: 'direct', name: null, directKey, createdBy: userA, createdAt: now, lastMessageAt: null };
    this.db.transaction(() => {
      this.insertChat(chat);
      this.addMembers(chat.id, [userA, userB], now);
    })();
    return { chat, created: true };
  }

  createGroup(companyId: string, createdBy: string, name: string, memberIds: string[]): TeamChatRow {
    const now = new Date().toISOString();
    const chat: TeamChatRow = { id: uuid(), companyId, kind: 'group', name, directKey: null, createdBy, createdAt: now, lastMessageAt: null };
    this.db.transaction(() => {
      this.insertChat(chat);
      this.addMembers(chat.id, [createdBy, ...memberIds], now);
    })();
    return chat;
  }

  private insertChat(chat: TeamChatRow) {
    this.db.prepare(
      `INSERT INTO team_chats (id, companyId, kind, name, directKey, createdBy, createdAt, lastMessageAt)
       VALUES (@id, @companyId, @kind, @name, @directKey, @createdBy, @createdAt, @lastMessageAt)`,
    ).run(chat);
  }

  addMembers(chatId: string, userIds: string[], now = new Date().toISOString()) {
    const insert = this.db.prepare('INSERT OR IGNORE INTO team_chat_members (chatId, userId, joinedAt, lastReadAt, muted) VALUES (?, ?, ?, ?, 0)');
    // Joining counts as having read what came before: no flood of old unread messages.
    for (const userId of new Set(userIds)) insert.run(chatId, userId, now, now);
  }

  removeMembers(chatId: string, userIds: string[]) {
    const del = this.db.prepare('DELETE FROM team_chat_members WHERE chatId = ? AND userId = ?');
    for (const userId of userIds) del.run(chatId, userId);
  }

  rename(chatId: string, name: string) {
    this.db.prepare('UPDATE team_chats SET name = ? WHERE id = ?').run(name, chatId);
  }

  setMuted(chatId: string, userId: string, muted: boolean) {
    this.db.prepare('UPDATE team_chat_members SET muted = ? WHERE chatId = ? AND userId = ?').run(muted ? 1 : 0, chatId, userId);
  }

  markRead(chatId: string, userId: string, at = new Date().toISOString()) {
    this.db.prepare('UPDATE team_chat_members SET lastReadAt = ? WHERE chatId = ? AND userId = ?').run(at, chatId, userId);
  }

  /** This person's chats in a company, newest activity first, with unread counts. */
  listForUser(companyId: string, userId: string): Array<TeamChatRow & { unread: number; muted: boolean; lastMessage: TeamChatMessage | null }> {
    const rows = this.db.prepare(
      `SELECT c.*, m.muted AS muted,
         (SELECT COUNT(*) FROM team_chat_messages x
            WHERE x.chatId = c.id AND x.authorUserId <> @userId AND x.deletedAt IS NULL
              AND (m.lastReadAt IS NULL OR x.createdAt > m.lastReadAt)) AS unread
       FROM team_chats c JOIN team_chat_members m ON m.chatId = c.id AND m.userId = @userId
       WHERE c.companyId = @companyId
       ORDER BY COALESCE(c.lastMessageAt, c.createdAt) DESC`,
    ).all({ companyId, userId }) as any[];
    const last = this.db.prepare('SELECT * FROM team_chat_messages WHERE chatId = ? ORDER BY createdAt DESC LIMIT 1');
    return rows.map((r) => {
      const lastRow = last.get(r.id);
      return { ...r, muted: r.muted === 1, unread: Number(r.unread), lastMessage: lastRow ? mapMessage(lastRow) : null };
    });
  }

  unreadTotal(companyId: string, userId: string): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) AS n FROM team_chat_messages x
         JOIN team_chats c ON c.id = x.chatId AND c.companyId = @companyId
         JOIN team_chat_members m ON m.chatId = x.chatId AND m.userId = @userId
       WHERE x.authorUserId <> @userId AND x.deletedAt IS NULL AND (m.lastReadAt IS NULL OR x.createdAt > m.lastReadAt)`,
    ).get({ companyId, userId }) as { n: number };
    return Number(row.n);
  }

  /** A page of messages, oldest first; `before` pages back through history. */
  messages(chatId: string, options: { before?: string; limit?: number } = {}): TeamChatMessage[] {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const rows = options.before
      ? this.db.prepare('SELECT * FROM team_chat_messages WHERE chatId = ? AND createdAt < ? ORDER BY createdAt DESC LIMIT ?').all(chatId, options.before, limit)
      : this.db.prepare('SELECT * FROM team_chat_messages WHERE chatId = ? ORDER BY createdAt DESC LIMIT ?').all(chatId, limit);
    return (rows as any[]).reverse().map(mapMessage);
  }

  getMessage(id: string): TeamChatMessage | undefined {
    const row = this.db.prepare('SELECT * FROM team_chat_messages WHERE id = ?').get(id);
    return row ? mapMessage(row) : undefined;
  }

  /** The stored row, deleted words included: for the edit-window check only. */
  rawMessage(id: string): TeamChatMessage | undefined {
    return this.db.prepare('SELECT * FROM team_chat_messages WHERE id = ?').get(id) as TeamChatMessage | undefined;
  }

  post(chat: TeamChatRow, authorUserId: string, body: string, mentions: string[]): TeamChatMessage {
    const now = new Date().toISOString();
    const message = { id: uuid(), chatId: chat.id, companyId: chat.companyId, authorUserId, body, mentions: JSON.stringify(mentions), createdAt: now, editedAt: null, deletedAt: null };
    this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO team_chat_messages (id, chatId, companyId, authorUserId, body, mentions, createdAt, editedAt, deletedAt)
         VALUES (@id, @chatId, @companyId, @authorUserId, @body, @mentions, @createdAt, @editedAt, @deletedAt)`,
      ).run(message);
      this.db.prepare('UPDATE team_chats SET lastMessageAt = ? WHERE id = ?').run(now, chat.id);
      // Writing in a chat means having read it.
      this.markRead(chat.id, authorUserId, now);
    })();
    return this.getMessage(message.id)!;
  }

  edit(id: string, body: string): TeamChatMessage {
    this.db.prepare('UPDATE team_chat_messages SET body = ?, editedAt = ? WHERE id = ?').run(body, new Date().toISOString(), id);
    return this.getMessage(id)!;
  }

  remove(id: string): TeamChatMessage {
    this.db.prepare('UPDATE team_chat_messages SET deletedAt = ? WHERE id = ?').run(new Date().toISOString(), id);
    return this.getMessage(id)!;
  }
}
