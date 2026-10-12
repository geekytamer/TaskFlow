# Phase 1 — Close the loop (with self-hosted AI) — Design

Date: 2026-10-12
Status: direction and merged plan approved in conversation ("yes looks right"); this spec awaits the owner's review.
Context: first phase of the "world-class marketing tool" roadmap for the Peak client and influencer portals (phases: 1 close the loop · 2 brief to booking · 3 trust and measurement · 4 influencer business tool · 5 commerce).

## 1. Goal

From approved brief to paid and reported, a Peak campaign runs itself; people only approve. After Phase 1:

- the influencer gets an instant check of their draft against the brief (rules), then AI suggestions within minutes;
- publishing is detected without the influencer pasting a link, and the live post is checked against the approved draft;
- a delivered deliverable raises its payable on its own;
- routine reminders send themselves; sensitive ones arrive as one-click drafts in a staff "Today" queue;
- the client has a live campaign report with a written summary; the influencer gets a recap.

## 2. Decisions

- **AI: open-source models, self-hosted; no paid AI APIs** (owner). Worker = an office Mac running Ollama (M4, 16 GB today: Qwen 3 8B-class text model, a small vision model, Whisper). Models are configuration, benchmarked on our tasks before use (Qwen 3 / Nous Hermes / Gemma 3 / Qwen-VL / Jais as Arabic fallback).
- **AI only suggests.** No AI output sends a message, approves content, or moves money. Every AI result is labelled as a draft or suggestion.
- **AI is never on the critical path.** Every feature has a rules version that works when the worker is offline. Detection, payables and reminders do not depend on AI.
- **Clients never see AI notes** on content; they see the AI-written report summary only after staff publish it (default: auto-publish off for the first month, then a switch).
- **Routine reminders send automatically** from fixed bilingual templates, each type switchable per company. Sensitive cases need a staff click.
- **Money:** "payment on delivery" creates the draft vendor bill automatically; paying it stays a staff action in Finance.
- **Reels:** the draft check uses caption, cover, a few frames and the speech transcript (Whisper). Full video understanding is out of scope.

## 3. Foundation: AI job queue and Mac worker

**Queue (backend, migration `129_ai_jobs`):** `ai_jobs(id, companyId, kind, subjectType, subjectId, input JSON, status queued|running|done|failed|cancelled, result JSON, error, attempts, leaseUntil, model, createdAt, startedAt, finishedAt)`; `ai_worker_heartbeats(workerId, lastSeenAt, models JSON, version)`; per-company `ai_settings(companyId, features JSON)`.

**Worker protocol (pull only, HTTPS):**
- `POST /ai-worker/claim` → next queued job for the kinds/models this worker has; sets `running` and a 10-minute lease. Expired leases return to `queued`; after 3 attempts → `failed`.
- `POST /ai-worker/jobs/:id/result` → `{ result }` or `{ error }`. The backend validates `result` against the kind's JSON schema; invalid → retry once, then `failed`.
- `POST /ai-worker/heartbeat` every 30 s.
- Auth: a worker token (`AI_WORKER_TOKENS`, hashed at rest, scope = these three routes only). Inputs carry only what the job needs (no contact details beyond names).

**Worker program (`ai-worker/` in the repo):** Node script run by launchd on the Mac; calls Ollama's API with a JSON schema per kind; downloads images/video for the job from short-lived signed URLs, extracts frames (ffmpeg) and transcript (Whisper) locally, deletes them after. Config file maps kind → model.

**Offline behaviour:** worker considered offline after 3 minutes without heartbeat. Jobs wait; features show their rules version and staff see "AI assistant offline since …". Overnight jobs never starve interactive ones (claim order: interactive kinds first).

**Prompt-injection stance:** captions, transcripts and briefs are data. Outputs are schema-bound suggestions; nothing an output says can trigger an action. Tests feed hostile text.

## 4. Step 2 — Structured brief requirements

Today briefs are free text (`portal_campaign_briefs.influencerBrief`, `portal_deliverable_briefs.brief`). Add per campaign (deliverables may override): required mentions (@handles), required hashtags, disclosure required (default yes; accepted forms: `#ad`, `#إعلان`, `إعلان`, paid-partnership label), banned words, key messages (short list), posting window (from/to), caption language.

- Staff edit them on the campaign's brief panel.
- **AI extraction:** saving a free-text brief queues `brief.extract`; the result appears as "Suggested requirements" for staff to accept/edit. Never applied silently.
- Influencers see the requirements as a checklist on the deliverable.

## 5. Step 3 — Draft check

On a draft submission (`POST /influencer/deliverables/:id/submissions`):

