# Meta Integrations and the Peak SaaS — Design Exploration

Date: 2026-10-04
Status: **Draft for the owner's review — not approved, nothing built.** Written while the owner was away, as five refinement passes. The questions at the end decide what goes forward.
Builds on: influencer portal design §5 (connected accounts), games design §6 (collectors), roadmap Phase 5.

## What Meta offers today (checked 2026-10-04)

- **Instagram API with Instagram Login** (Business and Creator accounts only): profile, media, comments, mentions and tags (`instagram_business_basic`); publishing images, reels, carousels and stories (`…content_publish`); replying to, hiding and deleting comments (`…manage_comments`); DMs (`…manage_messages`); account and media insights including follower demographics for 100+ followers (`…manage_insights`). Webhooks push comments and mentions. ([Meta overview](https://developers.facebook.com/docs/instagram-platform/overview/), [reference, April 2026](https://gist.github.com/jameschapman2c/65eff9f54a2d350b17a6ce5127b9fe42))
- **Metrics changed**: impressions and plays were replaced by a single `views` metric in April 2025; post-level unique variants are deprecated above Graph API v25 (v26 shipped July 2026). Anything we store must be `views`-based. ([Emplifi](https://docs.emplifi.io/platform/latest/home/instagram-insights-metrics-deprecation-april-2025), [Brandwatch](https://social-media-management-help.brandwatch.com/en/articles/12767947-deprecation-of-instagram-impressions-plays-and-video-views))
- **Creator Marketing Hub** (September 2026): Creator Marketplace and the Partnership Ads Hub merged. The Creator Marketplace API now covers Facebook and Instagram creators; there is a new Messaging API for creator outreach, and the Content Discovery API returns content recommendations, performance data and whether content is cleared for ads, with content-level permissions and expiry dates. Partnership ads report about 19% lower CPA and 13% higher CTR than brand-only ads. ([MediaPost](https://www.mediapost.com/publications/article/418022/meta-launches-creator-marketing-hub-live-video-ad.html), [Social Media Today](https://www.socialmediatoday.com/news/meta-adds-more-creator-partnership-tools/830480/))
- Already in TaskFlow: WhatsApp Cloud API (the WhatsApp module).

## Pass 1 — Everything Meta makes possible (unfiltered)

1. Influencers connect Instagram (and Facebook) accounts; followers, engagement, views and audience demographics sync daily and show as **verified** to clients.
2. Comments and mentions webhooks feed **games** automatically (G2) instead of manual points.
3. **Proof of delivery**: when a deliverable is published, match the post by URL, fetch its views and engagement, and attach real results to the campaign and the client's report.
4. **Partnership ads**: an influencer grants a brand permission to boost a post; clients boost from their portal.
5. **Content publishing**: an approved draft is scheduled and published from the portal.
6. **Creator discovery**: use the Creator Marketplace and Content Discovery APIs to suggest creators to clients.
7. **DM inbox** for influencers inside their private workspace.
8. **WhatsApp notifications** for portal events (new proposal, changes requested, payout sent).
9. **Attribution**: Meta Pixel and the Conversions API tie campaigns to sales for the client.
10. **AI-free analytics**: benchmarks, best posting times, audience overlap between influencers for a client's shortlist.

## Pass 2 — Filtered by Peak's rules and business

Rules carried from earlier decisions: clients never see real rates or internal data; influencers never see market-rate benchmarks; Peak is the intermediary, so nothing should route clients around it; no "AI slop".

- **Keep, high value**: 1 (verified stats remove self-reported numbers, the core trust problem), 3 (proof of delivery is what clients pay for), 2 (games without manual work), 8 (WhatsApp is how the Gulf already works; the module exists).
- **Keep, later**: 4 (partnership ads are now the default way brands pay to amplify creators; Peak can run them for clients as a service), 5 (publishing saves influencers time, needs `content_publish` review).
- **Reshape**: 6. Meta's discovery API helps *Peak staff* find new talent; it must not be exposed to clients, who would then find creators without Peak.
- **Reshape**: 10. Audience overlap and demographics are fine for clients; "benchmarks" are dropped for influencers (decided 2026-09-28).
- **Drop for now**: 7 (influencer DMs belong to the not-yet-designed private workspace), 9 (attribution needs the client's pixel and data agreements; revisit with a real client asking for it).

## Pass 3 — Decomposed into sub-projects, in order

Each is its own spec, plan and build cycle.

1. **M0 — Meta app and compliance** (no code): Peak-owned Meta developer account and business verification; privacy, data-deletion and terms pages on Peak's domain; app review for `instagram_business_basic` and `instagram_business_manage_insights` first. Everything else waits on this.
2. **M1 — Connected accounts and verified stats**: Instagram Login from the influencer portal, encrypted tokens and refresh, daily sync, a `verified` badge in the client catalogue, disconnect and data-deletion callback.
3. **M2 — Proof of delivery**: link a published deliverable to its media id; pull views and engagement at 24 hours, 7 days and 30 days; a campaign results page and PDF report for the client.
4. **M3 — Game collectors** (games G2): comments and mentions webhooks into `game_events`, deletion reconciliation at game end.
5. **M4 — WhatsApp portal notifications**: opt-in per portal user, using the existing WhatsApp module and approved templates.
6. **M5 — Partnership ads as a Peak service**: influencer grants ad permission in their portal; staff run the boost; the client sees spend and results.

Publishing (5) and staff talent discovery (6) follow once M1 and M2 prove the token and review path.

## Pass 4 — Architecture for M1–M3

- **`social/` worker process** (as the games design said): fetching and webhook handling run outside the API process; it writes in batches to SQLite (WAL).
- **`connected_accounts`**: contactId, platform, external user id, scopes, encrypted token (AES-GCM, key from env, rotation by key id), expiry, status (`active | needs_reconnect | revoked`), lastSyncAt, lastError.
- **`account_snapshots`**: daily followers, views, reach, engagement and demographics per account; the catalogue reads the latest, never the API live.
- **`media_results`**: deliverable id, media id, checkpoint (24h/7d/30d), views, likes, comments, shares, saves.
- **Webhook endpoint**: verify the signature, store the raw event idempotently, acknowledge fast, process in the worker.
- **Limits and failure**: per-account rate budgets, exponential backoff, `needs_reconnect` surfaced to the influencer and staff, no silent stale data (show "as of" dates).
- **Privacy**: data-deletion callback purges an account's snapshots and events; retention limited to what the product shows.
- **Secrecy unchanged**: verified stats are public-ish data; rates and margins stay where they are.

## Pass 5 — The SaaS question

"Cutting-edge SaaS for influencers and Peak's clients" can mean two different products:

- **A. Peak's own platform, deeper** (recommended now): the portals become the best place to work with Peak, made distinctive by verified data, proof of delivery and games. One company, no multi-tenancy cost, every feature serves Peak's revenue.
- **B. A product sold to other agencies or creators**: multi-tenant onboarding, billing, self-serve sign-up, per-tenant Meta apps or a Tech Provider setup, support. This conflicts with decisions so far (invite-only accounts, Peak as intermediary) and multiplies compliance work.
- **C. Hybrid**: influencers get a private workspace for their own business (already on the roadmap as "future direction") as a free tool that keeps them close to Peak; clients stay invite-only.

Recommendation: **A, then C.** Build M0–M3 for Peak, with the influencer private workspace (C) designed once M1 gives creators a reason to log in daily. Revisit B only with a paying second agency in hand.

## Testing (for whichever sub-project goes first)

Recorded API fixtures for every collector and sync job; token encryption round trip with key rotation; webhook signature and idempotency tests; deletion callback purges everything; the existing secrecy fixtures extended to verified stats.

## Questions for the owner

1. Which product: A (Peak's platform), B (sell to other agencies), or C (A plus a free influencer workspace)? *(Recommended: A then C.)*
2. Can Peak start M0 now: a Meta developer account in Peak's name, business verification, and the privacy/terms/data-deletion pages?
3. First build after M0: verified stats (M1) or proof of delivery (M2)? *(M2 needs M1's connections, so M1.)*
4. Will any game carry a prize (decides the legal review before M3)?
5. Which platforms besides Instagram matter for Peak's influencers (TikTok, Snapchat, YouTube)?
