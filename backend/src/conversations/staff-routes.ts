import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { DataStore } from '../data/store';
import { canAccessCompany, HttpError } from '../http';
import type { Contact, SanitizedUser } from '../types';
import { downloadHeaders, readUpload } from '../portal/files';
import { afterStaffMessage, fileDto, parseFileIds, parseMessage } from '../portal/thread';
import { asRecord } from '../validation';
import type { ConvMessage, Thread, ThreadState } from './conversations-store';
import { staffMessageView, staffThreadView } from './views';
import { canSeeContact, canSeeMessage, type StaffViewer } from './visibility';

type StaffRequest = Request & { user?: SanitizedUser };

export interface ConversationStaffDeps {
  store: DataStore;
  authMiddleware: RequestHandler;
  /** Any member of the company passes. */
  requireCompanyAccess(req: StaffRequest, companyId: string): void;
  viewerFor(req: StaffRequest, companyId: string): StaffViewer;
  /** The portal channel exists only for this company. */
  portalCompanyId: string | undefined;
  /** Whether this user may read private contacts of others (CONTACTS_PRIVATE_READ). */
  seesPrivateFor(userId: string, companyId: string): boolean | Promise<boolean>;
  /** Contacts module on for the company and the request user holds contacts:read (or contacts:write for 'write'). */
  canUseContacts(req: StaffRequest, companyId: string, access: 'read' | 'write'): boolean | Promise<boolean>;
}

const NOTE_EDIT_MS = 15 * 60 * 1000;
const STATE_FILTERS = ['waiting_us', 'waiting_them', 'done', 'snoozed', 'open'] as const;

