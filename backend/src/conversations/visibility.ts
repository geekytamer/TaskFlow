import type { Contact } from '../types';
import type { ConvMessage } from './conversations-store';

export type StaffViewer = { kind: 'staff'; userId: string; seesPrivate: boolean };
export type PortalViewer = { kind: 'portal'; portalUserId: string; contactId: string };
export type Viewer = StaffViewer | PortalViewer;

/** Same rule as the contact list: public, or the viewer owns it, or may read private contacts. */
export function canSeeContact(contact: Pick<Contact, 'visibility' | 'ownerUserId'>, viewer: StaffViewer): boolean {
  return contact.visibility !== 'Private' || contact.ownerUserId === viewer.userId || viewer.seesPrivate;
}

/** Portal: only external portal-channel messages. Staff: everything but another person's owner_private. */
export function canSeeMessage(m: ConvMessage, viewer: Viewer, ownerOf?: (m: ConvMessage) => string | null): boolean {
  if (viewer.kind === 'portal') return m.visibility === 'external' && m.channel === 'portal';
  if (m.visibility !== 'owner_private') return true;
  return (ownerOf ? ownerOf(m) : m.authorUserId) === viewer.userId;
}
