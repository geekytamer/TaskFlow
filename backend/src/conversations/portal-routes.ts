import type { Response, RequestHandler, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { PortalSession } from '../portal/portal-store';
import type { SessionRequest } from '../portal/common';
import { afterPortalMessage, parseMessage } from '../portal/thread';
import { asRecord } from '../validation';
import type { Thread } from './conversations-store';
import { portalMessageView } from './views';
import { canSeeMessage, type PortalViewer } from './visibility';

export const portalViewer = (session: PortalSession): PortalViewer => ({ kind: 'portal', portalUserId: session.portalUserId, contactId: session.contactId });

/** Threaded messages for both portal audiences, always scoped to the session's own contact. */
export function registerConversationPortalRoutes(router: Router, store: DataStore, companyId: string, requireSession: RequestHandler): void {
  const c = store.conversations;

  // Visibility rules do not check ownership, so every route proves the thread is the session's own first.
  const ownThread = (session: PortalSession, id: string): Thread => {
    const thread = c.getThread(id);
    if (!thread || thread.companyId !== companyId || thread.contactId !== session.contactId) throw new HttpError(404, 'Not found.');
    return thread;
  };
  const visibleMessages = (session: PortalSession, thread: Thread) => c.messages(thread.id).filter((m) => canSeeMessage(m, portalViewer(session)));

  router.get('/:audience/threads', requireSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const conversation = c.ensureConversation(companyId, session.contactId);
    const general = c.generalThread(companyId, session.contactId);
    const out = c.threadsOf(conversation.id).flatMap((thread) => {
      const visible = visibleMessages(session, thread);
      if (thread.id !== general.id && visible.length === 0) return [];
      const last = visible[visible.length - 1];
      const read = c.readsOf(thread.id).find((r) => r.readerType === 'portal' && r.readerId === session.portalUserId);
      return [{
        id: thread.id,
        subject: thread.subject,
        // Only portal-visible messages count; a note must not leak its timing here.
        lastMessageAt: last?.createdAt ?? null,
        sortAt: last?.createdAt ?? thread.createdAt,
        lastMessage: last ? { body: last.body, authorKind: last.authorType === 'staff' ? ('team' as const) : last.authorPortalUserId === session.portalUserId ? ('you' as const) : ('client' as const) } : null,
        unread: !!last && last.authorPortalUserId !== session.portalUserId && (!read || read.lastReadAt < last.createdAt),
      }];
    });
    out.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
    res.json(out.map(({ sortAt, ...t }) => t));
  });

  router.get('/:audience/threads/:id', requireSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const thread = ownThread(session, req.params.id);
    c.markRead(thread.id, { type: 'portal', id: session.portalUserId }, new Date().toISOString());
    res.json({
      thread: { id: thread.id, subject: thread.subject },
      messages: visibleMessages(session, thread).map((m) => portalMessageView(store, m, session.portalUserId)),
    });
  });

  router.post('/:audience/threads/:id/messages', requireSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const thread = ownThread(session, req.params.id);
    const { text, fileIds } = parseMessage(asRecord(req.body, 'body'));
    const contact = store.getContactById(session.contactId);
    if (!contact) throw new HttpError(404, 'Not found.');
    const message = store.transaction(() => store.runAsActor({ name: `Portal: ${session.name} (${contact.name})` }, () => {
      const created = c.addMessage({
        threadId: thread.id, channel: 'portal', direction: 'in', visibility: 'external',
        authorType: 'portal', authorUserId: null, authorPortalUserId: session.portalUserId, body: text,
      });
      store.thread.attach(fileIds, { type: 'message', id: created.id }, {
        companyId, contactId: contact.id, uploader: { kind: 'portal', portalUserId: session.portalUserId },
      });
      // Writing is reading your own thread.
      c.markRead(thread.id, { type: 'portal', id: session.portalUserId }, created.createdAt);
      afterPortalMessage(store, { message: created, threadId: thread.id });
      return created;
    }));
    res.status(201).json(portalMessageView(store, message, session.portalUserId));
  });
}
