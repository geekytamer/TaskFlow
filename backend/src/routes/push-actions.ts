import type { Express, Response } from 'express';
import type { DataStore } from '../data/store';
import { canAccessCompany, HttpError } from '../http';
import { verifyActionToken } from '../push/action-token';
import { canSeeThreadContact } from '../conversations/alerts';
import type { SanitizedUser } from '../types';
import { type AuthedRequest, handler } from './shared';

export interface PushActionDeps {
  store: DataStore;
  /** Whether the Academy keeps this person's contacts changes locked in this company. */
  contactsLocked(user: SanitizedUser, companyId: string): boolean;
}

/** Same roles as PATCH /conversation-threads/:id (contacts:write) under the legacy engine. */
const CONTACTS_WRITE_ROLES = ['Admin', 'Manager', 'Employee', 'Accountant'];

/**
 * A notification's "Mark done" button. No session: the signed token says who was
 * offered the button for which thread, and everything is checked again now —
 * the person still exists, belongs to the thread's company, may change
 * contacts, can see this contact, and the thread is theirs or unassigned. Any
 * refusal is a 404 that changes nothing and reveals nothing.
 */
export function registerPushActionRoutes(app: Express, deps: PushActionDeps): void {
  const { store } = deps;

  app.post('/push-actions/:token', handler((req: AuthedRequest, res: Response) => {
    const notFound = (): never => { throw new HttpError(404, 'Not found.'); };
    const claims = verifyActionToken(String(req.params.token ?? ''));
    if (!claims || claims.action !== 'done') return notFound();
    const thread = store.conversations.getThread(claims.threadId);
    const user = store.getUserById(claims.userId) as SanitizedUser | undefined;
    if (!thread || !user || !canAccessCompany(user, thread.companyId)) return notFound();
    if (!store.listUserIdsWithPermission(thread.companyId, 'contacts:write', CONTACTS_WRITE_ROLES).includes(user.id)) return notFound();
    if (deps.contactsLocked(user, thread.companyId)) return notFound();
    if (!canSeeThreadContact(store, thread, user.id)) return notFound();
    if (thread.assigneeUserId && thread.assigneeUserId !== user.id) return notFound();
    // The same store path as PATCH /conversation-threads/:id, so the waiting clock clears the same way.
    store.transaction(() => store.conversations.setState(thread.id, 'done'));
    res.status(204).end();
  }));
}
