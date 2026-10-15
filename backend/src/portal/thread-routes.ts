import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { asRecord } from '../validation';
import { downloadHeaders, readUpload } from './files';
import type { PortalSession } from './portal-store';
import type { PortalFileMeta } from './thread-store';
import { afterPortalMessage, fileDto, parseMessage, portalMessageDto } from './thread';
import type { SessionRequest } from './common';
import { canSeeMessage } from '../conversations/visibility';
import { portalViewer } from '../conversations/portal-routes';


/**
 * A file of the session's contact is the portal's only when it is on a message
 * the portal may see, on a request (requests belong to the contact), or the
 * session's own upload not yet attached. Staff attach files to internal notes
 * and may upload without sending, so the contact alone is not enough.
 */
function portalMaySee(file: PortalFileMeta, session: PortalSession, store: DataStore): boolean {
  if (file.parentType === 'message' && file.parentId) {
    const message = store.conversations.getMessage(file.parentId);
    const thread = message ? store.conversations.getThread(message.threadId) : undefined;
    return !!message && !!thread && thread.contactId === session.contactId && canSeeMessage(message, portalViewer(session));
  }
  if (file.parentType === 'request' && file.parentId) return true;
  return !file.parentId && file.uploaderKind === 'portal' && file.portalUserId === session.portalUserId;
}

/** Messages and files for either portal audience, always scoped to the session's own contact. */
export function registerThreadRoutes(router: Router, store: DataStore, companyId: string, requireSession: RequestHandler): void {
  router.post('/:audience/files', requireSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const upload = readUpload(asRecord(req.body, 'body'));
    const file = store.thread.addFile({
      companyId, contactId: session.contactId, uploader: { kind: 'portal', portalUserId: session.portalUserId },
      fileName: upload.fileName, mimeType: upload.type, content: upload.content,
    });
    res.status(201).json(fileDto(file));
  });

  router.get('/:audience/files/:id/content', requireSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const file = store.thread.getFile(req.params.id);
    if (!file || file.companyId !== companyId || file.contactId !== session.contactId || !portalMaySee(file, session, store)) {
      throw new HttpError(404, 'Not found.');
    }
    res.set(downloadHeaders(file)).send(store.thread.fileContent(file.id));
  });

  router.get('/:audience/messages', requireSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const thread = store.conversations.generalThread(companyId, session.contactId);
    res.json(store.conversations.messages(thread.id)
      .filter((m) => canSeeMessage(m, portalViewer(session)))
      .map((m) => portalMessageDto(store, m, session.portalUserId)));
  });

  router.post('/:audience/messages', requireSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const { text, fileIds } = parseMessage(asRecord(req.body, 'body'));
    const contact = store.getContactById(session.contactId);
    if (!contact) throw new HttpError(404, 'Not found.');
    const message = store.transaction(() => store.runAsActor({ name: `Portal: ${session.name} (${contact.name})` }, () => {
      const thread = store.conversations.generalThread(companyId, contact.id);
      const created = store.conversations.addMessage({
        threadId: thread.id, channel: 'portal', direction: 'in', visibility: 'external',
        authorType: 'portal', authorUserId: null, authorPortalUserId: session.portalUserId, body: text,
      });
      store.thread.attach(fileIds, { type: 'message', id: created.id }, {
        companyId, contactId: contact.id, uploader: { kind: 'portal', portalUserId: session.portalUserId },
      });
      afterPortalMessage(store, { message: created, threadId: thread.id });
      return created;
    }));
    res.status(201).json(portalMessageDto(store, message, session.portalUserId));
  });
}
