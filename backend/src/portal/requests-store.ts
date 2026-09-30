import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

export interface CampaignRequestRecord {
  id: string;
  companyId: string;
  contactId: string;
  portalUserId: string;
  title: string;
  objective: string;
  budget: number | null;
  startDate: string | null;
  endDate: string | null;
  platforms: string[];
  influencerIds: string[];
  opportunityId: string;
  createdAt: string;
}

export interface ProposalResponse {
  proposalId: string;
  portalUserId: string;
  decision: 'accepted' | 'declined';
  reason: string | null;
  createdAt: string;
}

type RequestRow = Omit<CampaignRequestRecord, 'platforms' | 'influencerIds'> & { platforms: string };

/** Storage for portal campaign requests. Status is not stored: see requests.ts. */
export class PortalRequestsStore {
  constructor(private readonly db: Database.Database) {}

  create(input: Omit<CampaignRequestRecord, 'id' | 'createdAt'>): CampaignRequestRecord {
    const id = uuid();
    const createdAt = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO portal_campaign_requests
             (id, companyId, contactId, portalUserId, title, objective, budget, startDate, endDate, platforms, opportunityId, createdAt)
           VALUES (@id, @companyId, @contactId, @portalUserId, @title, @objective, @budget, @startDate, @endDate, @platforms, @opportunityId, @createdAt)`,
        )
        .run({ ...input, id, createdAt, platforms: JSON.stringify(input.platforms) });
      const insert = this.db.prepare('INSERT INTO portal_request_influencers (requestId, contactId, position) VALUES (?, ?, ?)');
      input.influencerIds.forEach((contactId, position) => insert.run(id, contactId, position));
    })();
    return this.get(id)!;
  }

  get(id: string): CampaignRequestRecord | undefined {
    const row = this.db.prepare('SELECT * FROM portal_campaign_requests WHERE id = ?').get(id) as RequestRow | undefined;
    return row ? this.decode(row) : undefined;
  }

  listFor(companyId: string, contactId: string): CampaignRequestRecord[] {
    return (this.db
      .prepare('SELECT * FROM portal_campaign_requests WHERE companyId = ? AND contactId = ? ORDER BY createdAt DESC, rowid DESC')
      .all(companyId, contactId) as RequestRow[]).map((row) => this.decode(row));
  }

  recordResponse(response: Omit<ProposalResponse, 'createdAt'>): ProposalResponse {
    const createdAt = new Date().toISOString();
    this.db
      .prepare('INSERT INTO portal_proposal_responses (proposalId, portalUserId, decision, reason, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(response.proposalId, response.portalUserId, response.decision, response.reason, createdAt);
    return { ...response, createdAt };
  }

  responseFor(proposalId: string): ProposalResponse | undefined {
    return this.db.prepare('SELECT * FROM portal_proposal_responses WHERE proposalId = ?').get(proposalId) as
      | ProposalResponse
      | undefined;
  }

  private decode(row: RequestRow): CampaignRequestRecord {
    const influencerIds = (this.db
      .prepare('SELECT contactId FROM portal_request_influencers WHERE requestId = ? ORDER BY position ASC')
      .all(row.id) as Array<{ contactId: string }>).map((r) => r.contactId);
    let platforms: string[] = [];
    try {
      const parsed = JSON.parse(row.platforms);
      if (Array.isArray(parsed)) platforms = parsed.filter((p): p is string => typeof p === 'string');
    } catch {
      platforms = [];
    }
    return { ...row, platforms, influencerIds };
  }
}
