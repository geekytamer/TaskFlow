/**
 * Game metrics: pure functions from interactions (or staff awards) to points.
 * No network, clock or randomness, so a board can be recomputed at any time and
 * every point traces to an event or an award. Admins choose and parameterise
 * metrics; they never write them.
 */

export type InteractionAction = 'comment' | 'reply' | 'mention' | 'share' | 'like';

export interface InteractionEvent {
  externalId: string;
  actorKey: string;
  actorHandle: string;
  action: InteractionAction;
  postRef: string;
  occurredAt: Date;
  textLength?: number;
  textHash?: string;
}

/** What a game's sources can supply: interactions by people, or per-creator totals. */
export type Supply = InteractionAction | 'creator_stats';

/** One participating creator's totals over their game posts (creators games). */
export interface CreatorStatInput {
  actorKey: string;
  actorHandle: string;
  views: number;
  shares: number;
  engagement: number;
  followerGrowth: number;
  lastPostAt: Date | null;
}

export interface Award {
  actorKey: string;
  actorHandle: string;
  points: number;
  createdAt: Date;
}

export interface MetricScore {
  points: number;
  /** When the actor last gained or lost points in this metric; settles ties. */
  lastAt: number;
  handle: string;
}

export interface Metric {
  key: string;
  label: { en: string; ar: string };
  /** What a game's sources must supply for this metric to be offered. Empty: always offered. */
  requires: Supply[];
  /** Validates and fills defaults; throws on bad input. */
  params(raw: unknown): Record<string, number | boolean>;
  score(events: InteractionEvent[], params: Record<string, number | boolean>, awards: Award[], stats: CreatorStatInput[]): Map<string, MetricScore>;
}

