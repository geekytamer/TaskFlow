import type { Audience } from './audience';
import { getCampaigns } from './campaigns';
import { getAssignments } from './influencer';
import { getProposals } from './requests';

/**
 * Counts on navigation items, only where a record says something waits on the
 * reader: content to review, proposals to answer, assignments to reply to.
 * A failing read drops the count rather than the page.
 */
export async function navBadges(audience: Audience): Promise<Partial<Record<string, number>>> {
  try {
    if (audience === 'client') {
      const [campaigns, proposals] = await Promise.all([getCampaigns(), getProposals()]);
      return {
        '/campaigns': campaigns.reduce((n, c) => n + c.deliverables.awaitingReview, 0),
        '/requests': proposals.filter((p) => p.status === 'sent').length,
      };
    }
    const assignments = await getAssignments();
    return { '/assignments': assignments.filter((a) => a.status === 'awaiting_reply').length };
  } catch {
    return {};
  }
}
