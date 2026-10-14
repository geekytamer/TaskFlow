import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { HttpError } from '../http';

export type ThreadState = 'waiting_us' | 'waiting_them' | 'done' | 'snoozed';
export type Visibility = 'external' | 'internal' | 'owner_private';

export interface Conversation {
  id: string;
  companyId: string;
  contactId: string;
  ownerUserId: string | null;
  createdAt: string;
}

export interface Thread {
  id: string;
  conversationId: string;
  companyId: string;
  contactId: string;
  subject: string;
  contextType: string | null;
  contextId: string | null;
  assigneeUserId: string | null;
  state: ThreadState;
  waitingSince: string | null;
  snoozedUntil: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface ConvMessage {
  id: string;
  threadId: string;
  conversationId: string;
  companyId: string;
  channel: 'portal' | 'note' | 'system';
  direction: 'in' | 'out' | 'none';
  visibility: Visibility;
  authorType: 'staff' | 'portal' | 'system';
  authorUserId: string | null;
  authorPortalUserId: string | null;
  body: string;
  editedAt: string | null;
  createdAt: string;
}

export type NewMessage = Omit<ConvMessage, 'id' | 'createdAt' | 'editedAt' | 'conversationId' | 'companyId'> & {
  threadId: string;
};

const THREAD_SELECT = `SELECT t.id, t.conversationId, t.companyId, c.contactId, t.subject, t.contextType, t.contextId,
  t.assigneeUserId, t.state, t.waitingSince, t.snoozedUntil, t.lastMessageAt, t.createdAt
  FROM conversation_threads t JOIN conversations c ON c.id = t.conversationId`;

const MESSAGE_COLUMNS =
  'id, threadId, conversationId, companyId, channel, direction, visibility, authorType, authorUserId, authorPortalUserId, body, editedAt, createdAt';

/** Conversations (one per contact), their threads and messages. Replaces the single portal thread. */
export class ConversationsStore {
  constructor(private readonly db: Database.Database) {}

  ensureConversation(companyId: string, contactId: string): Conversation {
    const find = () =>
      this.db
        .prepare('SELECT id, companyId, contactId, ownerUserId, createdAt FROM conversations WHERE companyId = ? AND contactId = ?')
        .get(companyId, contactId) as Conversation | undefined;
    const existing = find();
    if (existing) {
      this.generalThread(companyId, contactId);
      return existing;
    }
    const owner = this.db.prepare('SELECT ownerUserId FROM contacts WHERE id = ? AND companyId = ?').get(contactId, companyId) as
      | { ownerUserId: string | null }
      | undefined;
    const conversation: Conversation = {
      id: uuid(), companyId, contactId, ownerUserId: owner?.ownerUserId ?? null, createdAt: new Date().toISOString(),
    };
    this.db
      .prepare('INSERT INTO conversations (id, companyId, contactId, ownerUserId, createdAt) VALUES (@id, @companyId, @contactId, @ownerUserId, @createdAt)')
      .run(conversation);
    this.generalThread(companyId, contactId);
    return conversation;
  }

  /** Read-only lookup: never creates a conversation. */
  findConversation(companyId: string, contactId: string): Conversation | undefined {
    return this.db
      .prepare('SELECT id, companyId, contactId, ownerUserId, createdAt FROM conversations WHERE companyId = ? AND contactId = ?')
      .get(companyId, contactId) as Conversation | undefined;
  }

