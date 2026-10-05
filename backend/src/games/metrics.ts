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
  /** Offered when sources supply at least one of these (in addition to `requires`). */
  requiresAny?: Supply[];
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

const ACTION_DEFAULTS: Record<'comment' | 'reply' | 'mention' | 'like', number> = { comment: 1, reply: 0.5, mention: 3, like: 0.25 };

/**
 * One metric weighing every kind of interaction: points per action, the same
 * quality rules for written ones, diminishing returns for repeats on a post,
 * and an optional daily cap per person so a game rewards breadth over spam.
 */
const weightedInteractions: Metric = {
  key: 'weighted_interactions',
  label: { en: 'Weighted interactions', ar: 'تفاعلات موزونة' },
  requires: [],
  requiresAny: ['comment', 'reply', 'mention', 'like'],
  params(raw) {
    const r = obj(raw);
    return {
      comment: num(r, 'comment', ACTION_DEFAULTS.comment, 0, 100),
      reply: num(r, 'reply', ACTION_DEFAULTS.reply, 0, 100),
      mention: num(r, 'mention', ACTION_DEFAULTS.mention, 0, 100),
      like: num(r, 'like', ACTION_DEFAULTS.like, 0, 100),
      minLength: num(r, 'minLength', 3, 0, 1000),
      uniqueText: r.uniqueText === undefined ? true : r.uniqueText === true,
      maxPerPost: num(r, 'maxPerPost', 10, 1, 1000),
      diminishing: num(r, 'diminishing', 0.7, 0.1, 1),
      dailyCap: num(r, 'dailyCap', 0, 0, 100000),
    };
  },
  score(events, params) {
    const out = new Map<string, MetricScore>();
    const perPost = new Map<string, number>();
    const perDay = new Map<string, number>();
    const seenText = new Map<string, Set<string>>();
    const cap = Number(params.dailyCap ?? 0);
    const ordered = events.filter((e) => e.action in ACTION_DEFAULTS).sort((a, b) => +a.occurredAt - +b.occurredAt || a.externalId.localeCompare(b.externalId));
    for (const e of ordered) {
      const written = e.action === 'comment' || e.action === 'reply';
      if (written && (e.textLength ?? 0) < Number(params.minLength ?? 0)) continue;
      if (written && params.uniqueText && e.textHash) {
        const seen = seenText.get(e.actorKey) ?? new Set<string>();
        if (seen.has(e.textHash)) continue;
        seen.add(e.textHash);
        seenText.set(e.actorKey, seen);
      }
      const postKey = `${e.actorKey}|${e.action}|${e.postRef}`;
      const n = perPost.get(postKey) ?? 0;
      if (n >= Number(params.maxPerPost ?? 10)) continue;
      perPost.set(postKey, n + 1);
      let points = Number(params[e.action] ?? 0) * Number(params.diminishing ?? 1) ** n;
      if (cap > 0) {
        const dayKey = `${e.actorKey}|${e.occurredAt.toISOString().slice(0, 10)}`;
        const used = perDay.get(dayKey) ?? 0;
        points = Math.min(points, cap - used);
        perDay.set(dayKey, used + Math.max(0, points));
      }
      if (points > 0) add(out, e.actorKey, e.actorHandle, Number(points.toFixed(4)), +e.occurredAt);
    }
    return out;
  },
};

/**
 * The first N people to like each post: the first gets `pointsFirst`, the Nth
 * `pointsLast`, linearly between. Order is when each liker was first seen.
 */
const firstLikers: Metric = {
  key: 'first_likers',
  label: { en: 'First likers of each post', ar: 'أوائل المعجبين بكل منشور' },
  requires: ['like'],
  params(raw) {
    const r = obj(raw);
    return { n: num(r, 'n', 100, 1, 10000), pointsFirst: num(r, 'pointsFirst', 10, 0, 1000), pointsLast: num(r, 'pointsLast', 1, 0, 1000) };
  },
  score(events, params) {
    const out = new Map<string, MetricScore>();
    const n = Number(params.n ?? 100);
    const first = Number(params.pointsFirst ?? 10);
    const last = Number(params.pointsLast ?? 1);
    const byPost = new Map<string, InteractionEvent[]>();
    events.filter((e) => e.action === 'like').forEach((e) => byPost.set(e.postRef, [...(byPost.get(e.postRef) ?? []), e]));
    for (const likes of byPost.values()) {
      const seen = new Set<string>();
      const ordered = likes.sort((a, b) => +a.occurredAt - +b.occurredAt || a.externalId.localeCompare(b.externalId))
        .filter((e) => (seen.has(e.actorKey) ? false : (seen.add(e.actorKey), true)))
        .slice(0, n);
      ordered.forEach((e, i) => add(out, e.actorKey, e.actorHandle, Number((n === 1 ? first : first - ((first - last) * i) / (n - 1)).toFixed(4)), +e.occurredAt));
    }
    return out;
  },
};

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
  likes: perInteraction('likes', 'like', 'pointsPerLike', { en: 'Points per like (from an imported likers list)', ar: 'نقاط لكل إعجاب (من قائمة مستوردة)' }),
  weighted_interactions: weightedInteractions,
  first_likers: firstLikers,
  creator_shares: perCreatorTotal('creator_shares', 'shares', 'pointsPerShare', 1, { en: 'Points per share of the creator’s game posts', ar: 'نقاط لكل مشاركة لمنشورات المسابقة' }),
  creator_views: perCreatorTotal('creator_views', 'views', 'pointsPer1000Views', 1000, { en: 'Points per 1,000 views of game posts', ar: 'نقاط لكل ١٠٠٠ مشاهدة لمنشورات المسابقة' }),
  creator_engagement: perCreatorTotal('creator_engagement', 'engagement', 'pointsPerEngagement', 1, { en: 'Points per like, comment or save on game posts', ar: 'نقاط لكل إعجاب أو تعليق أو حفظ' }),
  follower_growth: perCreatorTotal('follower_growth', 'followerGrowth', 'pointsPerFollower', 1, { en: 'Points per new follower during the game', ar: 'نقاط لكل متابع جديد خلال المسابقة' }),
};

/** Metrics a game can use, given what its sources can supply. */
export const offeredMetrics = (supplied: Supply[]) =>
  Object.values(METRICS).filter((m) => m.requires.every((a) => supplied.includes(a)) && (!m.requiresAny || m.requiresAny.some((a) => supplied.includes(a))));

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
