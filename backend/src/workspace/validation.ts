import { HttpError } from '../http';
import {
  WS_CONTACT_KINDS, WS_DEAL_STATUSES, WS_DELIVERABLE_STATUSES,
  type ContactInput, type DealInput, type DeliverableInput,
} from './workspace-store';

/** Parses workspace request bodies. `partial` accepts any subset of fields (updates); otherwise required fields must be present. */

type Body = Record<string, unknown>;

const has = (body: Body, key: string) => Object.prototype.hasOwnProperty.call(body, key);

export function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${field} is required.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `${field} can be at most ${max} characters.`);
  return trimmed;
}

/** An optional text field: empty or null clears it. */
function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  return text(value, field, max);
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new HttpError(400, `${field} must be one of ${allowed.join(', ')}.`);
  return value as T;
}

export function currency(value: unknown, field = 'currency'): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) throw new HttpError(400, `${field} must be a three-letter currency code, like OMR.`);
  return value;
}

/** A calendar date, YYYY-MM-DD, that exists. */
export function day(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${field} must be a date like 2026-11-01.`);
  }
  return value;
}

export function money(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e12) throw new HttpError(400, `${field} must be zero or more.`);
  return Math.round(n * 1000) / 1000;
}

export function parseContact(body: Body, partial = false): Partial<ContactInput> {
  const out: Partial<ContactInput> = {};
  if (!partial || has(body, 'name')) out.name = text(body.name, 'name', 120);
  if (!partial || has(body, 'kind')) out.kind = oneOf(body.kind, 'kind', WS_CONTACT_KINDS);
  if (has(body, 'company')) out.company = optionalText(body.company, 'company', 120);
  if (has(body, 'email')) {
    out.email = optionalText(body.email, 'email', 200);
    if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new HttpError(400, 'email is not a valid address.');
  }
  if (has(body, 'phone')) out.phone = optionalText(body.phone, 'phone', 40);
  if (has(body, 'notes')) out.notes = optionalText(body.notes, 'notes', 4000);
  return out;
}

export function parseDeal(body: Body, partial = false): Partial<DealInput> {
  const out: Partial<DealInput> = {};
  if (!partial || has(body, 'title')) out.title = text(body.title, 'title', 160);
  if (!partial || has(body, 'status')) out.status = oneOf(body.status, 'status', WS_DEAL_STATUSES);
  if (has(body, 'currency')) out.currency = currency(body.currency);
  if (has(body, 'amount')) out.amount = money(body.amount, 'amount');
  if (has(body, 'wsContactId')) out.wsContactId = typeof body.wsContactId === 'string' && body.wsContactId ? body.wsContactId : null;
  if (has(body, 'startDate')) out.startDate = day(body.startDate, 'startDate');
  if (has(body, 'endDate')) out.endDate = day(body.endDate, 'endDate');
  if (has(body, 'notes')) out.notes = optionalText(body.notes, 'notes', 4000);
  return out;
}

export function checkDealDates(deal: { startDate?: string | null; endDate?: string | null }) {
  if (deal.startDate && deal.endDate && deal.endDate < deal.startDate) throw new HttpError(400, 'The end date is before the start date.');
}

export function parseDeliverable(body: Body, partial = false): Partial<DeliverableInput> {
  const out: Partial<DeliverableInput> = {};
  if (!partial || has(body, 'title')) out.title = text(body.title, 'title', 160);
  if (has(body, 'platform')) out.platform = optionalText(body.platform, 'platform', 40);
  if (has(body, 'dueDate')) out.dueDate = day(body.dueDate, 'dueDate');
  if (has(body, 'status')) out.status = oneOf(body.status, 'status', WS_DELIVERABLE_STATUSES);
  if (has(body, 'postUrl')) {
    out.postUrl = optionalText(body.postUrl, 'postUrl', 2000);
    if (out.postUrl && !/^https?:\/\//i.test(out.postUrl)) throw new HttpError(400, 'postUrl must be an http or https link.');
  }
  return out;
}
