import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { CampaignAssignment, CampaignDeliverable } from '../types';
import { resultsDto } from '../social/results';
import { clientInvoices } from './billing';

/**
 * Analytics for the portals, computed from records the reader may already see.
 * Clients: verified post results of their own campaigns, and what they paid
 * (their own invoices). Never rates, costs, budgets or anyone else's figures.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CONFIRMED: readonly CampaignAssignment['status'][] = ['Confirmed', 'Completed'];

export interface AnalyticsQuery { from?: unknown; to?: unknown; campaign?: unknown }

const dateParam = (value: unknown, field: string): string | null => {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new HttpError(400, `${field} must be a date (YYYY-MM-DD).`);
  }
  return value;
};

/** Inclusive date range on a publish time. */
export function parseRange(q: AnalyticsQuery) {
  const from = dateParam(q.from, 'from');
  const to = dateParam(q.to, 'to');
  const start = from ? Date.parse(`${from}T00:00:00Z`) : -Infinity;
  const end = to ? Date.parse(`${to}T00:00:00Z`) + DAY_MS : Infinity;
  return { from, to, contains: (iso: Date | string) => { const t = new Date(iso).getTime(); return t >= start && t < end; } };
}

const ratio = (n: number, d: number, digits: number) => (d > 0 ? Number((n / d).toFixed(digits)) : null);

/** Monday of the week (UTC), as YYYY-MM-DD. */
export const weekOf = (iso: Date | string) => {
  const d = new Date(iso);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY_MS);
  return monday.toISOString().slice(0, 10);
};

type Figures = { views: number; likes: number; comments: number; saves: number; shares: number };
const engagementsOf = (f: Figures) => f.likes + f.comments + f.saves + f.shares;

interface Row { campaignId: string; publishedAt: string; platform: string; creator: { name: string; handle: string | null } | null; figures: Figures }

const handleOf = (contact: { influencerAccounts?: Array<{ handle?: string }>; influencerHandle?: string }) =>
  contact.influencerAccounts?.find((a) => a.handle)?.handle ?? contact.influencerHandle ?? null;

const group = <K extends string>(rows: Row[], key: (r: Row) => K | null) => {
  const out = new Map<K, { posts: number; views: number; engagements: number }>();
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue;
    const g = out.get(k) ?? { posts: 0, views: 0, engagements: 0 };
    g.posts += 1; g.views += r.figures.views; g.engagements += engagementsOf(r.figures);
    out.set(k, g);
  }
  return out;
};

export function clientAnalytics(store: DataStore, companyId: string, contactId: string, q: AnalyticsQuery) {
  const range = parseRange(q);
  const campaigns = store.listCrmCampaigns(companyId).filter((c) => c.contactId === contactId && !c.archivedAt);
  const chosen = typeof q.campaign === 'string' && q.campaign ? campaigns.filter((c) => c.id === q.campaign) : campaigns;

  // Every own post with a verified result, with who made it when that creator is confirmed.
  const rowsOf = (campaignIds: Set<string>, inRange: (iso: string) => boolean): Row[] => campaigns
    .filter((c) => campaignIds.has(c.id))
    .flatMap((c) => {
      const confirmed = new Set(store.listCampaignAssignments(c.id)
        .filter((a) => a.role === 'Influencer' && CONFIRMED.includes(a.status)).map((a) => a.contactId));
      return store.listCampaignDeliverables(c.id)
        .filter((d: CampaignDeliverable) => d.status !== 'Cancelled' && d.publishedAt && inRange(new Date(d.publishedAt).toISOString()))
        .flatMap((d) => {
          const r = resultsDto(store, d.id);
          if (!r) return [];
          const who = d.vendorContactId ?? d.contactId;
          const contact = who && confirmed.has(who) ? store.getContactById(who) : undefined;
          return [{
            campaignId: c.id, publishedAt: new Date(d.publishedAt!).toISOString(), platform: d.platform || 'Other',
            creator: contact && contact.roles?.includes('Influencer') ? { name: contact.name, handle: handleOf(contact) } : null,
            figures: { views: r.views, likes: r.likes, comments: r.comments, saves: r.saves, shares: r.shares },
          }];
        });
    });

  const rows = rowsOf(new Set(chosen.map((c) => c.id)), range.contains);
  const sum = (k: keyof Figures) => rows.reduce((s, r) => s + r.figures[k], 0);
  const views = sum('views');
  const engagements = rows.reduce((s, r) => s + engagementsOf(r.figures), 0);

  const weekly = [...group(rows, (r) => weekOf(r.publishedAt)).entries()]
    .sort(([a], [b]) => a.localeCompare(b)).map(([week, g]) => ({ week, views: g.views, engagements: g.engagements }));
  const creators = new Map(rows.filter((r) => r.creator).map((r) => [`${r.creator!.name}|${r.creator!.handle ?? ''}`, r.creator!]));
  const byCreator = [...group(rows, (r) => (r.creator ? `${r.creator.name}|${r.creator.handle ?? ''}` : null)).entries()]
    .map(([k, g]) => ({ name: creators.get(k)!.name, handle: creators.get(k)!.handle, posts: g.posts, views: g.views, engagements: g.engagements, perView: ratio(g.engagements, g.views, 4) }))
    .sort((a, b) => b.views - a.views || a.name.localeCompare(b.name));
  const byPlatform = [...group(rows, (r) => r.platform).entries()]
    .map(([platform, g]) => ({ platform, posts: g.posts, views: g.views, engagements: g.engagements, perView: ratio(g.engagements, g.views, 4) }))
    .sort((a, b) => b.views - a.views || a.platform.localeCompare(b.platform));

  // Cost per result: the campaign's own invoices over its lifetime results, so a
  // date filter never divides a whole invoice by part of what it bought.
  const contact = store.getContactById(contactId);
  const invoices = contact ? clientInvoices(store, companyId, contact) : [];
  const perCampaign = group(rows, (r) => r.campaignId);
  const byCampaign = chosen.filter((c) => perCampaign.has(c.id)).map((c) => {
    const g = perCampaign.get(c.id)!;
    const lifetime = rowsOf(new Set([c.id]), () => true);
    const lViews = lifetime.reduce((s, r) => s + r.figures.views, 0);
    const lEng = lifetime.reduce((s, r) => s + engagementsOf(r.figures), 0);
    const invoiced = new Map<string, number>();
    invoices.filter((i) => i.campaignId === c.id).forEach((i) => invoiced.set(i.currency ?? 'USD', (invoiced.get(i.currency ?? 'USD') ?? 0) + (i.total ?? 0)));
    return {
      id: c.id, name: c.name, posts: g.posts, views: g.views, engagements: g.engagements,
      cost: [...invoiced.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, total]) => ({
        currency, invoiced: Number(total.toFixed(2)), perThousandViews: ratio(total * 1000, lViews, 2), perEngagement: ratio(total, lEng, 2),
      })),
    };
  }).sort((a, b) => b.views - a.views);

  return {
    range: { from: range.from, to: range.to },
    totals: rows.length === 0 ? null : {
      posts: rows.length, views, likes: sum('likes'), comments: sum('comments'), saves: sum('saves'), shares: sum('shares'),
      engagements, perView: ratio(engagements, views, 4),
    },
    weekly, byCreator, byPlatform, byCampaign,
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name })),
  };
}