  generalThread(companyId: string, contactId: string): Thread {
    const conversation = this.db
      .prepare('SELECT id, ownerUserId FROM conversations WHERE companyId = ? AND contactId = ?')
      .get(companyId, contactId) as { id: string; ownerUserId: string | null } | undefined;
    if (!conversation) return this.generalThread(companyId, this.ensureConversation(companyId, contactId).contactId);
    const found = this.db
      .prepare(`${THREAD_SELECT} WHERE t.conversationId = ? AND t.contextType IS NULL`)
      .get(conversation.id) as Thread | undefined;
    if (found) return found;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO conversation_threads (id, conversationId, companyId, subject, contextType, contextId, assigneeUserId, state, createdAt)
         VALUES (?, ?, ?, 'General', NULL, NULL, ?, 'waiting_them', ?)`,
      )
      .run(uuid(), conversation.id, companyId, conversation.ownerUserId, now);
    return this.db.prepare(`${THREAD_SELECT} WHERE t.conversationId = ? AND t.contextType IS NULL`).get(conversation.id) as Thread;
  }

  getThread(id: string): Thread | undefined {
    return this.db.prepare(`${THREAD_SELECT} WHERE t.id = ?`).get(id) as Thread | undefined;
  }

  threadsOf(conversationId: string): Thread[] {
    return this.db
      .prepare(`${THREAD_SELECT} WHERE t.conversationId = ? ORDER BY t.lastMessageAt DESC, t.createdAt DESC, t.rowid DESC`)
      .all(conversationId) as Thread[];
  }

  listThreads(
    companyId: string,
    filter: { contactIds?: Set<string>; assigneeUserId?: string | null; states?: ThreadState[] } = {},
    now: string = new Date().toISOString(),
  ): Thread[] {
    const where = ['t.companyId = ?'];
    const args: unknown[] = [companyId];
    if (filter.assigneeUserId !== undefined) {
      if (filter.assigneeUserId === null) where.push('t.assigneeUserId IS NULL');
      else { where.push('t.assigneeUserId = ?'); args.push(filter.assigneeUserId); }
    }
    const rows = (this.db
      .prepare(`${THREAD_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.lastMessageAt DESC, t.createdAt DESC, t.rowid DESC`)
      .all(...args) as Thread[])
      // A woken snoozed thread reads as waiting_us, with a clock to show.
      .map((t) => (this.effectiveState(t, now) !== t.state ? { ...t, state: 'waiting_us' as ThreadState, waitingSince: this.effectiveWaitingSince(t, now) } : t));
    return rows.filter(
      (t) => (!filter.states?.length || filter.states.includes(t.state)) && (!filter.contactIds || filter.contactIds.has(t.contactId)),
    );
  }

  addMessage(input: NewMessage): ConvMessage {
    const body = typeof input.body === 'string' ? input.body : '';
    if (body.trim().length < 1 || body.length > 4000) throw new HttpError(400, 'A message must be 1 to 4000 characters.');
    const thread = this.getThread(input.threadId);
    if (!thread) throw new HttpError(404, 'Thread not found.');
    const message: ConvMessage = {
      ...input, body, id: uuid(), conversationId: thread.conversationId, companyId: thread.companyId, editedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO conversation_messages (id, threadId, conversationId, companyId, channel, direction, visibility, authorType, authorUserId, authorPortalUserId, body, editedAt, createdAt)
           VALUES (@id, @threadId, @conversationId, @companyId, @channel, @direction, @visibility, @authorType, @authorUserId, @authorPortalUserId, @body, @editedAt, @createdAt)`,
        )
        .run(message);
      let { state, waitingSince, snoozedUntil } = thread;
      if (message.channel === 'portal' && message.direction === 'in') {
        // Keep the earliest unanswered moment while we are already the ones owing a reply.
        waitingSince = thread.state === 'waiting_us' && thread.waitingSince ? thread.waitingSince : message.createdAt;
        state = 'waiting_us';
        snoozedUntil = null;
      } else if (message.channel === 'portal' && message.direction === 'out' && message.visibility === 'external') {
        state = 'waiting_them';
        waitingSince = null;
        snoozedUntil = null;
      }
      this.db
        .prepare('UPDATE conversation_threads SET state = ?, waitingSince = ?, snoozedUntil = ?, lastMessageAt = ? WHERE id = ?')
        .run(state, waitingSince, snoozedUntil, message.createdAt, thread.id);
    })();
    return message;
  }

  messages(threadId: string): ConvMessage[] {
    return this.db
      .prepare(`SELECT ${MESSAGE_COLUMNS} FROM conversation_messages WHERE threadId = ? ORDER BY createdAt ASC, rowid ASC`)
      .all(threadId) as ConvMessage[];
  }

  getMessage(id: string): ConvMessage | undefined {
    return this.db.prepare(`SELECT ${MESSAGE_COLUMNS} FROM conversation_messages WHERE id = ?`).get(id) as ConvMessage | undefined;
  }

  /** Only notes can be edited; the caller decides who and when. */
  editNote(id: string, body: string, now: string): ConvMessage | undefined {
    if (typeof body !== 'string' || body.trim().length < 1 || body.length > 4000) throw new HttpError(400, 'A message must be 1 to 4000 characters.');
    this.db.prepare("UPDATE conversation_messages SET body = ?, editedAt = ? WHERE id = ? AND channel = 'note'").run(body, now, id);
    return this.getMessage(id);
  }

  setAssignee(threadId: string, userId: string | null): void {
    this.db.prepare('UPDATE conversation_threads SET assigneeUserId = ? WHERE id = ?').run(userId, threadId);
  }

  setState(threadId: string, state: ThreadState, snoozedUntil?: string | null): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    const until = state === 'snoozed' ? snoozedUntil ?? null : null;
    // Done and waiting_them owe us nothing; waiting_us keeps its clock or starts one.
    const waitingSince = state === 'waiting_us' ? thread.waitingSince ?? new Date().toISOString() : state === 'snoozed' ? thread.waitingSince : null;
    this.db.prepare('UPDATE conversation_threads SET state = ?, snoozedUntil = ?, waitingSince = ? WHERE id = ?').run(state, until, waitingSince, threadId);
  }

  markRead(threadId: string, reader: { type: 'staff' | 'portal'; id: string }, at: string): void {
    this.db
      .prepare(
        `INSERT INTO conversation_reads (threadId, readerType, readerId, lastReadAt) VALUES (?, ?, ?, ?)
         ON CONFLICT (threadId, readerType, readerId) DO UPDATE SET lastReadAt = MAX(lastReadAt, excluded.lastReadAt)`,
      )
      .run(threadId, reader.type, reader.id, at);
  }

  readsOf(threadId: string): Array<{ readerType: string; readerId: string; lastReadAt: string }> {
    return this.db
      .prepare('SELECT readerType, readerId, lastReadAt FROM conversation_reads WHERE threadId = ? ORDER BY readerType, readerId')
      .all(threadId) as Array<{ readerType: string; readerId: string; lastReadAt: string }>;
  }

  addMentions(messageId: string, userIds: string[]): void {
    const insert = this.db.prepare('INSERT OR IGNORE INTO conversation_mentions (messageId, userId) VALUES (?, ?)');
    for (const userId of new Set(userIds)) insert.run(messageId, userId);
  }

  mentionsOf(messageId: string): string[] {
    return (this.db.prepare('SELECT userId FROM conversation_mentions WHERE messageId = ? ORDER BY rowid').all(messageId) as Array<{ userId: string }>).map((r) => r.userId);
  }

  /** A snoozed thread whose time has passed is waiting on us again. */
  effectiveState(thread: Pick<Thread, 'state' | 'snoozedUntil'>, now: string): ThreadState {
    if (thread.state === 'snoozed' && thread.snoozedUntil && thread.snoozedUntil <= now) return 'waiting_us';
    return thread.state;
  }

  /** When a woken snoozed thread started waiting on us: its own clock, else the moment it woke. */
  effectiveWaitingSince(thread: Pick<Thread, 'state' | 'snoozedUntil' | 'waitingSince'>, now: string): string | null {
    if (this.effectiveState(thread, now) === 'waiting_us' && thread.state === 'snoozed') return thread.waitingSince ?? thread.snoozedUntil;
    return thread.waitingSince;
  }
}
