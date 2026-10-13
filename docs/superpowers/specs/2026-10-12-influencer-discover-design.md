# Influencer Discover — Design

Date: 2026-10-12
Status: approved in conversation ("yes go ahead").

## 1. Goal

Clients of Peak Creative Agency open **Discover** in the client portal: a ranked, filterable directory of Omani influencers (like Feedspot's "Top Omani Influencers"): photo, name, bio, handle, followers, 3-month growth, engagement, tier, gender, location, niche, and when the figures were last checked. Peak's roster is marked "Works with Peak"; anyone else can still be requested and Peak reaches out.

Up to **200** influencers. Figures come from Apify's maintained Instagram scrapers (no Meta API), run by TaskFlow with Peak's Apify token. At this size it fits Apify's free plan ($5/month credit).

## 2. Decisions

- **Collection:** Apify Store actors `apify/instagram-profile-scraper` (profiles) and `apify/instagram-hashtag-scraper` (discovery). No custom actor and no anti-blocking code of our own: nothing to deploy on Apify. Token in `APIFY_TOKEN` (already used by games). Without a token the feature still works with manually entered profiles; runs say "Apify is not set up".
- **Budget guard:** results counted per calendar month; a run that would pass `DISCOVER_MONTHLY_RESULTS` (default 1800 ≈ $4.70 at free-plan prices) is refused with a clear message.
- **Refresh:** every listed and candidate profile older than 7 days, once a day check, at most 200 per run.
- **Discovery:** monthly (and on demand by staff): recent posts of the configured hashtags (default `muscat, oman, omani, عمان, مسقط, omaninfluencer`, 50 posts each), their owners not already known are profiled; those with at least `minFollowers` (default 10,000) **and** an Omani signal (🇴🇲, Oman/Muscat/Salalah/Sohar/Nizwa/…, +968, an Omani business category location) become **candidates** for staff to approve. Nothing reaches clients without a staff approval.
- **Growth:** every fetch stores a snapshot; 3-month growth compares the latest followers with the snapshot nearest 90 days ago (at least 75 days old); before that the card says "New".
- **Tier:** Nano < 10k ≤ Micro < 100k ≤ Mid < 500k ≤ Macro < 1M ≤ Mega.
- **Engagement:** average likes + comments of the latest posts ÷ followers.
- **Gender, niche, location:** staff set them (location pre-filled from the bio). No automatic gender guess (that is how lists get "Ahmed … Female").
- **Privacy:** only public profile facts are shown to clients. Emails and phone numbers found in bios are kept for Peak staff only. Staff can remove a profile at any time (removed profiles are never re-suggested).
- **Photos:** downloaded at fetch time and served by TaskFlow (Instagram's image links expire and block embedding).
- **Requests:** a client "Request" on any profile raises a follow-up for the account manager and notifies them; the client sees "Requested". A profile linked to a listed roster influencer also links to the existing request form with that influencer pre-selected.

## 3. Pieces

Backend `backend/src/discover/`:
- `discover.ts` — pure rules: tier, growth, engagement, Omani signals, bio contacts, handle parsing.
- `apify.ts` — `DiscoverScraper` (profiles, hashtag posts) over Apify's run API (start, poll, read dataset); fixture scraper for local dev (`DISCOVER_FIXTURES=1`).
- `discover-store.ts` — profiles, snapshots, runs, settings, client interest.
- `jobs.ts` — refresh and discovery runs with the budget guard.
- `staff-routes.ts` — `/companies/:companyId/discover…` (rule `DISCOVER_MANAGE`, Admin and Manager).
- `client-routes.ts` — `/portal-api/client/discover…`.
- Migration `126_influencer_discover`.

Staff app: **Influencers → Discover** page: candidates to approve, listed profiles to edit/link/remove, add handles, run now, settings and this month's usage.

Client portal: **Discover** page (client audience only) with filters (search, tier, niche, location, gender, works with Peak), sort (followers, growth, engagement), cards, request.

## 4. Testing

`node --test`: rules (tier, growth window, engagement, signals, contacts); store; jobs with a fake scraper (refresh writes snapshots and photos, discovery keeps only Omani accounts over the threshold and skips known/removed ones, budget refusal); staff routes (permission, approve/remove, add handles); client routes (only listed profiles, no contact details, filters, request raises a follow-up). Portal and staff app: tsc, unit tests for helpers, browser check with fixtures.

## 5. Roster sync (added 2026-10-12)

- Every Influencer contact with an Instagram handle gets a linked directory entry (`isRoster`, migration `127_discover_roster`). Roster entries do not count toward the 200, are never removable from Discover by staff, and show to clients only while the influencer is listed in the portal catalogue.
- Each weekly refresh writes followers and engagement back onto the influencer's Instagram account on their record (`syncedAt`), or the single-platform fields. A handle already fetched writes back as soon as it joins the roster. Handle changes move the link.
- **Scraping replaces the Meta connection as the way figures stay current.** Catalogue and media kit "Verified" figures use a connected account when one exists, else the latest scraped figure (`discover/figures.ts`). Connecting Instagram in the influencer portal is optional: the Home nudge and media-kit prompt are gone; it only adds post views, reach and audience, which public profiles do not expose. Game live metrics from comments still need a connected account.
- **Connected influencers are never scraped** (owner, 2026-10-12). An influencer with a working Instagram connection (active, token present) is skipped by the refresh; their directory entry takes followers from the connection's latest snapshot, and their record follows the connection. When the connection breaks (needs reconnect, revoked) scraping takes over until they reconnect.
- **Post results are not scraped** (owner decision): campaign post results stay API-only, from connected accounts.

## 6. One client directory (owner, 2026-10-13)

- Every Influencer contact is shown in the client portal unless Peak hides it (`portal_catalogue_hidden`, migration `129_catalogue_hidden_and_ranges`); the old opt-in listing is gone.
- Influencers and Discover are one page, **Influencers** (`/portal-api/client/directory`): Peak's shown influencers plus approved Discover profiles, each once, in one shape with no roster marker. `/discover` redirects there. Requests can shortlist both; staff notes mark "[not on the roster yet]", the client never sees it.
- Cards by default, list on demand (`view=list`); sort by followers, engagement, growth, price, name; filters for platform, niche, location, gender, size, availability, minimum followers, budget per post.
- Price is a range around the client's price: `price × (1 − below%)` to `price × (1 + above%)`, set per influencer (default 30 / 30), editable by staff on the influencer's edit panel. No rate card → "Price on request".