const wrap = (fn: (req: StaffRequest, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    try { Promise.resolve(fn(req as StaffRequest, res)).catch(next); } catch (e) { next(e); }
  };

/** The staff side of conversations: inbox, a contact's threads, thread messages. */
export function createConversationStaffRouter(deps: ConversationStaffDeps): Router {
  const { store, authMiddleware } = deps;
  const router = Router();
  const c = store.conversations;

  const portalUsersOf = (companyId: string, contactId: string): number =>
    companyId !== deps.portalCompanyId
      ? 0
      : store.portal.listUsers(companyId, { contactId }).filter((u) => u.status === 'active').length;

  const isMember = (userId: string, companyId: string): boolean => {
    const user = store.getUserById(userId);
    return !!user && canAccessCompany(user as SanitizedUser, companyId);
  };

  /** Company member, then the contacts permission: conversations belong to contacts. */
  const requireContacts = async (req: StaffRequest, companyId: string, access: 'read' | 'write' = 'read') => {
    deps.requireCompanyAccess(req, companyId);
    if (!(await deps.canUseContacts(req, companyId, access))) throw new HttpError(403, 'You do not have permission to perform this action.');
  };

  /** A visible contact of this company, else 404 (never reveals that a private one exists). */
  const visibleContact = async (
    req: StaffRequest, companyId: string, contactId: string, access: 'read' | 'write' = 'read',
  ): Promise<{ contact: Contact; viewer: StaffViewer }> => {
    await requireContacts(req, companyId, access);
    const viewer = deps.viewerFor(req, companyId);
    const contact = store.getContactById(contactId);
    if (!contact || contact.companyId !== companyId || !canSeeContact(contact, viewer)) throw new HttpError(404, 'Not found.');
    return { contact, viewer };
  };

  const loadThread = async (req: StaffRequest, access: 'read' | 'write' = 'read'): Promise<{ thread: Thread; contact: Contact; viewer: StaffViewer }> => {
    const thread = c.getThread(req.params.id);
    if (!thread) throw new HttpError(404, 'Not found.');
    return { thread, ...(await visibleContact(req, thread.companyId, thread.contactId, access)) };
  };

  /** Throws 400 unless this user may see the contact: public, theirs, or private-read. */
  const requireCanSee = async (userId: string, contact: Contact) => {
    if (contact.visibility !== 'Private' || contact.ownerUserId === userId) return;
    if (!(await deps.seesPrivateFor(userId, contact.companyId))) {
      throw new HttpError(400, `${store.getUserById(userId)?.name ?? 'This person'} cannot see this contact`);
    }
  };

  const visibleMessages = (thread: Thread, viewer: StaffViewer): ConvMessage[] =>
    c.messages(thread.id).filter((m) => canSeeMessage(m, viewer));

  const threadView = (thread: Thread, viewer: StaffViewer, now: string) => staffThreadView(store, thread, viewer.userId, now);

  router.get('/companies/:companyId/inbox', authMiddleware, wrap(async (req, res) => {
    const { companyId } = req.params;
    await requireContacts(req, companyId);
    const viewer = deps.viewerFor(req, companyId);
    const now = new Date().toISOString();
    const view = typeof req.query.view === 'string' ? req.query.view : 'mine';
    if (!['mine', 'unassigned', 'all'].includes(view)) throw new HttpError(400, 'view must be mine, unassigned or all.');
    const stateParam = typeof req.query.state === 'string' ? req.query.state : undefined;
    if (stateParam && !(STATE_FILTERS as readonly string[]).includes(stateParam)) throw new HttpError(400, 'Unknown state.');
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    const seen = new Map<string, boolean>();
    const visible = (contactId: string) => {
      if (!seen.has(contactId)) {
        const contact = store.getContactById(contactId);
        seen.set(contactId, !!contact && canSeeContact(contact, viewer));
      }
      return seen.get(contactId)!;
    };
    const all = c.listThreads(companyId, { withMessages: true }, now).filter((t) => visible(t.contactId));
    const waitingUs = all.filter((t) => t.state === 'waiting_us');
    const counts = {
      mine: waitingUs.filter((t) => t.assigneeUserId === viewer.userId).length,
      unassigned: waitingUs.filter((t) => !t.assigneeUserId).length,
      all: waitingUs.length,
    };

    const states: ThreadState[] | undefined = !stateParam ? undefined
      : stateParam === 'open' ? ['waiting_us', 'waiting_them'] : [stateParam as ThreadState];
    const threads = all
      .filter((t) => view === 'all' || (view === 'mine' ? t.assigneeUserId === viewer.userId : !t.assigneeUserId))
      .filter((t) => !states || states.includes(t.state))
      .map((t) => threadView(t, viewer, now))
      .filter((t) => !q || t.contact.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
    res.json({ threads, counts });
  }));

  router.get('/companies/:companyId/contacts/:contactId/conversation', authMiddleware, wrap(async (req, res) => {
    const { companyId, contactId } = req.params;
    const { viewer } = await visibleContact(req, companyId, contactId);
    const conversation = c.ensureConversation(companyId, contactId);
    const now = new Date().toISOString();
    const owner = conversation.ownerUserId
      ? { id: conversation.ownerUserId, name: store.getUserById(conversation.ownerUserId)?.name ?? '' }
      : null;
    res.json({
      conversation: { id: conversation.id, owner },
      threads: c.threadsOf(conversation.id).map((t) => threadView(t, viewer, now)),
      portalUsers: portalUsersOf(companyId, contactId),
    });
  }));

  router.get('/conversation-threads/:id', authMiddleware, wrap(async (req, res) => {
    const { thread, viewer } = await loadThread(req);
    const now = new Date().toISOString();
    c.markRead(thread.id, { type: 'staff', id: viewer.userId }, now);
    res.json({
      thread: threadView(thread, viewer, now),
      messages: visibleMessages(thread, viewer).map((m) => staffMessageView(store, m, thread, viewer.userId)),
      portalUsers: portalUsersOf(thread.companyId, thread.contactId),
    });
  }));

  router.post('/conversation-threads/:id/messages', authMiddleware, wrap(async (req, res) => {
    const { thread, contact, viewer } = await loadThread(req, 'write');
    const body = asRecord(req.body, 'body');
    const kind = body.kind;
    if (kind !== 'portal' && kind !== 'note') throw new HttpError(400, 'kind must be portal or note.');
    const { text } = parseMessage(body);
    const fileIds = parseFileIds(body.fileIds);
    if (kind === 'portal' && thread.companyId !== deps.portalCompanyId) throw new HttpError(400, 'This company has no client portal');

    let mentionIds: string[] = [];
    if (body.mentionUserIds !== undefined && body.mentionUserIds !== null) {
      if (kind !== 'note') throw new HttpError(400, 'Only notes can mention people.');
      if (!Array.isArray(body.mentionUserIds) || body.mentionUserIds.some((id) => typeof id !== 'string')) {
        throw new HttpError(400, 'mentionUserIds must be a list of user ids.');
      }
      mentionIds = [...new Set(body.mentionUserIds as string[])];
      if (mentionIds.length > 20) throw new HttpError(400, 'Mention at most 20 people.');
      if (mentionIds.some((id) => !isMember(id, thread.companyId))) throw new HttpError(400, 'You can only mention people in this company.');
      for (const id of mentionIds) await requireCanSee(id, contact);
    }

    const message = store.transaction(() => {
      const created = c.addMessage({
        threadId: thread.id,
        channel: kind === 'portal' ? 'portal' : 'note',
        direction: kind === 'portal' ? 'out' : 'none',
        visibility: kind === 'portal' ? 'external' : 'internal',
        authorType: 'staff', authorUserId: viewer.userId, authorPortalUserId: null, body: text,
      });
      store.thread.attach(fileIds, { type: 'message', id: created.id }, {
        companyId: thread.companyId, contactId: thread.contactId, uploader: { kind: 'staff', userId: viewer.userId },
      });
      if (mentionIds.length) c.addMentions(created.id, mentionIds);
      if (kind === 'portal') afterStaffMessage(store, { companyId: thread.companyId, contactId: thread.contactId, userId: viewer.userId });
      return created;
    });

    if (mentionIds.length) {
      const author = store.getUserById(viewer.userId)?.name ?? 'Someone';
      store.notify({
        companyId: thread.companyId,
        userIds: mentionIds,
        type: 'mention',
        title: `${author} mentioned you about ${contact.name}`,
        body: text.slice(0, 200),
        data: { tKey: 'notif.mention.t', name: author, contact: contact.name },
        link: `/inbox?thread=${thread.id}&message=${message.id}`,
        entityType: 'conversation_message',
        entityId: message.id,
      });
    }
    res.status(201).json(staffMessageView(store, message, thread, viewer.userId));
  }));

  router.post('/conversation-threads/:id/files', authMiddleware, wrap(async (req, res) => {
    const { thread, viewer } = await loadThread(req, 'write');
    const upload = readUpload(asRecord(req.body, 'body'));
    const file = store.thread.addFile({
      companyId: thread.companyId, contactId: thread.contactId, uploader: { kind: 'staff', userId: viewer.userId },
      fileName: upload.fileName, mimeType: upload.type, content: upload.content,
    });
    res.status(201).json(fileDto(file));
  }));

  /** Attached to a message this viewer can see, or still unattached and theirs; anything else is a 404. */
  router.get('/conversation-files/:id/content', authMiddleware, wrap(async (req, res) => {
    const file = store.thread.getFile(req.params.id);
    if (!file) throw new HttpError(404, 'File not found.');
    await requireContacts(req, file.companyId);
    const viewer = deps.viewerFor(req, file.companyId);
    let allowed = false;
    if (file.parentType === 'message' && file.parentId) {
      const message = c.getMessage(file.parentId);
      const thread = message ? c.getThread(message.threadId) : undefined;
      const contact = thread ? store.getContactById(thread.contactId) : undefined;
      allowed = !!message && !!thread && thread.companyId === file.companyId && !!contact
        && canSeeContact(contact, viewer) && canSeeMessage(message, viewer);
    } else if (!file.parentId) {
      allowed = file.uploaderKind === 'staff' && file.userId === viewer.userId;
    }
    if (!allowed) throw new HttpError(404, 'File not found.');
    res.set(downloadHeaders(file)).send(store.thread.fileContent(file.id));
  }));

  router.patch('/conversation-messages/:id', authMiddleware, wrap(async (req, res) => {
    const message = c.getMessage(req.params.id);
    const thread = message ? c.getThread(message.threadId) : undefined;
    if (!message || !thread) throw new HttpError(404, 'Not found.');
    const { viewer } = await visibleContact(req, thread.companyId, thread.contactId, 'write');
    if (!canSeeMessage(message, viewer)) throw new HttpError(404, 'Not found.');
    if (message.channel !== 'note' || message.authorUserId !== viewer.userId) throw new HttpError(403, 'You can only edit your own notes.');
    const now = new Date();
    if (now.getTime() - Date.parse(message.createdAt) > NOTE_EDIT_MS) throw new HttpError(409, 'A note can be edited for 15 minutes after it is written.');
    const { text } = parseMessage(asRecord(req.body, 'body'));
    const updated = c.editNote(message.id, text, now.toISOString())!;
    res.json(staffMessageView(store, updated, thread, viewer.userId));
  }));

  router.patch('/conversation-threads/:id', authMiddleware, wrap(async (req, res) => {
    const { thread, contact, viewer } = await loadThread(req, 'write');
    const body = asRecord(req.body, 'body');
    const now = new Date().toISOString();

    let assignee: string | null | undefined;
    if (body.assigneeUserId !== undefined) {
      if (body.assigneeUserId === null) assignee = null;
      else if (typeof body.assigneeUserId === 'string' && isMember(body.assigneeUserId, thread.companyId)) assignee = body.assigneeUserId;
      else throw new HttpError(400, 'The assignee must be a member of this company.');
      if (assignee) await requireCanSee(assignee, contact);
    }
    let state: { state: ThreadState; until?: string } | undefined;
    if (body.snoozedUntil !== undefined) {
      const until = typeof body.snoozedUntil === 'string' ? Date.parse(body.snoozedUntil) : NaN;
      if (!Number.isFinite(until) || until <= Date.parse(now)) throw new HttpError(400, 'snoozedUntil must be a date in the future.');
      state = { state: 'snoozed', until: new Date(until).toISOString() };
    } else if (body.state !== undefined) {
      if (body.state !== 'done' && body.state !== 'waiting_us') throw new HttpError(400, 'state must be done or waiting_us.');
      state = { state: body.state };
    }
    store.transaction(() => {
      if (assignee !== undefined) c.setAssignee(thread.id, assignee);
      if (state) c.setState(thread.id, state.state, state.until);
    });
    res.json(threadView(c.getThread(thread.id)!, viewer, now));
  }));

  return router;
}
