import type { DataStore } from '../data/store';
import { paidContactOf } from './influencer';
import { DAY_MS } from './common';

export const DELIVERABLE_DUE_TRIGGER = 'portal_deliverable_due';

/**
 * Reminds campaign owners of portal influencers' work due within two days and
 * not yet submitted. One follow-up per deliverable; safe to run every hour.
 * Returns how many were created.
 */
export function sweepPortalDeliverableReminders(store: DataStore, companyId: string, now = new Date()): number {
  const horizon = now.getTime() + 2 * DAY_MS;
  const withPortal = new Set(store.portal.listUsers(companyId, { audience: 'influencer' })
    .filter((u) => u.status === 'active').map((u) => u.contactId));
  const already = new Set(store.listFollowupEntities(companyId, {})
    .filter((f) => f.sourceTrigger === DELIVERABLE_DUE_TRIGGER).map((f) => f.sourceId));
  let created = 0;
  for (const campaign of store.listCrmCampaigns(companyId)) {
    if (campaign.archivedAt || campaign.status === 'Archived' || campaign.status === 'Cancelled') continue;
    for (const d of store.listCampaignDeliverables(campaign.id)) {
      const influencerId = paidContactOf(d);
      if (!influencerId || !withPortal.has(influencerId) || already.has(d.id)) continue;
      if (d.status !== 'Planned' && d.status !== 'In Progress') continue;
      if (!d.dueDate || new Date(d.dueDate).getTime() > horizon) continue;
      const influencer = store.getContactById(influencerId);
      const ownerId = campaign.ownerUserId ?? influencer?.ownerUserId;
      store.createFollowup({
        companyId, entityType: 'contact', entityId: influencerId,
        title: `${influencer?.name ?? 'Influencer'}: "${d.title}" is due soon and not submitted`,
        channel: 'Task', priority: 'high',
        ownerUserId: ownerId, ownerName: ownerId ? store.getUserById(ownerId)?.name : undefined,
        dueAt: new Date(d.dueDate), notes: campaign.name,
        sourceTrigger: DELIVERABLE_DUE_TRIGGER, sourceType: 'campaign_deliverable', sourceId: d.id,
      });
      created += 1;
    }
  }
  return created;
}