1. **Rules, instantly:** mentions, hashtags, disclosure, banned words, caption length, language. Result stored on the submission.
2. **AI, queued (`draft.check`):** brief fit (key messages present, tone), Arabic/English writing issues, product/logo visible in images/cover/frames, disclosure spoken or shown in a Reel (transcript + frames).
3. Output: list of `{ severity: blocker|warning|tip, area, message (in the influencer's language), evidence }`.
4. **Influencer** sees "Before your client sees this" with the findings and can revise and resubmit; submitting anyway is allowed (warnings) but blockers from rules are shown to the reviewer.
5. **Staff** see the findings on the review screen. **Clients never see them.**

## 6. Step 4 — Automatic publishing detection and live-post check

- **Connected influencers:** every 15 minutes during a deliverable's posting window, read recent media (existing `recentMedia`, as games do) and match by required hashtag/mention or caption similarity to the approved draft.
- **Not connected — OPEN QUESTION for the owner** (who earlier ruled out scraping post results): (a) keep today's "paste the link" for them, plus a reminder when the window closes without one; or (b) a daily public check of their recent posts during the posting window only, for detection only (no results), via Apify, counted in the Discover budget. Spec assumes (a) until decided.
- **Match found:** deliverable → Published with `contentUrl` and `publishedAt` set; result checkpoints (24h/7d/30d) start for connected accounts; influencer and staff notified. The influencer's manual "paste link" stays as a fallback.
- **Live-post check (`post.verify`, AI + rules):** caption equals/near-equals the approved one, disclosure still present, cover matches approved cover. Mismatch → staff alert (not the client).

## 7. Step 5 — Payable on delivery

When a deliverable with `fulfillment = External`, a cost and a paid influencer becomes Published (detected or manual) **and** its content was approved, create its draft vendor bill (reuse `generateCampaignVendorBills` logic per deliverable). The influencer's Money/payouts page shows it as "Payment being processed". Paying remains a Finance action. Switch per company (default on).

## 8. Step 6 — Reminders and the Today queue

**Automatic (templates, en/ar, per-type switch), deduplicated, quiet hours 22:00–08:00 Muscat:**
- Influencer: content due in 2 days with no draft · due today · changes requested and not resubmitted in 48 h · posting window opens tomorrow · agreement/proposal unanswered 48 h.
- Client: content waiting for their approval 24 h and 72 h · proposal waiting 48 h.
Delivered as portal notification + push (existing) + email.

**Today queue (staff, new page `/today`):** nightly at 02:00 and hourly light pass, rules flag: client waiting > 72 h · deliverable overdue · post under half the influencer's usual reach at 7d · live-post mismatch · invoice overdue · AI worker offline > 1 h. For each, AI (`today.draft`) writes a one-line summary and a message draft in the recipient's language. Staff: Send / Edit / Skip / Snooze. Existing `sweepPortalDeliverableReminders` follow-ups are folded into this.

## 9. Step 7 — Live report and summary

- Client portal campaign page gets a **Report** tab and a **share link** (unguessable, revocable, expiry) for people without a login: deliverables, published posts, results (views, likes, comments, saves, shares where known), totals, cost per view / per engagement, timeline.
- **Summary (`report.summary`, AI):** 3–5 sentences and up to 3 recommendations, generated when 7d results are in and again at 30d. Staff publish it (auto-publish switch later). Rules fallback: templated sentences from the same numbers.
- **Influencer recap (`recap.influencer`):** after 7d, "this post vs your usual" for their own posts only.
- PDF export via the existing PDF renderer.

## 10. Measurement

Logged from day one, shown on an internal panel: staff time proxies (manual status changes, messages sent by hand), revision rounds per deliverable, brief→live days, late deliverables, reminders sent, AI job counts/latency/failure rate, % of AI suggestions accepted.

## 11. Testing

`node --test` with a fake worker: queue claim/lease/expiry/retry, token scope, schema rejection, offline fallback, hostile captions (output never changes state), rules checks (Arabic and English disclosure forms), detection matching (connected and scraped fixtures, no false match outside the window), bill created once (idempotent) and only when approved+published, reminder dedup and quiet hours, clients never receive draft-check findings (response allow-lists), share link revocation/expiry. One real run on the Mac per AI kind to record speed and quality in Arabic and English. Mutation checks on the guards.

## 12. Out of scope (later phases)

Brief assistant, unified directory, auto shortlist, agreements (Phase 2) · EMV and benchmarks, comment sentiment (Phase 3) · growth coach, media kit AI (Phase 4) · commerce (Phase 5) · full video understanding · AI sending anything on its own.

## 13. Order of delivery (each ships alone)

1. AI queue + Mac worker. 2. Structured brief requirements (+ AI extraction). 3. Draft check. 4. Publishing detection + live-post check. 5. Payable on delivery. 6. Automatic reminders + Today queue. 7. Live report + summary + recap.
