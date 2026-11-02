# Influencers: quick add, no duplicates — Design

Date: 2026-11-02
Status: owner chose "bundle 1" from the influencer review ("ابدأ بالحزمة 1"); standing rule "decide, don't ask", so the decisions below are mine and recorded here.

## 1. Goal

Adding many influencers (celebrities included) should be fast and should never create the same person twice. Today:

- "Add influencer" asks for a name and contact details only; platform, handle and figures need a second step (Edit).
- CSV import always creates. Importing the same file twice doubles every influencer, and a row holds one platform only.
- A Discover profile cannot become one of Peak's influencers; staff create a record by hand and then link it.
- Nothing stops two records with the same @handle.

## 2. Decisions

**Duplicate guard.**
- An influencer account's key is `platform + handle`: handle lower-cased, without `@`, read from the URL when only a link is given. Keys come from the record's accounts and its single-platform fields (`influencerPlatform` / `influencerHandle`).
- Creating or updating an influencer whose key is already on another influencer of the same company is refused with 409. The error names the other record: `"@x on Instagram is already on Ahmed's record."`, details `{ code: 'duplicate_handle', duplicateOf: { id, name } }`.
- On update only keys the change adds are checked, so records that already clash today can still be edited. Existing clashes are not merged automatically.
- Only influencer contacts are checked. A supplier or client sharing a handle is not a clash.

**Add by link.**
- New endpoint `POST /companies/:companyId/influencers/quick-add { text }`.
- One influencer per line; several links on one line are the same person's accounts (e.g. `instagram.com/a  tiktok.com/@a`). At most 100 lines.
- Recognised links: instagram.com/x, tiktok.com/@x, snapchat.com/add/x (and /@x), youtube.com/@x, x.com/x and twitter.com/x, facebook.com/x. A bare `@x` or `x` means Instagram, the platform the directory fetches.
- Each line answers `created`, `existing` (a key is already on a record: that record is returned, nothing is changed) or `invalid` (nothing recognisable).
- A new record is Person, role Influencer. Its name is the Instagram full name when the directory already knows the account, else the first handle (`@x`). The first account also fills the single-platform fields, as the edit sheet does.
- **Figures arrive by themselves** for Instagram accounts, through the existing roster sync: the account joins the directory as Peak's influencer, and the next refresh (started immediately when Apify is set up and no run is going) writes followers and engagement back. When the scraped profile has a full name and the record's name is still the `@handle` placeholder, the record takes the full name. Other platforms keep manual figures (bundle 3 adds TikTok).
- This is for every company's Influencers page; the automatic fetch only happens for the portal company (the directory exists only there).

**CSV upsert, several platforms.**
- New columns: `instagram, instagramFollowers, tiktok, tiktokFollowers, snapchat, snapchatFollowers, youtube, youtubeFollowers, x, xFollowers, facebook, facebookFollowers` (handle or link). The old `platform, handle, followers` columns are still read, so old files import unchanged.
- A row **updates** the influencer it matches, else creates one. It matches by any of its handles, else by email (case-insensitive).
- When updating, empty cells change nothing. An account for a platform that is already on the record is updated in place; otherwise it is added.
- A row whose handles point at two different records fails with both names. Rows are applied in order, so a later row in the same file that repeats a handle updates the record an earlier row created.
- Result `{ created, updated, failed, errors }`. Export writes the new columns, so export → edit → import round-trips.

**Discover → roster.**
- New `POST /discover-profiles/:id/add-to-roster` (rule DISCOVER_MANAGE, and the caller must be allowed to create contacts).
- It creates the influencer from the profile: name (full name, else @username), Instagram account (handle, link, followers, engagement, synced time), niche and location. The first bio email and phone go in too; the record is staff-only, as bio contacts are.
- Then it runs the roster sync, so the profile becomes the record's directory entry (outside the 200) at once.
- Refused with 409 when an influencer already has that Instagram handle (that record is named), or when the profile is already linked to one.
- Consequence, by the existing rule (2026-10-13): every influencer is shown to clients unless hidden. Adding a candidate to the roster therefore lists them.

## 3. Pieces

Backend:
- `backend/src/influencers/handles.ts` — pure functions: parse a link or handle, account keys of a record, find a clash, parse quick-add text.
- `backend/src/influencers/import.ts` — CSV row → create or update, given the store; used by the import route.
- `server.ts` — the clash check in contact create/update, the import route calls the import module, export writes the new columns, the quick-add route. All edits stay small; logic lives in the module.
- `discover/jobs.ts` — the placeholder name takes the scraped full name on write-back.
- `discover/staff-routes.ts` — `add-to-roster`.

Staff app:
- **Add influencer** dialog: a **Paste links** tab (default) with a results list (created → Edit, already there → open that record, not recognised). The existing form stays as **Enter details**.
- Edit sheet: the 409 message reaches the toast (the existing error path).
- CSV template and import result show the new columns and "updated".
- Discover page: **Add to roster** on candidate and listed profiles that are not linked.

## 4. Testing

`node --test`:
- Parsing: each platform's URL shapes, bare handles, junk, several links on a line.
- Clash: the create/update 409 names the other record; an update that adds no new key passes even when an old clash exists; non-influencers are ignored.
- Quick add: created / existing / invalid; a multi-account line; no fetch without a scraper; with a fake scraper the figures and full name land on the record.
- CSV: create; update by handle; update by email; several platforms on a row; empty cells keep values; a row matching two records fails; a repeated handle in one file updates rather than duplicates; old columns still import.
- Add to roster: creates and links the profile (isRoster, outside the 200); 409 on a known handle; 403 without DISCOVER_MANAGE.

Staff app: tsc, and a browser check of the dialog, the CSV round trip and the Discover button, in Arabic at phone width.

## Decided while building

- Giving an existing contact the Influencer role (`POST /contacts/:id/roles`) runs the same duplicate check, so the guard cannot be stepped around.
- Quick add refuses text over 20,000 characters (400) instead of cutting it, so a link is never cut into a wrong handle.
- `DELETE /tasks/:id` is listed in the ungated-routes test: it checks per record (`requireTaskViewAccess`); the extractor had read the next route's roles into it.
- `route-permissions.ts` and `gate-matrix.csv` got only the quick-add line by hand: regenerating on master pulls in unrelated stale task/project lines and fails on `project-templates`.
