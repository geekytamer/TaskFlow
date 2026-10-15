import type { DataStore } from '../data/store';
import { fileDto } from '../portal/thread';
import type { ConvMessage, Thread } from './conversations-store';
import { slaOf } from './sla';
import { canSeeMessage } from './visibility';

const NOTE_EDIT_MS = 15 * 60 * 1000;

function staffAuthor(store: DataStore, m: ConvMessage) {
  if (m.authorType === 'staff') {
    const u = m.authorUserId ? store.getUserById(m.authorUserId) : undefined;
    return { kind: 'staff' as const, id: m.authorUserId, name: u?.name ?? null, avatar: u?.avatar ?? null };
  }
  if (m.authorType === 'portal') {
    const u = m.authorPortalUserId ? store.portal.getUser(m.authorPortalUserId) : undefined;
    return { kind: 'portal' as const, id: m.authorPortalUserId, name: u?.name ?? null, avatar: null };
  }
  return { kind: 'system' as const, id: null, name: null, avatar: null };
}

/**
 * When a portal user of the thread's contact last read the thread, if that was at or after this staff message.
 * Reads keep only the latest visit, so this is not when it was first seen; the staff UI shows just "Seen".
 */
function seenAtOf(store: DataStore, m: ConvMessage, thread: Thread): string | null {
  if (m.authorType !== 'staff' || m.channel !== 'portal' || m.visibility !== 'external') return null;
  const portalIds = new Set(store.portal.listUsers(thread.companyId, { contactId: thread.contactId }).map((u) => u.id));
  const reads = store.conversations
    .readsOf(thread.id)
    .filter((r) => r.readerType === 'portal' && portalIds.has(r.readerId) && r.lastReadAt >= m.createdAt)
    .map((r) => r.lastReadAt)
    .sort();
  return reads[0] ?? null;
}

/** viewerUserId is optional; without it no note is shown as editable. */
export function staffMessageView(store: DataStore, m: ConvMessage, thread: Thread, viewerUserId?: string) {
  const editable = m.channel === 'note' && m.authorType === 'staff' && !!viewerUserId && m.authorUserId === viewerUserId;
  const names = new Map<string, string>();
  for (const id of store.conversations.mentionsOf(m.id)) names.set(id, store.getUserById(id)?.name ?? '');
  return {
    id: m.id,
    threadId: m.threadId,
    channel: m.channel,
    direction: m.direction,
    visibility: m.visibility,
    author: staffAuthor(store, m),
    body: m.body,
    files: store.thread.filesOf('message', m.id).map(fileDto),
    mentions: [...names].map(([id, name]) => ({ id, name })),
    editedAt: m.editedAt,
    editableUntil: editable ? new Date(Date.parse(m.createdAt) + NOTE_EDIT_MS).toISOString() : null,
    seenAt: seenAtOf(store, m, thread),
    createdAt: m.createdAt,
  };
}

/** Callers must filter with canSeeMessage first; this view never carries internal bodies. */
export function portalMessageView(store: DataStore, m: ConvMessage, viewerPortalUserId: string) {
  const viewer = { kind: 'portal' as const, portalUserId: viewerPortalUserId, contactId: store.portal.getUser(viewerPortalUserId)?.contactId ?? '' };
  if (!canSeeMessage(m, viewer)) throw new Error('not visible to portal');
  let author: { kind: 'you' | 'client' | 'team'; name: string | null; company: string | null };
  if (m.authorType === 'portal') {
    const u = m.authorPortalUserId ? store.portal.getUser(m.authorPortalUserId) : undefined;
    author = {
      kind: m.authorPortalUserId === viewerPortalUserId ? 'you' : 'client',
      name: u?.name ?? null,
      company: u ? store.getContactById(u.contactId)?.name ?? null : null,
    };
  } else {
    const u = m.authorUserId ? store.getUserById(m.authorUserId) : undefined;
    author = { kind: 'team', name: u?.name ?? null, company: store.getCompanyById(m.companyId)?.name ?? null };
  }
  return {
    id: m.id,
    body: m.body,
    author,
    files: store.thread.filesOf('message', m.id).map(fileDto),
    createdAt: m.createdAt,
  };
}

export function staffThreadView(store: DataStore, thread: Thread, viewerUserId: string, now: string) {
  const c = store.conversations;
  const contact = store.getContactById(thread.contactId);
  const assignee = thread.assigneeUserId
    ? { id: thread.assigneeUserId, name: store.getUserById(thread.assigneeUserId)?.name ?? '' }
    : null;
  // Another person's owner_private message must not surface in the preview.
  const last = [...c.messages(thread.id)].reverse().find((m) => canSeeMessage(m, { kind: 'staff', userId: viewerUserId, seesPrivate: false }));
  const read = c.readsOf(thread.id).find((r) => r.readerType === 'staff' && r.readerId === viewerUserId);
  const state = c.effectiveState(thread, now);
  const waitingSince = c.effectiveWaitingSince(thread, now);
  return {
    id: thread.id,
    contact: { id: thread.contactId, name: contact?.name ?? '' },
    subject: thread.subject,
    contextType: thread.contextType,
    contextId: thread.contextId,
    assignee,
    state,
    waitingSince,
    sla: state === 'waiting_us' ? slaOf(waitingSince, now, c.settings(thread.companyId)) : null,
    snoozedUntil: thread.snoozedUntil,
    lastMessageAt: thread.lastMessageAt,
    lastMessage: last
      ? { body: last.body, authorName: staffAuthor(store, last).name, visibility: last.visibility }
      : null,
    unread: !!last && (!read || read.lastReadAt < last.createdAt),
  };
}