const num = (raw: Record<string, unknown>, key: string, fallback: number, min: number, max: number) => {
  const v = raw[key] === undefined ? fallback : Number(raw[key]);
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${key} must be between ${min} and ${max}.`);
  return v;
};
const obj = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {});

const add = (map: Map<string, MetricScore>, actorKey: string, handle: string, points: number, at: number) => {
  const current = map.get(actorKey) ?? { points: 0, lastAt: 0, handle };
  map.set(actorKey, { points: current.points + points, lastAt: points !== 0 ? Math.max(current.lastAt, at) : current.lastAt, handle });
};

/** Points per interaction of one kind, with a per-post cap, a minimum length and optional unique text. */
const perInteraction = (key: string, action: InteractionAction, pointsKey: string, label: Metric['label']): Metric => ({
  key,
  label,
  requires: [action],
  params(raw) {
    const r = obj(raw);
    return {
      [pointsKey]: num(r, pointsKey, 1, 0, 1000),
      maxPerPost: num(r, 'maxPerPost', 1000, 1, 1000),
      minLength: num(r, 'minLength', 0, 0, 1000),
      uniqueText: r.uniqueText === undefined ? false : r.uniqueText === true,
    };
  },
  score(events, params) {
    const out = new Map<string, MetricScore>();
    const perPost = new Map<string, number>();
    const seenText = new Map<string, Set<string>>();
    const ordered = events.filter((e) => e.action === action).sort((a, b) => +a.occurredAt - +b.occurredAt || a.externalId.localeCompare(b.externalId));
    for (const e of ordered) {
      if ((e.textLength ?? 0) < Number(params.minLength ?? 0)) continue;
      const postKey = `${e.actorKey}|${e.postRef}`;
      if ((perPost.get(postKey) ?? 0) >= Number(params.maxPerPost ?? 1000)) continue;
      if (params.uniqueText && e.textHash) {
        const seen = seenText.get(e.actorKey) ?? new Set<string>();
        if (seen.has(e.textHash)) continue;
        seen.add(e.textHash);
        seenText.set(e.actorKey, seen);
      }
      perPost.set(postKey, (perPost.get(postKey) ?? 0) + 1);
      add(out, e.actorKey, e.actorHandle, Number(params[pointsKey] ?? 1), +e.occurredAt);
    }
    return out;
  },
});

/**
 * Points from a creator's totals: `value / per × points`, never below zero,
 * optionally capped. Meta gives shares, views and follower counts only as
 * totals, so these score creators, not the people who shared or followed.
 */
const perCreatorTotal = (key: string, field: 'views' | 'shares' | 'engagement' | 'followerGrowth', pointsKey: string, per: number, label: Metric['label']): Metric => ({
  key,
  label,
  requires: ['creator_stats'],
  params(raw) {
    const r = obj(raw);
    return { [pointsKey]: num(r, pointsKey, 1, 0, 1000), maxPoints: num(r, 'maxPoints', 0, 0, 1_000_000) };
  },
  score(_events, params, _awards, stats) {
    const out = new Map<string, MetricScore>();
    const cap = Number(params.maxPoints ?? 0);
    for (const s of stats) {
      const raw = (Math.max(0, s[field]) / per) * Number(params[pointsKey] ?? 1);
      const points = Number((cap > 0 ? Math.min(raw, cap) : raw).toFixed(2));
      add(out, s.actorKey, s.actorHandle, points, s.lastPostAt ? +s.lastPostAt : 0);
    }
    return out;
  },
});

export const METRICS: Record<string, Metric> = {
  manual_points: {
    key: 'manual_points',
    label: { en: 'Points awarded by the team', ar: 'نقاط يمنحها الفريق' },
    requires: [],
    params: () => ({}),
    score(_events, _params, awards) {
      const out = new Map<string, MetricScore>();
      [...awards].sort((a, b) => +a.createdAt - +b.createdAt).forEach((a) => add(out, a.actorKey, a.actorHandle, a.points, +a.createdAt));
      return out;
    },
  },
  comments: perInteraction('comments', 'comment', 'pointsPerComment', { en: 'Points per comment', ar: 'نقاط لكل تعليق' }),
  replies: perInteraction('replies', 'reply', 'pointsPerReply', { en: 'Points per reply', ar: 'نقاط لكل رد' }),
  mentions: perInteraction('mentions', 'mention', 'pointsPerMention', { en: 'Points per mention or tag', ar: 'نقاط لكل إشارة أو وسم' }),
  creator_shares: perCreatorTotal('creator_shares', 'shares', 'pointsPerShare', 1, { en: 'Points per share of the creator’s game posts', ar: 'نقاط لكل مشاركة لمنشورات المسابقة' }),
  creator_views: perCreatorTotal('creator_views', 'views', 'pointsPer1000Views', 1000, { en: 'Points per 1,000 views of game posts', ar: 'نقاط لكل ١٠٠٠ مشاهدة لمنشورات المسابقة' }),
  creator_engagement: perCreatorTotal('creator_engagement', 'engagement', 'pointsPerEngagement', 1, { en: 'Points per like, comment or save on game posts', ar: 'نقاط لكل إعجاب أو تعليق أو حفظ' }),
  follower_growth: perCreatorTotal('follower_growth', 'followerGrowth', 'pointsPerFollower', 1, { en: 'Points per new follower during the game', ar: 'نقاط لكل متابع جديد خلال المسابقة' }),
};

/** Metrics a game can use, given what its sources can supply. */
export const offeredMetrics = (supplied: Supply[]) =>
  Object.values(METRICS).filter((m) => m.requires.every((a) => supplied.includes(a)));

export interface BoardRow {
  rank: number;
  actorKey: string;
  handle: string;
  points: number;
  breakdown: Record<string, number>;
}

/**
 * Sum of points × weight over the game's metrics, excluded actors removed.
 * Ties go to whoever settled on their final score first.
 */
export function scoreGame(input: {
  metrics: Array<{ metricKey: string; weight: number; params: Record<string, number | boolean> }>;
  events: InteractionEvent[];
  awards: Award[];
  excluded: Set<string>;
  stats?: CreatorStatInput[];
}): BoardRow[] {
  const totals = new Map<string, { handle: string; points: number; lastAt: number; breakdown: Record<string, number> }>();
  for (const m of input.metrics) {
    const metric = METRICS[m.metricKey];
    if (!metric) continue;
    for (const [actorKey, s] of metric.score(input.events, m.params, input.awards, input.stats ?? [])) {
      const t = totals.get(actorKey) ?? { handle: s.handle, points: 0, lastAt: 0, breakdown: {} };
      const weighted = s.points * m.weight;
      t.points += weighted;
      t.breakdown[m.metricKey] = (t.breakdown[m.metricKey] ?? 0) + weighted;
      t.lastAt = Math.max(t.lastAt, s.lastAt);
      t.handle = s.handle;
      totals.set(actorKey, t);
    }
  }
  return [...totals.entries()]
    .filter(([actorKey, t]) => !input.excluded.has(actorKey) && t.points > 0)
    .sort(([ak, a], [bk, b]) => b.points - a.points || a.lastAt - b.lastAt || ak.localeCompare(bk))
    .map(([actorKey, t], i) => ({ rank: i + 1, actorKey, handle: t.handle, points: Number(t.points.toFixed(2)), breakdown: t.breakdown }));
}
