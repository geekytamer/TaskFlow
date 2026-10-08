import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { isUniqueViolation } from './common';

export type ReviewDecision = 'approved' | 'changes_requested';
export const reviewDecisions: readonly ReviewDecision[] = ['approved', 'changes_requested'];

export interface DeliverableReview {
  id: string;
  companyId: string;
  deliverableId: string;
  contentUrl: string;
  reviewerKind: 'client';
  portalUserId: string | null;
  decision: ReviewDecision;
  comment: string | null;
  createdAt: string;
}


export class DeliverableReviewsStore {
  constructor(private readonly db: Database.Database) {}

  /** The client's review of this exact content link, if any. */
  clientReviewOf(deliverableId: string, contentUrl: string): DeliverableReview | undefined {
    return this.db
      .prepare("SELECT * FROM deliverable_reviews WHERE deliverableId = ? AND contentUrl = ? AND reviewerKind = 'client'")
      .get(deliverableId, contentUrl) as DeliverableReview | undefined;
  }

  /** Every client review of this deliverable, newest first. */
  clientReviewsOf(deliverableId: string): DeliverableReview[] {
    return this.db
      .prepare("SELECT * FROM deliverable_reviews WHERE deliverableId = ? AND reviewerKind = 'client' ORDER BY createdAt DESC, rowid DESC")
      .all(deliverableId) as DeliverableReview[];
  }

  /** Returns undefined if this version already has a client review. */
  addClientReview(input: Omit<DeliverableReview, 'id' | 'createdAt' | 'reviewerKind'>): DeliverableReview | undefined {
    const review: DeliverableReview = { ...input, id: uuid(), reviewerKind: 'client', createdAt: new Date().toISOString() };
    try {
      this.db
        .prepare(
          `INSERT INTO deliverable_reviews (id, companyId, deliverableId, contentUrl, reviewerKind, portalUserId, decision, comment, createdAt)
           VALUES (@id, @companyId, @deliverableId, @contentUrl, @reviewerKind, @portalUserId, @decision, @comment, @createdAt)`,
        )
        .run(review);
    } catch (error) {
      if (isUniqueViolation(error)) return undefined;
      throw error;
    }
    return review;
  }
}
