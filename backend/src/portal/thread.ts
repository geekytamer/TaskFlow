import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { ConvMessage } from '../conversations/conversations-store';
import type { PortalFileMeta } from './thread-store';
import { notifyThreadMessage } from '../conversations/alerts';

type MessageLike = Pick<ConvMessage, 'id' | 'body' | 'authorType' | 'authorUserId' | 'authorPortalUserId' | 'createdAt'>;

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
export function portalMessageDto(store: DataStore, message: MessageLike, viewerPortalUserId: string) {
  const author = message.authorType === 'staff'
    ? { kind: 'team' as const, name: store.getUserById(message.authorUserId!)?.name ?? null }
    : {
        kind: message.authorPortalUserId === viewerPortalUserId ? ('you' as const) : ('client' as const),
        name: store.portal.getUser(message.authorPortalUserId!)?.name ?? null,
      };
  return { id: message.id, body: message.body, author, files: store.thread.filesOf('message', message.id).map(fileDto), createdAt: message.createdAt };
}

const REPLY_TRIGGER = 'portal_message';

const openReplyFollowups = (store: DataStore, companyId: string, contactId: string) =>
  store.listFollowupEntities(companyId, { status: 'active', entityType: 'contact', entityId: contactId })
    .filter((f) => f.sourceTrigger === REPLY_TRIGGER);

/**
 * A client or influencer message: the people on the thread get one grouped
 * alert (conversations/alerts.ts). It no longer opens a reply follow-up; the
 * inbox's waiting state and response target track the reply instead.
 */
export function afterPortalMessage(store: DataStore, input: { message: ConvMessage; threadId: string }) {
  const thread = store.conversations.getThread(input.threadId);
  if (thread) notifyThreadMessage(store, thread, input.message);
}

/** A staff reply answers whatever was waiting, including reply follow-ups opened before alerts replaced them. */
export function afterStaffMessage(store: DataStore, input: { companyId: string; contactId: string; userId: string }) {
  for (const followup of openReplyFollowups(store, input.companyId, input.contactId)) {
    store.completeFollowup(followup.id, { outcome: 'replied', completedByUserId: input.userId });
  }
}
