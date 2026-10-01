import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

export interface CampaignBrief {
  campaignId: string;
  influencerBrief: string | null;
  requireClientApproval: boolean;
}

export interface AssignmentResponse {
  assignmentId: string;
  portalUserId: string;
  decision: 'accepted' | 'declined';
  reason: string | null;
  createdAt: string;
}

/** Fields an influencer may ask to change. Anything else is refused at parse time. */
export interface ProfileChanges {
  niche?: string;
  location?: string;
  languages?: string[];
  rateCardAmount?: number;
  accounts?: Array<{ id?: string; platform: string; handle?: string; url?: string; followers?: number; engagementRate?: number }>;
}

export interface ChangeRequest {
  id: string;
  companyId: string;
  contactId: string;
  portalUserId: string;
  changes: ProfileChanges;
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

type ChangeRow = Omit<ChangeRequest, 'changes'> & { changes: string };

/** Storage for the influencer portal: briefs, assignment answers and profile change requests. */
export class InfluencerPortalStore {
  constructor(private readonly db: Database.Database) {}

  campaignBrief(campaignId: string): CampaignBrief {
    const row = this.db.prepare('SELECT * FROM portal_campaign_briefs WHERE campaignId = ?').get(campaignId) as
      | { campaignId: string; influencerBrief: string | null; requireClientApproval: number }
      | undefined;
    return { campaignId, influencerBrief: row?.influencerBrief ?? null, requireClientApproval: Boolean(row?.requireClientApproval) };
  }

  setCampaignBrief(companyId: string, brief: CampaignBrief): void {
    this.db
      .prepare(
        `INSERT INTO portal_campaign_briefs (campaignId, companyId, influencerBrief, requireClientApproval, updatedAt)
         VALUES (@campaignId, @companyId, @influencerBrief, @requireClientApproval, @updatedAt)
         ON CONFLICT (campaignId) DO UPDATE SET influencerBrief = excluded.influencerBrief,
           requireClientApproval = excluded.requireClientApproval, updatedAt = excluded.updatedAt`,
      )
      .run({ ...brief, companyId, requireClientApproval: brief.requireClientApproval ? 1 : 0, updatedAt: new Date().toISOString() });
  }

  deliverableBrief(deliverableId: string): string | null {
    const row = this.db.prepare('SELECT brief FROM portal_deliverable_briefs WHERE deliverableId = ?').get(deliverableId) as { brief: string | null } | undefined;
    return row?.brief ?? null;
  }

  setDeliverableBrief(companyId: string, deliverableId: string, brief: string | null): void {
    this.db
      .prepare(
        `INSERT INTO portal_deliverable_briefs (deliverableId, companyId, brief, updatedAt) VALUES (?, ?, ?, ?)
         ON CONFLICT (deliverableId) DO UPDATE SET brief = excluded.brief, updatedAt = excluded.updatedAt`,
      )
      .run(deliverableId, companyId, brief, new Date().toISOString());
  }

  responseTo(assignmentId: string): AssignmentResponse | undefined {
    return this.db.prepare('SELECT * FROM portal_assignment_responses WHERE assignmentId = ?').get(assignmentId) as AssignmentResponse | undefined;
  }

  /** False if this assignment already has an answer. */
  addResponse(input: Omit<AssignmentResponse, 'createdAt'> & { companyId: string }): boolean {
    return this.db
      .prepare(
        `INSERT OR IGNORE INTO portal_assignment_responses (assignmentId, companyId, portalUserId, decision, reason, createdAt)
         VALUES (@assignmentId, @companyId, @portalUserId, @decision, @reason, @createdAt)`,
      )
      .run({ ...input, createdAt: new Date().toISOString() }).changes === 1;
  }

  private decode = (row: ChangeRow): ChangeRequest => ({ ...row, changes: JSON.parse(row.changes) as ProfileChanges });

  changeRequests(companyId: string, contactId: string): ChangeRequest[] {
    return (this.db
      .prepare('SELECT * FROM contact_change_requests WHERE companyId = ? AND contactId = ? ORDER BY createdAt DESC, rowid DESC')
      .all(companyId, contactId) as ChangeRow[]).map(this.decode);
  }

  getChangeRequest(id: string): ChangeRequest | undefined {
    const row = this.db.prepare('SELECT * FROM contact_change_requests WHERE id = ?').get(id) as ChangeRow | undefined;
    return row ? this.decode(row) : undefined;
  }

  /** Undefined if one is already pending for this contact (enforced by a partial unique index). */
  addChangeRequest(input: Pick<ChangeRequest, 'companyId' | 'contactId' | 'portalUserId' | 'changes'>): ChangeRequest | undefined {
    const id = uuid();
    try {
      this.db
        .prepare(
          `INSERT INTO contact_change_requests (id, companyId, contactId, portalUserId, changes, status, createdAt)
           VALUES (@id, @companyId, @contactId, @portalUserId, @changes, 'pending', @createdAt)`,
        )
        .run({ ...input, id, changes: JSON.stringify(input.changes), createdAt: new Date().toISOString() });
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') return undefined;
      throw error;
    }
    return this.getChangeRequest(id);
  }

  decideChangeRequest(id: string, input: { status: 'approved' | 'rejected'; note: string | null; userId: string }): boolean {
    return this.db
      .prepare(
        `UPDATE contact_change_requests SET status = @status, note = @note, reviewedByUserId = @userId, reviewedAt = @at
          WHERE id = @id AND status = 'pending'`,
      )
      .run({ ...input, id, at: new Date().toISOString() }).changes === 1;
  }
}
