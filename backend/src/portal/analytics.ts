import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { CampaignAssignment, CampaignDeliverable } from '../types';
import { resultsDto } from '../social/results';
import { clientInvoices } from './billing';
import { payoutsFor } from './payouts';

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
    // What the client was actually charged: the invoice less any credit notes against it.
    invoices.filter((i) => i.campaignId === c.id).forEach((i) => invoiced.set(i.currency ?? 'USD', (invoiced.get(i.currency ?? 'USD') ?? 0) + (i.total ?? 0) - (i.creditedAmount ?? 0)));
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

const mean = (rows: Figures[]): Figures | null => rows.length === 0 ? null : {
  views: Math.round(rows.reduce((s, r) => s + r.views, 0) / rows.length),
  likes: Math.round(rows.reduce((s, r) => s + r.likes, 0) / rows.length),
  comments: Math.round(rows.reduce((s, r) => s + r.comments, 0) / rows.length),
  saves: Math.round(rows.reduce((s, r) => s + r.saves, 0) / rows.length),
  shares: Math.round(rows.reduce((s, r) => s + r.shares, 0) / rows.length),
};

/**
 * An influencer's own figures: their connected account's daily snapshots, the
 * results of posts they were paid for, and their own payouts. Never a benchmark,
 * another creator's numbers, or what the client pays.
 */
export function influencerAnalytics(store: DataStore, companyId: string, contactId: string, currency: string, q: AnalyticsQuery) {
  const range = parseRange(q);
  const accounts = store.social.accountsFor(companyId, contactId).filter((a) => a.status === 'active' || a.status === 'needs_reconnect');
  // Growth follows one account: adding a second account's followers on the day
  // it was connected would read as a gain. Prefer an active one with the longest history.
  const account = [...accounts]
    .map((a) => ({ a, n: store.social.snapshots(a.id).length }))
    .sort((x, y) => Number(y.a.status === 'active') - Number(x.a.status === 'active') || y.n - x.n)[0]?.a;

  let growth: { days: Array<{ date: string; followers: number; reach: number; views: number; engaged: number }>; change: { followers: number; reach: number; views: number; engaged: number } | null } | null = null;
  let audience = null;
  if (accounts.length > 0) {
    const byDay = new Map<string, { followers: number; reach: number; views: number; engaged: number }>();
    const all = store.social.snapshots(account!.id);
    for (const s of all) {
      if (!range.contains(`${s.takenOn}T12:00:00Z`)) continue;
      const d = byDay.get(s.takenOn) ?? { followers: 0, reach: 0, views: 0, engaged: 0 };
      d.followers += s.followers; d.reach += s.reach; d.views += s.views; d.engaged += s.engagedAccounts;
      byDay.set(s.takenOn, d);
    }
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, ...d }));
    const first = days[0];
    const last = days[days.length - 1];
    growth = {
      days,
      change: first ? { followers: last.followers - first.followers, reach: last.reach - first.reach, views: last.views - first.views, engaged: last.engaged - first.engaged } : null,
    };
    audience = [...all].sort((a, b) => a.takenOn.localeCompare(b.takenOn)).reverse().find((s) => s.demographics)?.demographics ?? null;
  }

  const posts = store.influencer.paidDeliverableIdsOf(companyId, contactId)
    .map((id) => store.getCampaignDeliverableById(id))
    .filter((d): d is CampaignDeliverable => Boolean(d && d.status !== 'Cancelled' && d.publishedAt && range.contains(d.publishedAt)))
    .map((d) => {
      const checkpoints: Partial<Record<'24h' | '7d' | '30d', Figures>> = {};
      for (const r of store.social.mediaResults(d.id)) checkpoints[r.checkpoint] = { views: r.views, likes: r.likes, comments: r.comments, saves: r.saves, shares: r.shares };
      const latest = checkpoints['30d'] ?? checkpoints['7d'] ?? checkpoints['24h'] ?? null;
      return { id: d.id, title: d.title, campaign: store.getCrmCampaignById(d.campaignId)?.name ?? null, publishedAt: new Date(d.publishedAt!).toISOString(), checkpoints, latest };
    })
    .filter((p) => p.latest)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  // Paid money sits in the month it was paid; money still to come in the month it is due.
  const months = new Map<string, { month: string; currency: string; paid: number; pending: number }>();
  for (const p of payoutsFor(store, companyId, contactId, currency)) {
    const when = p.status === 'paid' ? p.paidAt ?? p.dueDate : p.dueDate;
    if (!when || !range.contains(when)) continue;
    const key = `${when.slice(0, 7)}|${p.currency}`;
    const m = months.get(key) ?? { month: when.slice(0, 7), currency: p.currency, paid: 0, pending: 0 };
    if (p.status === 'paid') m.paid += p.amount; else m.pending += p.amount;
    months.set(key, m);
  }

  return {
    range: { from: range.from, to: range.to },
    growth,
    audience,
    posts: posts.map(({ latest: _latest, ...p }) => p),
    averages: mean(posts.map((p) => p.latest!)),
    earnings: [...months.values()].sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency))
      .map((m) => ({ ...m, paid: Number(m.paid.toFixed(2)), pending: Number(m.pending.toFixed(2)) })),
  };
}
