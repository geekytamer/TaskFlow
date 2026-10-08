# Faster Approval and Phone Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-tap content approval for clients, and installable apps with phone notifications for both portals and the staff app.

**Architecture:** A client content endpoint and page reuse the review flow; a `review` alert event feeds WhatsApp and push. A `backend/src/push/` module stores Web Push subscriptions and sends through an injectable sender; staff pushes ride `notify()`, portal pushes ride a per-minute sweep over `currentEvents`. Each Next app gets a manifest, icons, `/sw.js` and an enable control.

**Tech Stack:** as before plus `web-push` (backend, installed with npm 10.9.8).

**Spec:** `docs/superpowers/specs/2026-10-08-review-and-phone-notifications-design.md`

## Global Constraints

- Payloads never carry amounts, rates or anything a lock screen should not show.
- Push is off without `PUSH_VAPID_PUBLIC_KEY`/`PUSH_VAPID_PRIVATE_KEY`/`PUSH_SUBJECT`; nothing errors.
- Practice companies never push. A 404/410 from the push service deletes that subscription.
- Migrations pinned in `test/api.test.js`; bilingual copy; phone first.

## Review Focus

1. The same device subscribed by two people in turn: it belongs to the last one only.
2. A portal user who subscribes gets no burst of old events.
3. A staff category with push off still gets in-app/email as before.
4. iPhone Safari not installed: the control explains installing, never shows a dead Enable.
5. A content page for a piece not yet approved by staff: 404 (same rule as the campaign page).

---

### Task 1: Client content endpoint and `review` alert event
Files: `backend/src/portal/client-campaigns-routes.ts`, `backend/src/portal/reviews-store.ts` (`clientReviewsOf(deliverableId)`), `backend/src/portal/alerts.ts` (event `review`, line text), test `backend/test/portal-content-review.test.js`.
- [ ] Tests: content endpoint returns the piece with `previous` after a changes request and a resubmission; 404 for another client and for work staff have not approved; `currentEvents` gives one `review` per content link, path `/campaigns/<cid>/content/<did>`, and none before staff approval.
- [ ] Implement; suite; commit.

### Task 2: Portal content page
Files: `portal/src/app/(portal)/campaigns/[id]/content/[deliverableId]/page.tsx`, `portal/src/lib/campaigns.ts` (`getCampaignContent`), campaign page links, i18n `rev.*` additions.
- [ ] Implement; tsc; browser (approve and changes flow, "What changed" block, Arabic, phone); commit.

### Task 3: Push core
Files: `backend/src/push/push-store.ts`, `backend/src/push/push.ts` (`PushSender` type, `webPushSender(config)`, `sendToPrincipal(store, sender, audience, principalId, payload)` pruning gone endpoints), migration `123_push`, routes (`/push/public-key`, staff subscribe/unsubscribe in `src/routes/push.ts`, portal subscribe/unsubscribe in `src/portal/push-routes.ts`), test `backend/test/push.test.js`.
- [ ] Tests: subscribe/unsubscribe per audience; endpoint moves to the latest principal; gone endpoints pruned on 410; public key endpoint `{ enabled:false }` without config; validation of subscription body.
- [ ] Implement (`npx npm@10.9.8 install web-push @types/web-push`); suite; authz extract; commit.

### Task 4: Staff pushes from notify()
Files: `backend/src/notifications.ts` (prefs gain `push`), `backend/src/data/store.ts` (`onNotified` hook), `backend/src/server.ts` (wire hook to push), test `backend/test/push-staff.test.js`.
- [ ] Tests: a notification pushes title+link to the recipient's devices; category push off → no push but in-app still created; practice company → no push; prefs round-trip keeps `push`.
- [ ] Implement; suite; commit.

### Task 5: Portal push sweep
Files: `backend/src/portal/alerts.ts` or new `backend/src/portal/push-alerts.ts` (`sweepPortalPush`), migration `124_portal_push`, server wiring (every minute), test `backend/test/portal-push.test.js`.
- [ ] Tests: each event pushed once; events before first subscription skipped; user with no device skipped; push prefs off → nothing.
- [ ] Implement; suite; commit.

### Task 6: Portal PWA
Files: `portal/public/manifest.webmanifest` (or route `app/manifest.ts`), icons, `portal/public/sw.js`, `portal/src/components/phone-notifications.tsx`, `portal/src/lib/push.ts` (`isIosNotInstalled(ua, standalone)` + test), api proxies, layout registration.
- [ ] Implement; tests; browser (manifest served, SW registers, subscribe flow against local VAPID keys, push received on desktop Chrome); commit.

### Task 7: Staff app PWA
Files: `frontend/src/app/manifest.ts`, icons, `frontend/public/sw.js`, notification preferences UI (push switch per category + enable control), service.
- [ ] Implement; tsc/lint; browser; commit.

### Task 8: Staging
- [ ] Generate VAPID keys, add to staging backend `.env` (backup first), deploy, rebuild portals, verify `/push/public-key` enabled.
