import { randomUUID } from 'node:crypto';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact, InfluencerAccount } from '../types';
import { accountKeys, cleanDisplayName, clashMessage, findHandleClash, keyOf, parseQuickAddText } from './handles';

type AccountFields = Pick<Contact, 'influencerPlatform' | 'influencerHandle' | 'influencerAccounts'>;

/** At most this many lines in one quick add. */
export const QUICK_ADD_LIMIT = 100;

/**
 * Refuses accounts another influencer of the company already has. On an
 * update, `previous` is the record before the change: only keys the change
 * adds are checked, so records that clash today stay editable.
 */
export function assertNoHandleClash(store: DataStore, companyId: string, next: AccountFields, previous?: Contact): void {
  const before = previous ? accountKeys(previous) : new Set<string>();
  const added = [...accountKeys(next)].filter((k) => !before.has(k));
  const clash = findHandleClash(store.listContacts(companyId, 'Influencer'), added, previous?.id);
  if (clash) {
    throw new HttpError(409, clashMessage(clash.key, clash.contact.name), {
      code: 'duplicate_handle',
      duplicateOf: { id: clash.contact.id, name: clash.contact.name },
    });
  }
}

export interface QuickAddResult {
  line: string;
  status: 'created' | 'existing' | 'invalid';
  contact?: { id: string; name: string };
}

/**
 * One influencer per line of pasted links. A line whose accounts are already
 * on a record answers with that record and changes nothing. The record's name
 * is the words on the line, else the directory's Instagram name, else the
 * first handle, which the next fetch replaces with the Instagram name.
 */
export function quickAddInfluencers(store: DataStore, companyId: string, text: string, create: (input: Parameters<DataStore['createContact']>[0]) => Contact): QuickAddResult[] {
  const lines = parseQuickAddText(text);
  if (lines.length === 0) throw new HttpError(400, 'Paste at least one profile link or @handle.');
  if (lines.length > QUICK_ADD_LIMIT) throw new HttpError(400, `Paste at most ${QUICK_ADD_LIMIT} lines at a time.`);
  return lines.map(({ line, name, accounts }): QuickAddResult => {
    if (accounts.length === 0) return { line, status: 'invalid' };
    const keys = accounts.map((a) => keyOf(a.platform, a.handle));
    const clash = findHandleClash(store.listContacts(companyId, 'Influencer'), keys);
    if (clash) return { line, status: 'existing', contact: { id: clash.contact.id, name: clash.contact.name } };
    const instagram = accounts.find((a) => a.platform === 'Instagram');
    const fullName = instagram ? store.discover.byUsername(companyId, instagram.handle)?.fullName : null;
    const known = fullName ? cleanDisplayName(fullName) : null;
    const influencerAccounts: InfluencerAccount[] = accounts.map((a) => ({ id: randomUUID(), platform: a.platform, handle: a.handle, url: a.url }));
    const contact = create({
      companyId,
      kind: 'Person',
      name: name || known || `@${accounts[0].handle}`,
      roles: ['Influencer'],
      influencerPlatform: accounts[0].platform,
      influencerHandle: accounts[0].handle,
      influencerAccounts,
    });
    return { line, status: 'created', contact: { id: contact.id, name: contact.name } };
  });
}
