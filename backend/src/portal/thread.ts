import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact } from '../types';
import type { AccountMessage, PortalFileMeta } from './thread-store';

export const MAX_MESSAGE_CHARS = 4000;
export const MAX_FILES_PER_ITEM = 10;

export function parseMessage(body: Record<string, unknown>): { text: string; fileIds: string[] } {
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text || text.length > MAX_MESSAGE_CHARS) throw new HttpError(400, `A message is 1 to ${MAX_MESSAGE_CHARS} characters.`);
  return { text, fileIds: parseFileIds(body.fileIds) };
}

export function parseFileIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) throw new HttpError(400, 'fileIds must be a list of ids.');
  const ids = [...new Set(value as string[])];
  if (ids.length > MAX_FILES_PER_ITEM) throw new HttpError(400, `Attach at most ${MAX_FILES_PER_ITEM} files.`);
  return ids;
}

export const fileDto = (file: PortalFileMeta) => ({
  id: file.id,
  fileName: file.fileName,
  mimeType: file.mimeType,
  sizeBytes: file.sizeBytes,
  createdAt: file.createdAt,
});

/** A message as a portal user sees it: their own, a colleague's, or the team's. */
export function portalMessageDto(store: DataStore, message: AccountMessage, viewerPortalUserId: string) {
  const author = message.authorType === 'staff'
    ? { kind: 'team' as const, name: store.getUserById(message.authorUserId!)?.name ?? null }
    : {
        kind: message.authorPortalUserId === viewerPortalUserId ? ('you' as const) : ('client' as const),
        name: store.portal.getUser(message.authorPortalUserId!)?.name ?? null,
      };
  return { id: message.id, body: message.body, author, files: store.thread.filesOf('message', message.id).map(fileDto), createdAt: message.createdAt };
}

export function staffMessageDto(store: DataStore, message: AccountMessage) {
  const author = message.authorType === 'staff'
    ? { type: 'staff' as const, name: store.getUserById(message.authorUserId!)?.name ?? null }
    : { type: 'portal' as const, name: store.portal.getUser(message.authorPortalUserId!)?.name ?? null };
  return { id: message.id, body: message.body, author, files: store.thread.filesOf('message', message.id).map(fileDto), createdAt: message.createdAt };
}

const REPLY_TRIGGER = 'portal_message';

const openReplyFollowups = (store: DataStore, companyId: string, contactId: string) =>
  store.listFollowupEntities(companyId, { status: 'active', entityType: 'contact', entityId: contactId })
    .filter((f) => f.sourceTrigger === REPLY_TRIGGER);

/**
 * A client or influencer message needs a reply: keep exactly one open "reply"
 * follow-up for the account manager while any message is unanswered.
 */
export function afterPortalMessage(store: DataStore, input: { companyId: string; contact: Contact; managerId?: string; message: AccountMessage }) {
  if (openReplyFollowups(store, input.companyId, input.contact.id).length > 0) return;
  const managerName = input.managerId ? store.getUserById(input.managerId)?.name : undefined;
  const title = `Reply to ${input.contact.name}`;
  const followup = store.createFollowup({
    companyId: input.companyId,
    entityType: 'contact',
    entityId: input.contact.id,
    title,
    channel: 'Task',
    priority: 'normal',
    ownerUserId: input.managerId,
    ownerName: managerName,
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    notes: input.message.body.slice(0, 500),
    sourceTrigger: REPLY_TRIGGER,
    sourceType: 'account_message',
    sourceId: input.message.id,
  });
  if (input.managerId) {
    store.notify({
      companyId: input.companyId,
      userIds: [input.managerId],
      type: 'followup_assigned',
      title: `New message from ${input.contact.name}`,
      body: input.message.body.slice(0, 200),
      data: { tKey: 'notif.followupAssigned.t', name: title },
      link: '/crm/followups',
      entityType: 'follow_up',
      entityId: followup.id,
    });
  }
}

/** A staff reply answers whatever was waiting. */
export function afterStaffMessage(store: DataStore, input: { companyId: string; contactId: string; userId: string }) {
  for (const followup of openReplyFollowups(store, input.companyId, input.contactId)) {
    store.completeFollowup(followup.id, { outcome: 'replied', completedByUserId: input.userId });
  }
}
