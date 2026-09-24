# Engagement Games — Design

Date: 2026-09-24
Branch: `feature/peak-portal`
Status: Draft for review
Builds on: `2026-09-21-peak-media-client-portal-design.md` (identity, portals, module switch)

## 1. Problem

Peak Media wants competition-style marketing: a scoreboard that ranks **public
followers** by how they interact (comment, reply, mention, share) with a post or a
set of accounts, presented like a game lobby. An admin creates each game. Games
are public by default, so followers can watch the lobby. An admin can restrict a
game so only people included in it can view it.

Ranked entities are external social identities (`platform:userId`). They are not
TaskFlow users and never log in.

TaskFlow has no social-platform integration or OAuth today, so both data
collection and token storage are new.

## 2. Goals

- An admin builds a game by picking sources, picking **metrics from a catalogue**,
  setting parameters and a time window. No code change per game.
- Scores are deterministic and reproducible from a stored event log.
- A game can be started with metrics that need no platform API, so it is not
  blocked by platform access.
- Public games are visible to everyone; restricted games only to people included in them.
- Each public game states its rules, how points are earned, and any prize.

## 3. Non-goals

- Admin-authored code or scripts. Metrics are chosen and parameterised, never written.
- Real-time scoring. Boards refresh on a polling cadence (minutes).
- Ranking across platforms as one person. Boards are per platform in v1.
- Scraping. Only official APIs and accounts that granted access.
- Prize logistics beyond recording winners (§9).

## 4. Decisions

| Decision | Rationale |
| --- | --- |
| Fetching and scoring are **separate functions**: a *collector* returns raw interactions, a *metric* turns interactions into points | A single "comments function" that calls the platform and scores at once cannot be re-run after a disqualification or a scoring fix without re-fetching and re-hitting rate limits, and cannot be unit-tested without the network. |
| Metrics are **pure functions in code**, chosen by key in a catalogue | Same rule as the permission catalogue: admins configure what exists, they cannot invent it. No network, clock or randomness inside a metric. |
| Interactions go into an **append-only event log**; scores are derived | Scores can be recomputed at any time, and every point traces to an event. |
| A metric is only offered if the chosen sources' collectors supply the actions it needs | The picker cannot promise something the platform cannot deliver (§6). |
| Ingestion runs in a **separate worker process**, the social worker in `backend/src/social/`, shared with influencer stat sync | Polling many sources would otherwise write to SQLite from the API process. Writers still serialise in WAL mode, so the worker writes in batches. |
| `manual_points` is a built-in metric | Staff can award points where data is unavailable (for example Snapchat), and it makes a game usable before any collector exists. |
| Games is a permission module, `games`, switchable per company | Uses the existing module switch: on for Peak, off elsewhere. |
| **Only admins create** (`games:create`); a restricted game is visible only to people included in it | Matches the requirement. Enforced as a record rule for staff and by session for portal users. Public games need no inclusion. |
| **The lobby is public by default** (`visibility = public`); an admin can set a game to `restricted` | Followers are the players, so they must be able to see the board without an account. The interactions are already public on the platform. A restricted game (for example an internal staff contest) is visible only to people in `game_viewers`. Safeguards are in §9. |

## 5. Pipeline

```
Source ──► Collector ──► game_events (append-only, deduplicated)
                               │
        Metric(params) ◄───────┘        one pure function per selected metric
              │
              ▼   points × weight, exclusions applied
         game_scores ──► Scoreboard ──► freeze at end ──► game_results
```

**Collector** (one per platform and source type):

```ts
interface Collector {
  platform: Platform;
  supports: InteractionAction[];               // what it can actually return
  collect(source: GameSource, cursor?: string): Promise<{
    events: InteractionEvent[];
    nextCursor?: string;
  }>;
}

interface InteractionEvent {
  externalId: string;                          // platform's id; dedupe key
  actorKey: string;                            // `${platform}:${platformUserId}`
  actorHandle: string;                         // display only; handles change
  action: 'comment' | 'reply' | 'mention' | 'share' | 'like';
  postRef: string;
  occurredAt: Date;
  textLength?: number;
  textHash?: string;
  excerpt?: string;                            // admin-only, truncated
}
```

**Metric** (pure):

```ts
interface Metric<P> {
  key: string;                                 // 'comments', 'replies', 'mentions', 'manual_points'
  label: { en: string; ar: string };
  requires: InteractionAction[];               // empty for manual_points
  paramsSchema: Schema<P>;
  score(events: InteractionEvent[], params: P): Map<ActorKey, { points: number; detail: unknown }>;
}
```

Initial catalogue. `comments`: points per valid comment, with `maxPerPost`,
`minLength`, `uniqueText`. `replies` and `mentions`: same shape. `manual_points`:
staff-entered awards with a reason. `shares` and `likes` exist as definitions but
are offered only if a collector reports support (for shares, none is expected to).

A game's total is the sum over its metrics of `points × weight`. Ties go to the
actor who reached the score first.

## 6. Collectors and what they can supply

These are hypotheses to be confirmed by the spike (§10, G0), not commitments.

| Platform | Expected v1 support |
| --- | --- |
| Instagram | Comments, replies and mentions on media of accounts that connected to Peak's app. Nothing on arbitrary public posts. Advanced access needs Meta app review, which has lead time. |
| YouTube | Comments and replies on public videos through the Data API, within quota. |
| TikTok, X | Unknown or restricted or paid; decide after the spike. |
| Snapchat | No public comments. `manual_points` only. |
| Shares (any) | Treated as unavailable. |

