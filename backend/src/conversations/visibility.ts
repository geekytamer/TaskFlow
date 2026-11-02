import type { Contact } from '../types';
import type { ConvMessage } from './conversations-store';

/**
 * A staff member reading conversations. `sees` answers whether a contact is
 * visible to them — the inbox rule of authz/visible.ts, decided by the server.
 */
export type StaffViewer = { kind: 'staff'; userId: string; sees(contact: Pick<Contact, 'id' | 'companyId'>): boolean };
export type PortalViewer = { kind: 'portal'; portalUserId: string; contactId: string };
export type Viewer = StaffViewer | PortalViewer;

/** Same rule as the contact list (authz/visible.ts): public, or within the viewer's reach, or shared with them. */
export function canSeeContact(contact: Pick<Contact, 'id' | 'companyId'>, viewer: StaffViewer): boolean {
  return viewer.sees(contact);
}

/** Portal: only external portal-channel messages. Staff: everything but another person's owner_private. */
export function canSeeMessage(m: ConvMessage, viewer: Viewer, ownerOf?: (m: ConvMessage) => string | null): boolean {
  if (viewer.kind === 'portal') return m.visibility === 'external' && m.channel === 'portal';
  if (m.visibility !== 'owner_private') return true;
  return (ownerOf ? ownerOf(m) : m.authorUserId) === viewer.userId;
}
