import type { Request } from 'express';
import type { DataStore } from '../data/store';
import type { Contact } from '../types';
import type { PortalSession } from './portal-store';

/** Helpers shared by the portal routes, so each rule lives in one place. */

export type SessionRequest = Request & { portal?: PortalSession };

export const DAY_MS = 24 * 60 * 60 * 1000;
export const dueIn = (days: number) => new Date(Date.now() + days * DAY_MS);

export const iso = (value: Date | string | undefined | null) => (value ? new Date(value).toISOString() : null);

export const isUniqueViolation = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
};

const currencyCache = new Map<string, { code: string; at: number }>();

/**
 * The company's currency, cached for a minute. Reading finance settings also
 * ensures they exist (a write), which portal pages would otherwise repeat on
 * every request and inside loops. A changed currency shows within a minute.
 */
export function companyCurrency(store: DataStore, companyId: string): string {
  const hit = currencyCache.get(companyId);
  if (hit && Date.now() - hit.at < 60_000) return hit.code;
  const code = store.getCompanyFinanceSettings(companyId).currencyCode;
  currencyCache.set(companyId, { code, at: Date.now() });
  return code;
}

/** Who hears about a portal user's action: the given owner, else the contact's owner, else whoever invited them. */
export const managerOf = (store: DataStore, session: PortalSession, contact: Contact, override?: string) =>
  override ?? contact.ownerUserId ?? store.portal.inviterOf(session.portalUserId);

type FollowupInput = Parameters<DataStore['createFollowup']>[0];

/** A staff task raised by something a portal user did: a Task, owned by the manager, due in `dueDays`. */
export function raiseFollowup(
  store: DataStore,
  input: Omit<FollowupInput, 'channel' | 'ownerName' | 'dueAt'> & { dueDays: number },
) {
  const { dueDays, ...rest } = input;
  return store.createFollowup({
    ...rest,
    channel: 'Task',
    ownerName: rest.ownerUserId ? store.getUserById(rest.ownerUserId)?.name : undefined,
    dueAt: dueIn(dueDays),
  });
}

/** Tells the manager, if there is one. `name` is what the notification list shows. */
export function notifyManager(
  store: DataStore,
  input: { companyId: string; managerId?: string; title: string; name?: string; body?: string; link: string; entityType: string; entityId: string },
) {
  if (!input.managerId) return;
  store.notify({
    companyId: input.companyId,
    userIds: [input.managerId],
    type: 'followup_assigned',
    title: input.title,
    body: input.body,
    data: { tKey: 'notif.followupAssigned.t', name: input.name ?? input.title },
    link: input.link,
    entityType: input.entityType as Parameters<DataStore['notify']>[0]['entityType'],
    entityId: input.entityId,
  });
}