"A set of accounts" therefore means **connected accounts**: influencers or client
brands authorise Peak's app from their portal. This also gives verified follower
and engagement figures for the catalogue, which addresses self-reported numbers.

`connected_accounts`, including token encryption and refresh, is defined in the
influencer portal design (§5) and shared by both features. Rotating the currently
unrotated secrets is a prerequisite.

## 7. Data model

- `games` — id, companyId, name, description, status (`draft` | `scheduled` |
  `live` | `ended` | `archived`), visibility (`public` | `restricted`, default
  `public`), slug (unique per company), rulesText, prizeText (both stored in
  English and Arabic), startsAt, endsAt, createdByUserId.
- `game_sources` — id, gameId, platform, sourceType (`account` | `post`), ref,
  connectedAccountId, cursor, lastSyncedAt, lastError.
- `game_metrics` — gameId, metricKey, weight, paramsJson.
- `game_events` — id, gameId, sourceId, externalId, actorKey, actorHandle,
  action, postRef, occurredAt, textLength, textHash, excerpt, seenAt.
  `UNIQUE(gameId, externalId)`.
- `game_actor_rules` — gameId, actorKey, kind (`exclude` | `disqualify`), reason,
  byUserId. The source account, Peak and staff handles are excluded automatically.
- `game_awards` — id, gameId, actorKey, points, reason, byUserId (for `manual_points`).
- `game_results` — gameId, actorKey, actorHandle, rank, points, breakdownJson,
  frozenAt. Written once when a game ends.
- `game_viewers` — gameId, subjectType (`user` | `portal_user`), subjectId.
- `connected_accounts` — defined in the influencer portal design; `game_sources`
  reference it.
- `game_hide_requests` — gameId, actorKey, requestedAt, handledByUserId. A follower
  can ask to be hidden from a board; staff apply it as an `exclude` rule.

## 8. Access

- Module `games` in `permissions/catalogue.ts`, actions `view`, `create`, `manage`.
  `create` and `manage` go to the Admin group by default.
- Staff: `view` plus a record rule that limits them to games in `game_viewers`,
  unless they hold `manage`, following `record-rules.ts`.
- Portal users: `/portal-api/<audience>/games` returns public games, plus
  restricted games where they appear in `game_viewers`. Other restricted games
  return 404.
- Public lobby: a third host from the same `portal/` build (route group `(lobby)`),
  served by a read-only, unauthenticated `/public-api/games/*` router. It lists
  public games and, per game, shows rules, how points are earned, the prize, and
  the top 100 by rank, display handle and points, nothing else. Responses are
  cached for about a minute and rate-limited per IP. nginx on that host forwards
  only that prefix. Restricted games return 404 there.
- Neither audience can see `excerpt`, `textHash`, or the exclusion list.

## 9. Integrity, privacy and legal

- **Fraud.** Metric parameters carry per-post caps, minimum length and unique-text
  rules. Admins can exclude or disqualify an actor with a recorded reason. Rules
  apply at scoring time, so no re-fetch is needed.
- **Deleted comments.** Collectors only add events, so a deleted comment would
  keep its points. At game end the worker runs a full resync and marks events no
  longer present as `removed`; results are computed after that.
- **Freeze.** `game_results` is immutable once written. A correction reopens the
  game through an audited admin action.
- **Public data, three safeguards.** The interactions are already public, and the
  lobby shows only handle, rank and points. Platform terms still limit how
  API-obtained data is kept, so: (1) a removed comment loses its points and a
  deleted account's events are purged on the next sync; (2) `excerpt` is short and
  admin-only; (3) a follower can ask to be hidden from a board
  (`game_hide_requests`). The rules text states an age requirement for games with
  prizes.
- **Prizes.** Promotional contests commonly need a permit in Gulf jurisdictions and
  must follow each platform's promotion rules. Get legal sign-off before any game
  with a prize goes live. Winners are recorded in `game_results`; contacting them
  happens through the platform, by staff.

## 10. Phases

**G0 — Feasibility spike (one week, starts now).** For Instagram, YouTube and
TikTok: what can be read, with which account type and permissions, at what limits,
and how long approval takes. Output: a filled-in version of the §6 table and a
decision on the first collector. If nothing viable exists, G1 alone still ships a
usable game on `manual_points`.

**G1 — Core.** Module, migrations, game CRUD, sources, metrics catalogue with
`manual_points`, viewers, scoring and scoreboard, freeze, internal UI, the public
lobby host, and a "Lobby" section in the influencer and client portals. The lobby
ships here because a board followers cannot see is not a game.

**G2 — First collector.** The connect flow for client brand accounts (influencer
connections come from the influencer portal design), the social worker, the first
collector, deletion reconciliation.

**G3 — Winners and moderation.** Winner records, hide requests, disqualification
history view.

**G4 — More collectors and metrics.** Driven by what G0 found.

## 11. Testing

Metrics are pure, so each has table tests: caps, minimum length, duplicates, ties,
exclusions, weights. Collector tests run against recorded fixtures. Idempotency
test: replaying the same events changes no score. Access tests: a non-included
viewer gets 404 for every games endpoint, in both audiences and internally, and
`create` is refused for non-admins. A freeze test proves results do not change
after the end time.

## 12. Inputs needed

1. Whether any game will carry a prize (decides the legal review in §9).
2. Which platforms Peak's influencers mainly use, to order the G0 spike.
3. A Meta developer account owned by Peak, so app review can start.
