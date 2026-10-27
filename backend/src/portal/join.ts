import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { asRecord } from '../validation';
import { raiseFollowup } from './common';

/**
 * "Register your company" from the public join page. Each request becomes a
 * Lead contact, an opportunity and a high-priority follow-up, and the
 * company's admins and managers are told. Nothing is created for the sender:
 * staff check the lead and send the portal invitation themselves.
 *
 * Abuse guards: a hidden `website` field that people never fill (a filled one
 * is accepted silently and dropped), a cap of 30 requests an hour for the
 * whole endpoint, and short, plain fields only.
 */

const BUDGETS = { b1: 'Under 500 a month', b2: '500 to 1,500 a month', b3: '1,500 to 5,000 a month', b4: 'Over 5,000 a month', b0: 'Not sure yet' } as const;
type BudgetKey = keyof typeof BUDGETS;

export interface JoinRequest {
  company: string;
  name: string;
  phone: string;
  email: string | null;
  industry: string | null;
  city: string | null;
  budget: BudgetKey | null;
  notes: string | null;
}

function text(body: Record<string, unknown>, key: string, max: number, required = false): string | null {
  const raw = body[key];
  if (raw !== undefined && raw !== null && typeof raw !== 'string') throw new HttpError(400, `${key} must be text.`);
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!value) {
    if (required) throw new HttpError(400, `${key} is required.`);
    return null;
  }
  if (value.length > max) throw new HttpError(400, `${key} is too long.`);
  return value;
}

export function parseJoin(input: unknown): JoinRequest {
  const body = asRecord(input, 'body');
  const phone = text(body, 'phone', 30, true)!;
  if (!/^\+?[\d\s()-]{6,30}$/.test(phone) || phone.replace(/\D/g, '').length < 6) throw new HttpError(400, 'phone is not a phone number.');
  const email = text(body, 'email', 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'email is not an email address.');
  const budget = text(body, 'budget', 4);
  if (budget && !(budget in BUDGETS)) throw new HttpError(400, 'budget is not one of the choices.');
  // Notes keep their line breaks; everything else is one line.
  const rawNotes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (rawNotes.length > 1000) throw new HttpError(400, 'notes is too long.');
  return {
    company: text(body, 'company', 120, true)!,
    name: text(body, 'name', 80, true)!,
    phone,
    email,
    industry: text(body, 'industry', 60),
    city: text(body, 'city', 60),
    budget: (budget as BudgetKey | null) ?? null,
    notes: rawNotes || null,
  };
}

export function joinNotes(join: JoinRequest): string {
  return [
    'Registration request from the portal join page.',
    `Company: ${join.company}`,
    `Contact person: ${join.name}`,
    `Phone / WhatsApp: ${join.phone}`,
    join.email && `Email: ${join.email}`,
    join.industry && `Industry: ${join.industry}`,
    join.city && `City: ${join.city}`,
    join.budget && `Monthly marketing budget: ${BUDGETS[join.budget]}`,
    join.notes && `Notes:\n${join.notes}`,
  ].filter(Boolean).join('\n');
}

export function createPublicJoinRouter(store: DataStore, companyId: string, options: { enforceRateLimits: boolean }): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
    // One bucket for everyone: the portal server forwards every visitor, so per-IP would mean nothing here.
    keyGenerator: () => 'join',
    skip: () => !options.enforceRateLimits, message: { message: 'Too many requests. Please try again later.' },
  });
  router.post('/join', limiter, (req: Request, res: Response, next) => {
    try {
      const body = asRecord(req.body, 'body');
      if (typeof body.website === 'string' && body.website.trim()) return res.status(201).json({ ok: true });
      const join = parseJoin(body);
      const notes = joinNotes(join);
      const staff = store.getUsersByCompany(companyId)
        .filter((u) => (u.companyRoles ?? []).some((r) => r.companyId === companyId && (r.role === 'Admin' || r.role === 'Manager')));
      store.transaction(() => store.runAsActor({ name: 'Portal join page' }, () => {
        const contact = store.createContact({
          companyId,
          kind: 'Organization',
          name: join.company,
          contactPerson: join.name,
          phone: join.phone,
          email: join.email ?? undefined,
          location: join.city ?? undefined,
          roles: ['Lead'],
          leadStatus: 'New',
          leadSource: 'Website',
          priority: 'High',
          tags: ['portal-signup'],
          notes,
        });
        const opportunity = store.createOpportunity({
          companyId,
          contactId: contact.id,
          title: `Portal sign-up: ${join.company}`,
          serviceType: 'Portal sign-up',
          stage: 'New',
          expectedRevenue: 0,
          probability: 0,
          notes,
        });
        const followup = raiseFollowup(store, {
          companyId, entityType: 'opportunity', entityId: opportunity.id,
          title: `Call ${join.company} about their portal registration`, priority: 'high', dueDays: 1,
          notes: `${join.name}, ${join.phone}`, sourceTrigger: 'portal_signup', sourceType: 'portal_join_request', sourceId: contact.id,
        });
        if (staff.length) {
          store.notify({
            companyId,
            userIds: staff.map((u) => u.id),
            type: 'followup_assigned',
            title: `New portal registration: ${join.company}`,
            body: `${join.name}, ${join.phone}`,
            data: { tKey: 'notif.followupAssigned.t', name: `New portal registration: ${join.company}` },
            link: `/contacts/${contact.id}`,
            entityType: 'follow_up',
            entityId: followup.id,
          });
        }
      }));
      res.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
