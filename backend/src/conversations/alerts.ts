import type { DataStore } from '../data/store';
import { sendToPrincipal, type PushSender } from '../push/push';
import type { Notification } from '../types';
import type { ConvMessage, Thread } from './conversations-store';
import { slaOf } from './sla';

/**
 * Staff alerts for conversations. A client's messages on one thread become one
 * unread alert that counts up; the phone hears about it at most once per
 * window; an overdue reply is flagged once per waiting episode. Alerts point
 * at the thread; only an external message's text is ever previewed.
 */

/** One phone push per (person, thread) inside this window. */
export const MESSAGE_PUSH_WINDOW_MS = 2 * 60 * 1000;
/** How much of a client's message the lock screen may show. */
export const PUSH_PREVIEW_CHARS = 120;

const threadLink = (threadId: string, messageId?: string) =>
  messageId ? `/inbox?thread=${threadId}&message=${messageId}` : `/inbox?thread=${threadId}`;

const contactName = (store: DataStore, thread: Thread) => store.getContactById(thread.contactId)?.name ?? 'a client';

/** Who answers a thread: its assignee, else the conversation owner, else the company's Admins. */
export function threadRecipients(store: DataStore, thread: Thread): string[] {
  if (thread.assigneeUserId) return [thread.assigneeUserId];
  const owner = store.conversations.findConversation(thread.companyId, thread.contactId)?.ownerUserId;
  if (owner) return [owner];
  return store.listUserIdsByCompanyRoles(thread.companyId, ['Admin']);
}

const isInboundExternal = (m: ConvMessage) => m.channel !== 'note' && m.direction === 'in' && m.visibility === 'external';

/** An inbound client message: raise or count up the thread's unread alert. Notes and staff messages never alert. */
export function notifyThreadMessage(store: DataStore, thread: Thread, message: ConvMessage): void {
  if (!isInboundExternal(message)) return;
  const current = store.conversations.getThread(thread.id) ?? thread;
  const name = contactName(store, current);
  store.upsertThreadNotification({
    companyId: current.companyId,
    userIds: threadRecipients(store, current),
    type: 'message_received',
    threadId: current.id,
    build: (count) => ({
      title: count === 1 ? `New message from ${name}` : `${count} new messages from ${name}`,
      body: message.body.slice(0, 200),
      link: threadLink(current.id, message.id),
      data: { tKey: count === 1 ? 'notif.message.t' : 'notif.messages.t', contact: name, count, messageId: message.id, threadId: current.id },
    }),
  });
}

/** A thread was handed to someone (not themselves). */
export function notifyThreadAssigned(store: DataStore, thread: Thread, assigneeUserId: string, byUserId: string): void {
  if (assigneeUserId === byUserId) return;
  const name = contactName(store, thread);
  store.notify({
    companyId: thread.companyId,
    userIds: [assigneeUserId],
    type: 'thread_assigned',
    title: `You were assigned the conversation with ${name}`,
    body: thread.subject,
    data: { tKey: 'notif.threadAssigned.t', contact: name, threadId: thread.id },
    link: threadLink(thread.id),
    entityType: 'conversation_thread',
    entityId: thread.id,
  });
}

/** Threads past their response target: one warning per (thread, waiting episode). Returns how many threads were flagged. */
export function sweepResponseOverdue(store: DataStore, companyId: string, nowIso: string): number {
  const settings = store.conversations.settings(companyId);
  let flagged = 0;
  for (const thread of store.conversations.listThreads(companyId, { withMessages: true, states: ['waiting_us'] }, nowIso)) {
    if (!thread.waitingSince || slaOf(thread.waitingSince, nowIso, settings)?.level !== 'red') continue;
    if (store.hasThreadEpisodeNotification('response_overdue', thread.id, thread.waitingSince)) continue;
    const name = contactName(store, thread);
    const created = store.notify({
      companyId,
      userIds: threadRecipients(store, thread),
      type: 'response_overdue',
      title: `${name} is waiting for a reply`,
      body: thread.subject,
      data: { tKey: 'notif.responseOverdue.t', contact: name, threadId: thread.id, waitingSince: thread.waitingSince },
      link: threadLink(thread.id),
      entityType: 'conversation_thread',
      entityId: thread.id,
    });
    if (created.length > 0) flagged += 1;
  }
  return flagged;
}

/** The start of the alert's latest message, only when it is a client's external message. */
function previewOf(store: DataStore, n: Notification): string {
  const id = n.data?.messageId;
  const message = typeof id === 'string' ? store.conversations.getMessage(id) : undefined;
  return message && isInboundExternal(message) ? message.body.slice(0, PUSH_PREVIEW_CHARS) : '';
}

/**
 * Sends staff notifications to their phones, per category preference. Message
 * alerts are throttled per (person, thread) and tagged by thread, so a later
 * push replaces the earlier one and carries the current count. Only the title
 * travels, plus a message preview when the person allows it.
 */
export async function dispatchStaffPush(
  store: DataStore,
  send: PushSender,
  notifications: Notification[],
  nowMs: number = Date.now(),
  onError: (error: unknown) => void = () => undefined,
): Promise<void> {
  for (const n of notifications) {
    try {
      const prefs = store.getNotificationPrefs(n.userId);
      if (!prefs[n.category].push) continue;
      let tag = `${n.type}:${n.entityId ?? n.id}`;
      let body = '';
      if (n.type === 'message_received' && n.entityId) {
        const last = store.lastThreadPushAt(n.userId, n.entityId);
        if (last && nowMs - Date.parse(last) < MESSAGE_PUSH_WINDOW_MS) continue;
        // Marked before sending, so a message arriving mid-send sees the window.
        store.markNotificationPushed(n.id, new Date(nowMs).toISOString());
        tag = `thread:${n.entityId}`;
        if (prefs.pushPreview) body = previewOf(store, n);
      }
      await sendToPrincipal(store, send, 'staff', n.userId, { title: n.title, body, url: n.link ?? '/notifications', tag });
    } catch (error) {
      onError(error);
    }
  }
}
