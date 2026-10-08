# Faster Content Approval and Phone Notifications — Design

Date: 2026-10-08
Status: approved in conversation ("yes, and try to include TaskFlow too").

## 1. Goals

1. A client approves a creator's content in two taps from the alert that tells them about it, and when a creator resubmits after changes, the client sees the version they reviewed, their comment and the new version together.
2. The client portal, the influencer portal and the TaskFlow staff app can be installed on a phone (home-screen icon, full screen) and send real phone notifications on Android and on iPhone (iOS 16.4+, after "Add to Home Screen"). No app stores.

## 2. Faster approval (client portal)

- **Alert for content to review.** A new client alert event `review`: a deliverable on the client's campaign that is waiting for the client (the existing `waitingFor` rule says `client`), keyed by the content link, so a resubmission alerts again. It goes out through WhatsApp (existing sweep) and push (§3), and its link is the content page below.
- **Content page** `/campaigns/<campaignId>/content/<deliverableId>`: the piece, its creator and platform, Approve / Request changes (the existing review control and endpoint), and, when the client earlier asked for changes on a different link of the same piece, a "What changed" block: the earlier link, the client's comment and its date beside the new link. A signed-out visitor signs in and returns here.
- **Backend:** `GET /portal-api/client/campaigns/:id/deliverables/:deliverableId` returns the deliverable as the campaign page shows it plus `previous: { contentUrl, comment, at } | null` = the client's most recent `changes_requested` review of that deliverable on a link other than the current one. Same visibility rules as the campaign page (404 when not the client's or not visible).
- The campaign page links each piece waiting for review to its content page.

## 3. Phone notifications (Web Push)

**Delivery.** Standard Web Push with VAPID (`web-push` library). Keys from env `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_SUBJECT` (mailto:). Without keys push is off: the key endpoint answers `{ enabled: false }` and nothing is sent. A subscription that the push service reports gone (404/410) is deleted.

**Storage.** `push_subscriptions(id, audience 'staff'|'client'|'influencer', principalId, companyId, endpoint UNIQUE, p256dh, auth, userAgent, createdAt, lastSentAt)`. A device belongs to one principal; subscribing an endpoint again moves it.

**Payload.** `{ title, body, url, tag }`, never amounts, rates or other lock-screen-unsafe detail (the WhatsApp rule).

**Staff (TaskFlow).** Notification preferences gain a `push` switch per category (default on). Every notification `notify()` creates is pushed to the recipient's devices when that category's push is on, with the notification's title and its link. Practice companies never push.

**Portal users.** Alert preferences gain `push` (default on once a device subscribes). A sweep every minute pushes what is new per user from the same events as WhatsApp (`currentEvents`, plus `review`), logged per user in `portal_push_log` so each event is pushed once; what existed before the first subscription is skipped. One notification per event (not a digest), so each opens its own page.

**Routes.** `GET /push/public-key` (no auth); staff `POST /push/subscribe`, `POST /push/unsubscribe`; portal `POST /portal-api/:audience/push/subscribe`, `/push/unsubscribe`.

**Apps.** Each app (staff app, portal: one build serving client and influencer hosts) gets a web app manifest (name from branding, dark theme colour, standalone display, icons 192/512 and maskable, Apple touch icon), and a service worker `/sw.js` that shows pushes and opens their `url` on tap (focusing an open window when there is one). An "Phone notifications" control: Enable on this device / Turn off; on an iPhone not yet installed it explains Share → Add to Home Screen instead of a button that cannot work. Staff app: in notification preferences with the per-category push switches. Portal: on Profile (influencer) and Messages (client), beside WhatsApp alerts.

## 4. Testing

Backend `node --test`: content endpoint visibility and `previous`; `review` events (one per content link, not before staff approval); subscribe/unsubscribe per audience and endpoint moving between principals; staff push sent only for categories with push on and never for practice companies; portal push sweep sends each event once and skips what existed before subscribing; gone subscriptions pruned. The push sender is injected (no network). Frontends: `tsc`, unit tests for pure helpers (iOS-install detection), browser check of the content page, install prompt and subscribe flow on localhost.

## 5. Not in scope

Native store apps; rich notification actions (approve from the notification itself); per-event portal push preferences beyond on/off.
