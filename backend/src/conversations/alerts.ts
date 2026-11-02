import type { DataStore } from '../data/store';
import { sendToPrincipal, type PushPayload, type PushSender } from '../push/push';
import { canSignActionTokens, signActionToken } from '../push/action-token';
import type { Contact, Notification, NotificationPrefs, SanitizedUser } from '../types';
import type { ConvMessage, Thread } from './conversations-store';
import { slaOf } from './sla';
import { companyInQuietHours, holdPush } from '../push/quiet-hours';

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

/**
 * Whether a person may hear about this contact's conversation: a member of the
 * company who can see the contact by the inbox rule of authz/visible.ts — the
 * same rule their inbox list applies, evaluated for them under the configured
 * engine (store.visibilityEffective), synchronously, because alerts are raised
 * inside the message transaction.
 */
function canSeeContactOf(store: DataStore, contact: Contact | undefined, userId: string): boolean {
  const user = store.getUserById(userId);
  if (!contact || !user || !store.reachesCompany(user as SanitizedUser, contact.companyId)) return false;
  return store.isVisibleTo(store.visibilityEffective(userId), 'inbox', contact.companyId, contact.id);
}

/** Whether this person may see the thread's contact right now (member, and the inbox rule). */
export function canSeeThreadContact(store: DataStore, thread: Thread, userId: string): boolean {
  const contact = store.getContactById(thread.contactId);
  if (!contact || contact.companyId !== thread.companyId) return false;
  return canSeeContactOf(store, contact, userId);
}

/**
 * Who answers a thread: its assignee, else the contact's current owner, else the
 * company's Admins — and only those of them who can see the contact.
 */
export function threadRecipients(store: DataStore, thread: Thread): string[] {
  const contact = store.getContactById(thread.contactId);
  const visible = (ids: string[]) => ids.filter((id) => canSeeContactOf(store, contact, id));
  if (thread.assigneeUserId) {
    const mine = visible([thread.assigneeUserId]);
    if (mine.length > 0) return mine;
    // The assignee cannot see the contact (or left): fall through to the owner, then Admins.
  }
  if (contact?.ownerUserId) {
    const owner = visible([contact.ownerUserId]);
    if (owner.length > 0) return owner;
  }
  return visible(store.listUserIdsByCompanyRoles(thread.companyId, ['Admin']));
}

/**
 * The app icon's number for a staff member: what the inbox counts as theirs to
 * answer, i.e. waiting threads assigned to them plus unassigned ones, of
 * contacts they can see, in a company where they may use contacts.
 */
export function staffInboxBadge(store: DataStore, userId: string, companyId: string, nowIso: string = new Date().toISOString()): number {
  if (!store.listUserIdsWithPermission(companyId, 'contacts:read', ['Admin', 'Manager', 'Employee', 'Accountant']).includes(userId)) return 0;
  const seen = new Map<string, boolean>();
  const visible = (contactId: string) => {
    if (!seen.has(contactId)) seen.set(contactId, canSeeContactOf(store, store.getContactById(contactId), userId));
    return seen.get(contactId)!;
  };
  return store.conversations.listThreads(companyId, { withMessages: true, states: ['waiting_us'] }, nowIso)
    .filter((t) => (!t.assigneeUserId || t.assigneeUserId === userId) && visible(t.contactId))
    .length;
}

/** The badge for a payload; a failure to count never stops the push. */
function badgeFor(store: DataStore, userId: string, companyId: string): number | undefined {
  try { return staffInboxBadge(store, userId, companyId); } catch { return undefined; }
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
    userIds: threadRecipients(store, { ...thread, assigneeUserId }),
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

/** Pushes one message alert as it stands now: its count in the title, the latest preview if allowed. */
async function pushThreadAlert(store: DataStore, send: PushSender, n: Notification, prefs: NotificationPrefs, nowMs: number): Promise<void> {
  // Marked before sending, so a message arriving mid-send sees the window.
  store.markNotificationPushed(n.id, new Date(nowMs).toISOString(), Number(n.data?.count ?? 1));
  const body = prefs.pushPreview ? previewOf(store, n) : '';
  const payload: PushPayload = {
    title: n.title, body, url: n.link ?? '/notifications', tag: `thread:${n.entityId}`,
    badge: badgeFor(store, n.userId, n.companyId),
    // The same tag replaces the earlier notification; renotify makes the phone sound again.
    renotify: true,
  };
  // "Mark done" carries a signed token; the button only appears when one can be signed.
  if (n.entityId && canSignActionTokens()) {
    payload.actions = [{ action: 'open', title: 'Open' }, { action: 'done', title: 'Mark done' }];
    payload.actionToken = signActionToken({ userId: n.userId, threadId: n.entityId, action: 'done' });
  }
  // Quiet hours: kept for the morning summary (marked pushed above, so the flush does not retry every minute).
  if (companyInQuietHours(store, n.companyId, nowMs)) { holdPush(store, 'staff', n.userId, n.companyId, payload); return; }
  await sendToPrincipal(store, send, 'staff', n.userId, payload);
}

const insideWindow = (store: DataStore, n: Notification, nowMs: number) => {
  const last = store.lastThreadPushAt(n.userId, n.entityId!);
  return !!last && nowMs - Date.parse(last) < MESSAGE_PUSH_WINDOW_MS;
};

/**
 * Sends staff notifications to their phones, per category preference. Message
 * alerts are throttled per (person, thread) and tagged by thread, so a later
 * push replaces the earlier one and carries the current count; what the window
 * held back goes out with flushThreadPushes. Only the title travels, plus a
 * message preview when the person allows it.
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
      if (n.type === 'message_received' && n.entityId) {
        if (!insideWindow(store, n, nowMs)) await pushThreadAlert(store, send, n, prefs, nowMs);
        continue;
      }
      const payload: PushPayload = { title: n.title, body: '', url: n.link ?? '/notifications', tag: `${n.type}:${n.entityId ?? n.id}`, badge: badgeFor(store, n.userId, n.companyId) };
      // A cold-chain storage excursion is an alarm: it never waits for the morning.
      if (n.type !== 'storage_excursion' && companyInQuietHours(store, n.companyId, nowMs)) { holdPush(store, 'staff', n.userId, n.companyId, payload); continue; }
      await sendToPrincipal(store, send, 'staff', n.userId, payload);
    } catch (error) {
      onError(error);
    }
  }
}

/**
 * The trailing edge of the throttle: an unread message alert that gained
 * messages since its last push, once the window has passed, is pushed once
 * more with the current count. Returns how many alerts were pushed.
 */
export async function flushThreadPushes(
  store: DataStore,
  send: PushSender,
  nowMs: number = Date.now(),
  onError: (error: unknown) => void = () => undefined,
): Promise<number> {
  let pushed = 0;
  for (const n of store.listUnpushedThreadNotifications()) {
    try {
      const prefs = store.getNotificationPrefs(n.userId);
      if (!prefs[n.category].push || insideWindow(store, n, nowMs)) continue;
      await pushThreadAlert(store, send, n, prefs, nowMs);
      pushed += 1;
    } catch (error) {
      onError(error);
    }
  }
  return pushed;
}
