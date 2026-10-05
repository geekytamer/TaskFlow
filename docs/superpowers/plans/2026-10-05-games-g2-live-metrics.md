# Games G2 — Live Metrics from Meta (design addendum + plan)

Date: 2026-10-05. Owner's request: game metrics live from Meta data — sharing a post among the participating influencers, commenting, follows. Builds on the games design (§5–§7) and Meta M1 (connected accounts, `MetaClient`).

## What Meta allows (checked 2026-10-05)

- Per person: comments and replies on media of a connected account (webhook `comments` + `/{media}/comments`), and mentions/tags of a connected account (`mentions` webhook, `/{user}/tags`, `/{user}/mentioned_media`).
- Totals only, never who: shares, likes, saves, views per post; followers per account. Follower lists are not available.

## Design

Two game audiences (`games.audience`):

1. **followers** (the public plays): sources are a connected account's posts (`post` source) and the account itself (`tags` source: posts tagging or @mentioning it, which is how a repost of the game post is counted). Metrics: `comments`, `replies`, `mentions` (already pure functions), each with caps, minimum length and unique text. Live: webhooks mark sources for collection; an hourly sweep also collects.
2. **creators** (the participating influencers play): participants are influencer contacts with a connected Instagram account. A participant's game posts are their posts in the game window whose caption contains the game's `tag` (a brand @handle or #hashtag). Metrics from those posts' insights and the participant's snapshots: `creator_shares`, `creator_views`, `creator_engagement` (likes + comments + saves), `follower_growth` (followers now minus at the start). Recomputed each sweep into `game_creator_stats`.

Fairness and integrity: events are append-only and deduplicated by Meta id; at game end a full resync marks comments that disappeared as `removed` before results freeze (a game with sources freezes only after that reconciliation); exclusions apply at scoring; the public board still shows only rank, handle and points.

Webhook endpoint `/social/meta/webhook`: GET verification with `META_WEBHOOK_VERIFY_TOKEN`; POST verified with `X-Hub-Signature-256` (HMAC-SHA256, app secret). Payloads are not trusted for content: a valid event only marks matching sources dirty, and the collector re-reads Meta.

## Tasks

1. Migration 095: `games.audience`, `games.tag`, `games.reconciledAt`; `game_sources`; `game_events`; `game_participants`; `game_creator_stats`.
2. `MetaClient`: `mediaComments`, `taggedMedia`, `recentMedia` (+ fixtures).
3. Collector (`games/collector.ts`): followers sources, creators stats, reconciliation.
4. Scoring: events (minus removed) and creator stats feed `scoreGame`; metrics offered by what the game's audience and sources supply.
5. Webhook route + immediate collection for dirty sources.
6. Staff UI: audience, tag, sources (connected account + post link), participants, metric parameters, sync status, "Collect now".
7. Tests: collector against fixtures (dedupe, replies, mentions, caps), creator stats, reconciliation before freeze, webhook signature and verification, access unchanged.
