# Peak Games — G1 Core

Date: 2026-10-01
Branch: `feature/peak-portal`
Builds on: `2026-09-24-engagement-games-design.md` (G1), roadmap Phase 5.

G1 ships a usable game on `manual_points` alone: no collector, no platform access, no
social worker. Contracts and tests only; code is written against the real files.

## Amendments to the games design, from reading the code (2026-10-01)

1. **No new permission module.** A `games` entry in the shared catalogue would be on
   for every company (modules are on unless disabled) and changes the permission model
   all tenants share. Instead, games exist only for the portal company (routes mount
   only for `PORTAL_COMPANY_ID`), and a record rule `GAMES_MANAGE`
   (`campaigns` / `games.manage`, Admin only, granted to existing built-in groups by
   its migration) gates every staff action, matching "only admins create". Switching
   off Campaigns switches games off.
2. **Status is derived, not stored** (principle 13): `draft` until published, then
   `scheduled`, `live` or `ended` from the clock, or `archived`. Results freeze once,
   the first time an ended game is read or by the hourly sweep, whichever comes first.
3. **Actors without collectors are `platform:handle`** (handle lower-cased). When a
   collector supplies platform user ids (G2), keys switch to ids for new games.
4. **Awards are append-only**; a correction is a negative award with a reason. Nothing
   changes after the freeze except through `reopen`, which needs a reason, deletes the
   frozen results, sets a new end time and is recorded in the activity log.
5. **`game_events`, sources and collectors wait for G2.** Metric functions for
   comments, replies and mentions are written and table-tested now (they are pure), but
   offered only when a game's sources report the actions they need, so G1 offers
   `manual_points` only.
6. **Ties** go to whoever reached their final score first (replaying awards in order).

## Data (migration `092_games`)

`games` (slug unique per company, names/rules/prize in English and Arabic, published,
archived, visibility `public|restricted`, startsAt, endsAt, frozenAt), `game_metrics`,
`game_awards`, `game_actor_rules` (`exclude|disqualify`, reason), `game_results`,
`game_viewers` (`user|portal_user`).

## API

- Staff (`GAMES_MANAGE`): list/create/update, publish, archive, reopen, metrics, awards,
  actor rules, viewers, full scoreboard (with excluded actors flagged and breakdowns).
- Portal (`/portal-api/:audience/games`): public games plus restricted ones the user
  is a viewer of; others 404.
- Public (`/public-api/games`): published public games only; per game the rules, how
  points are earned, the prize and the top 100 (rank, platform, handle, points).
  Rate-limited per address, cached for a minute. Never reasons, excluded actors, award
  authors or viewers.

## Tests

Metric table tests (caps, minimum length, unique text, weights, ties); derived status;
freeze idempotent and immutable; awards refused after freeze; reopen audited; access:
non-admin staff 403, restricted game 404 publicly and for non-viewers in both portals;
the public board's poison fixture (reasons, exclusions, staff names, viewer lists).

## UI

Staff: Games page (list, editor, awards, exclusions, board). Portals: a Lobby page.
Public lobby: a third audience of the `portal/` build (`PORTAL_AUDIENCE=lobby`), no
sign-in, serving only the lobby.
