# Engagement Games — Design

Date: 2026-09-24
Branch: `feature/peak-portal`
Status: Draft for review
Builds on: `2026-09-21-peak-media-client-portal-design.md` (identity, portals, module switch)

## 1. Problem

Peak Media wants competition-style marketing: a scoreboard that ranks **public
followers** by how they interact (comment, reply, mention, share) with a post or a
set of accounts, presented like a game lobby. An admin creates each game. Other
people can view a game only if they are included in it.

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
- Viewers see only games they are included in.

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
| Ingestion runs in a **separate worker process** | Polling many sources would otherwise write to SQLite from the API process. Writers still serialise in WAL mode, so the worker writes in batches. |
| `manual_points` is a built-in metric | Staff can award points where data is unavailable (for example Snapchat), and it makes a game usable before any collector exists. |
| Games is a permission module, `games`, switchable per company | Uses the existing module switch: on for Peak, off elsewhere. |
| **Only admins create** (`games:create`); everyone else's view is limited to games they are in | Matches the requirement. Enforced as a record rule for staff and by session for portal users. |
| Public lobby is off by default, on per game | Showing public users' handles on an open page has privacy and minors implications (§9). Default is viewers-only. |

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

`connected_accounts` stores tokens **encrypted at rest** (AES-256-GCM, key from an
environment variable that is not in git). Rotating the currently unrotated
secrets is a prerequisite.

## 7. Data model

- `games` — id, companyId, name, description, status (`draft` | `scheduled` |
  `live` | `ended` | `archived`), startsAt, endsAt, publicSlug (null unless the
  public lobby is on), createdByUserId.
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
- `connected_accounts` — id, companyId, ownerType (`contact` | `client`), ownerId,
  platform, externalAccountId, tokenEncrypted, scopes, expiresAt, status.

## 8. Access

- Module `games` in `permissions/catalogue.ts`, actions `view`, `create`, `manage`.
  `create` and `manage` go to the Admin group by default.
- Staff: `view` plus a record rule that limits them to games in `game_viewers`,
  unless they hold `manage`, following `record-rules.ts`.
- Portal users: `/portal-api/<audience>/games` returns only games where they
  appear in `game_viewers`. Other games return 404.
- Public lobby: `GET /public/games/:publicSlug`, read-only, unauthenticated, only
  when the game has a slug. Shows rank, display handle and points, nothing else.
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
- **Personal data.** Public handles and comment text are personal data. Store only
  what scoring needs, keep `excerpt` short and admin-only, and honour removal
  requests. Followers may be minors; a public board with prizes needs a decision on
  age rules.
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
`manual_points`, viewers, scoring and scoreboard, freeze, internal UI, and a
"Lobby" section in the influencer and client portals.

**G2 — First collector.** `connected_accounts` with encryption, the connect flow in
the portal, the worker process, the first collector, deletion reconciliation.

**G3 — Public lobby.** Per-game public page with privacy controls; winner records.

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
