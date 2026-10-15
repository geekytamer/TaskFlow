# Conversations — Step 4 (alerts, response times, phone push) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff and portal users are told about conversations the right way — grouped, quiet at night, as pointers with an optional preview — with response-time targets that turn threads amber/red and proper phone notifications (thread-grouped, deep-linked, badge count, Android actions, device management, iPhone install guidance).

**Architecture:** Build on what exists instead of replacing it. Staff alerts stay on the existing `notifications` table and per-category preferences (inApp / email / push) with a new `messages` category and three new types; portal alerts stay on the existing derived-event sweeps (`currentEvents`, WhatsApp digest, portal push) with a per-group preference matrix. Response time is pure functions over per-company working hours. Push changes are a richer payload, an upgraded service worker in both apps, signed action tokens for "Mark done" from a notification, and a devices API.

**Tech Stack:** Express + better-sqlite3 (`node:test` + supertest), Next.js staff app (shadcn, `tr`), Next.js portal (`t(lang,key)`), Web Push (`web-push`), service workers at `frontend/public/sw.js` and `portal/public/sw.js`.

**Spec:** `docs/superpowers/specs/2026-10-14-conversations-design.md` §6 (response time), §7 (alerts), §7a (phone push), §8 screen 6.

## Global Constraints

- Response target default **4 working hours**; working week **Sun–Thu**, **08:00–17:00**, time zone **Asia/Muscat**; all configurable per company. Amber at **50 %** of the target, red **past** it.
- Messages on one thread within **2 minutes** group into one alert; push **quiet hours 22:00–08:00** in the company time zone; held items go out as one morning summary.
- Alerts carry only a pointer (thread + message) and a preview the person can switch off; internal-note content is never sent to portal users and never previewed outside the company's own staff.
- Follow-ups are no longer created for incoming conversation messages (other portal events keep theirs until Step 5 — see Ruling below).
- Push: one notification per thread (`tag` = `thread:<id>`), renotify with a count ("3 new messages"); tapping opens `/inbox?thread=<id>&message=<id>` (staff) or `/messages/<id>` (portal) and focuses an open window; badge = number of threads waiting on the person; Android actions: Open, and for staff Mark done; devices list with Send a test and Remove; dead subscriptions removed (existing 404/410 handling).
- iPhone (iOS 16.4+) needs Add to Home Screen for push: show a one-time, dismissible install card in English and Arabic.
- All new copy in English and Arabic; RTL safe; phone width without horizontal scroll. UI tasks read Impeccable `reference/craft-floor.md` first.

**Ruling (plan):** spec §7 also stops follow-ups for other portal events (new requests, Discover asks, referrals, campaign content). Those flows still rely on follow-ups and have no thread yet; they move in Step 5 when context threads and system lines exist. Step 4 decouples conversation messages only.
**Ruling (plan):** the Today queue does not exist yet (marketing Phase 1). Red threads surface in the Inbox through an **Overdue** filter and an overdue notification instead.

## Review Focus

1. A message arriving at 16:30 on Thursday — its 4-hour target lands on Sunday 11:30, not Thursday 20:30 or Friday.
2. A burst of 5 client messages in 1 minute — one phone notification "5 new messages", not five.
3. A client writing at 23:00 — no staff phone buzz until 08:00, then one summary; the in-app bell still updates immediately.
4. A "Mark done" tap on a notification after the thread was reassigned or the token expired — refused safely, nothing changes, no error page.
5. A staff user who turned previews off — the lock screen shows "New message from Al Mouj Café", never the text.

---

### Task 1: Working hours and response targets

**Files:**
- Create: `backend/src/conversations/sla.ts`
- Modify: `backend/src/data/store.ts` (migration `132_conversation_settings`: table `conversation_settings(companyId PK, responseTargetHours REAL, workDays TEXT JSON, dayStart TEXT 'HH:MM', dayEnd TEXT 'HH:MM', timeZone TEXT, updatedAt)`; store methods), `backend/src/conversations/views.ts` (`staffThreadView` gains `sla`), `backend/src/conversations/staff-routes.ts` (inbox `state=overdue`, settings routes), `backend/test/api.test.js` (pin migration)
- Test: `backend/test/conversations-sla.test.js`

**Interfaces:**
- Produces: `type ConversationSettings = { responseTargetHours: number; workDays: number[] /* 0=Sun */; dayStart: string; dayEnd: string; timeZone: string }`; `DEFAULT_CONVERSATION_SETTINGS = { responseTargetHours: 4, workDays: [0,1,2,3,4], dayStart: '08:00', dayEnd: '17:00', timeZone: 'Asia/Muscat' }`; `store.conversations.settings(companyId): ConversationSettings`; `store.conversations.setSettings(companyId, s)`; `addWorkingHours(startIso: string, hours: number, s: ConversationSettings): string`; `workingHoursBetween(startIso: string, endIso: string, s): number`; `slaOf(waitingSince: string | null, nowIso: string, s): { dueAt: string; level: 'ok' | 'amber' | 'red' } | null`.
- `staffThreadView(...)` gains `sla: ReturnType<typeof slaOf>` (null unless state is waiting_us).
- Routes: `GET /companies/:companyId/conversation-settings` (contacts:read), `PUT` same (Admin/Manager via `requireCompanyRoles`-equivalent dep; validate target 0.5–72 h, workDays non-empty subset 0–6, HH:MM with dayStart < dayEnd, timeZone accepted by `Intl.DateTimeFormat`). Inbox accepts `state=overdue` = waiting_us with level red; `waiting_us` lists oldest waitingSince first.

- [ ] **Step 1: Failing tests** (`conversations-sla.test.js`): `addWorkingHours('2026-10-15T12:30:00Z' /* Thu 16:30 Muscat */, 4, DEFAULT)` → Sunday 11:30 Muscat (`'2026-10-18T07:30:00.000Z'`); a start at 22:00 Muscat counts from 08:00 next working day; a Friday start counts from Sunday 08:00; `workingHoursBetween` across a weekend excludes Fri/Sat; `slaOf` is `amber` at 2 h of 4 and `red` at 4 h 1 min; settings PUT rejects `dayStart >= dayEnd` and unknown time zones; inbox `state=overdue` lists only red threads.
- [ ] **Step 2:** `cd backend && npm run build && NODE_ENV=test node --test --require ./test/helpers/loopback.js test/conversations-sla.test.js` → FAIL.
- [ ] **Step 3:** Implement. Muscat has no DST, but compute wall-clock with `Intl.DateTimeFormat(timeZone)` parts, not fixed offsets.
- [ ] **Step 4:** Focused test PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(conversations): working hours and response targets`.

### Task 2: Staff message alerts (grouped, previewed, follow-ups decoupled)

**Files:**
- Modify: `backend/src/types.ts` (`NotificationCategory` adds `'messages'`; `NotificationType` adds `'message_received' | 'thread_assigned' | 'response_overdue'`; `mention` moves to category `messages`), `backend/src/notifications.ts` (meta, modules → `'contacts'`, default prefs `messages: { inApp: true, email: false, push: true }`, prefs gain top-level `pushPreview: boolean` default true), `backend/src/data/store.ts` (`upsertThreadNotification` helper), `backend/src/portal/thread.ts` (`afterPortalMessage` stops raising the reply follow-up; `afterStaffMessage` keeps closing any old open reply follow-ups), `backend/src/conversations/staff-routes.ts` (assignment → `thread_assigned`), `backend/src/server.ts` (`dispatchPush` honours throttle + preview; SLA sweep every 5 min)
- Test: `backend/test/conversations-alerts.test.js`

**Interfaces:**
- Produces: `notifyThreadMessage(store, thread: Thread, message: ConvMessage): void` (in a new `backend/src/conversations/alerts.ts`) — recipients: assignee, else conversation owner, else company Admins; one unread notification per (user, thread) is updated in place (title "3 new messages from Al Mouj Café", `data.count`, `data.messageId` latest, `link /inbox?thread=<id>&message=<id>`) instead of inserting a new one.
- `sweepResponseOverdue(store, companyId, nowIso): number` — one `response_overdue` notification per (thread, waitingSince) when `slaOf` turns red; recipients as above.
- Push throttle: a `message_received` notification for the same (user, thread) is pushed at most once per 2 minutes; the next push after the window carries the current count (tag `thread:<id>`).
- Preview: staff push body = first 120 chars of the latest external message when `prefs.pushPreview`, else empty; never for internal notes.

- [ ] **Step 1: Failing tests:** five portal messages within 60 s → one unread `message_received` notification with count 5 and push sender called once; a sixth after 2 min → second push with count 6; assigning a thread notifies the new assignee; no `portal_message` follow-up is created any more; `sweepResponseOverdue` notifies once per waiting episode and again after a new episode; preview off → push body empty; internal note never produces `message_received`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; call `notifyThreadMessage` from every inbound external message path (portal POST on threads and legacy `/:audience/messages`).
- [ ] **Step 4:** PASS; full `npm test` green (update tests that asserted the reply follow-up).
- [ ] **Step 5:** Commit `feat(conversations): grouped message alerts and overdue warnings`.

### Task 3: Quiet hours and morning summary (staff and portal push)

**Files:**
- Create: `backend/src/push/quiet-hours.ts`
- Modify: `backend/src/server.ts` (`dispatchPush`), `backend/src/portal/push-alerts.ts`, `backend/src/push/push-store.ts` (table `push_held(audience, principalId, companyId, tag, url, title, body, heldAt, PK(audience, principalId, tag))` in migration `133_push_held`), `backend/test/api.test.js`
- Test: `backend/test/push-quiet-hours.test.js`

**Interfaces:**
- Produces: `inQuietHours(nowIso: string, timeZone: string, start = '22:00', end = '08:00'): boolean`; `holdPush(store, audience, principalId, companyId, payload)`; `releaseHeldPush(store, send, companyId, nowIso): number` — after quiet hours, one summary per person: title company name, body "N conversations need you" / Arabic, url `/inbox` (staff) or `/messages` (portal), then clears held rows. Staff and portal sweeps call `inQuietHours` with the company's `conversation_settings.timeZone`; in-app notifications are never held.

- [ ] **Step 1: Failing tests:** 23:00 Muscat → `inQuietHours` true, 08:00 false, 07:59 true; a staff message at 23:00 → no push sent, one held row; release at 08:05 → one summary push, held cleared; portal push at 23:30 held likewise; two held tags → summary says 2.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; run `releaseHeldPush` from the existing hourly/5-minute sweep loop.
- [ ] **Step 4:** PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(push): quiet hours with a morning summary`.

### Task 4: Portal alert preferences, thread grouping and preview

**Files:**
- Modify: `backend/src/portal/alerts.ts` (`portal_alert_prefs` gains `groups JSON` and `preview INTEGER` in migration `134_portal_alert_groups`; `AlertPrefs` gains `groups: Record<AlertGroup, { push: boolean; whatsapp: boolean }>` and `preview: boolean`), `backend/src/portal/push-alerts.ts` (message events grouped per thread: tag `thread:<id>`, body count, 2-minute throttle, preview of the latest external portal message when `preview`), `backend/src/portal/alerts-routes.ts` (GET/PUT accept the matrix), `backend/test/api.test.js`
- Test: extend `backend/test/portal-alerts.test.js`, `backend/test/portal-push.test.js`

**Interfaces:**
- `type AlertGroup = 'messages' | 'proposals' | 'content' | 'money' | 'invites'` mapping events: message→messages, proposal & request→proposals, review & changes→content, payout→money, invitation→invites. Defaults: all groups push true; whatsapp true only for proposals and content (the "things waiting on them" digest); preview true.
- `currentEvents` unchanged; sweeps filter by the person's group × channel.

- [ ] **Step 1: Failing tests:** client turns off messages push → staff message produces no push but still a WhatsApp line if enabled; three staff messages in a thread → one push with count 3, tag `thread:<id>`; preview off → body without message text; an internal note never appears in any portal push or digest (poison text).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(portal): alert preferences by group, grouped message push, preview switch`.

### Task 5: Richer push and service workers (badge, renotify, actions)

**Files:**
- Create: `backend/src/push/action-token.ts`, `backend/src/routes/push-actions.ts` (mounted in server.ts)
- Modify: `backend/src/push/push.ts` (`PushPayload` gains `badge?: number`, `renotify?: boolean`, `actions?: Array<{ action: 'open' | 'done'; title: string }>`, `actionToken?: string`), staff push building in server.ts and portal push in push-alerts.ts (fill badge: staff = inbox counts mine + unassigned waiting; portal = unread threads), `frontend/public/sw.js`, `portal/public/sw.js`, `frontend/src/modules/layout/components/sidebar-nav.tsx` (call `navigator.setAppBadge(count)` / `clearAppBadge()` when counts load, feature-detected), portal equivalent where the messages unread count is known
- Test: `backend/test/push-actions.test.js`

**Interfaces:**
- `signActionToken({ userId, threadId, action: 'done' }, ttlMs = 24h): string` / `verifyActionToken(token): { userId, threadId, action } | null` — HMAC-SHA256 with key `PUSH_ACTION_SECRET` (fallback: derive from `PUSH_VAPID_PRIVATE_KEY`; tests inject).
- `POST /push-actions/:token` — no session; verifies token, that the user is still active, a member of the thread's company, can see the contact (same guards as Step 1 staff routes) and the thread is assigned to them or unassigned; then sets state `done`. Responds 204; refused → 404, nothing changes.
- Service worker: `showNotification(title, { body, tag, renotify, badge icon, actions (staff only, Android shows them), data: { url, actionToken } })`; `notificationclick` with `event.action === 'done'` → `fetch('/api-base/push-actions/'+token, { method: 'POST' })` (staff app: API base from the payload `data.api`), otherwise focus/navigate as today; on push set `self.navigator.setAppBadge(badge)` when supported.

- [ ] **Step 1: Failing tests:** token round-trip; expired token refused; tampered token refused; action by a user who lost access (contact made Private, not owner) → 404 and state unchanged; valid → thread `done`; payload for a staff message contains `badge`, `renotify: true`, `actions` with open and done, `tag thread:<id>`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement backend; update both service workers (no build step — plain JS); feature-detect `setAppBadge`.
- [ ] **Step 4:** PASS; `npm test` green; `cd frontend && npx tsc --noEmit -p .` clean.
- [ ] **Step 5:** Commit `feat(push): thread-grouped notifications with badge and Mark done`.

### Task 6: Devices, preview switch and iPhone install card (both apps)

**Files:**
- Modify: `backend/src/routes/push.ts` (staff) and `backend/src/portal/push-routes.ts` (portal): `GET …/push/devices` → `Array<{ id, label, lastSentAt, createdAt, current: boolean }>` (label parsed from userAgent: "iPhone · Safari", "Android · Chrome", "Mac · Chrome", "Windows · Edge", else "Browser"); `POST …/push/devices/:id/test`; `DELETE …/push/devices/:id` (only own devices; 404 otherwise); staff `PUT /notification-prefs` accepts `pushPreview`
- Modify: `frontend/src/modules/notifications/components/phone-notifications-card.tsx`, portal phone-notifications component (find it beside `WhatsAppAlerts` on the messages page), portal alerts settings UI for the group matrix and preview
- Create: `frontend/src/components/install-app-card.tsx`, `portal/src/components/install-app-card.tsx` (shown when iOS and not standalone and not dismissed — `localStorage` key `installCardDismissed`, wrapped in try/catch; steps: Share → Add to Home Screen → open from the icon), plus a `messages` row in the staff notification preferences UI
- Test: `backend/test/push-devices.test.js`; `frontend/src/lib/device-label.test.ts` (or backend if the parser lives there)

- [ ] **Step 1: Failing tests:** list shows only the caller's devices; another person's device id → 404 on test and delete; test sends exactly one push to that device; label parsing for 5 user agents.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement API and UIs (craft floor first). Staff: Profile/Notifications page shows devices, preview switch, messages category row, install card on iPhone. Portal: profile/messages settings shows devices, group × channel matrix, preview switch, install card.
- [ ] **Step 4:** Backend `npm test`; frontend `npm test`, tsc, eslint; portal `npm test`, tsc → clean.
- [ ] **Step 5:** Commit `feat(push): devices, preview switch and iPhone install guidance`.

### Task 7: Staff UI for response times

**Files:**
- Create: `frontend/src/modules/settings/components/conversation-settings-panel.tsx` (target hours, working days chips Sun–Sat, start/end time, time zone select defaulting to Asia/Muscat)
- Modify: `frontend/src/modules/settings/components/settings-page.tsx` (new "Conversations" section, Admin/Manager), `frontend/src/services/conversationService.ts` (settings calls; `ThreadSummary.sla`), `frontend/src/modules/conversations/components/thread-list.tsx` (amber/red waiting chip with "waiting 3h" text — colour plus text, never colour alone), `inbox-page.tsx` (Overdue tab)

- [ ] **Step 1:** Implement (craft floor first).
- [ ] **Step 2:** `cd frontend && npm test && npx tsc --noEmit -p .` and eslint → clean.
- [ ] **Step 3:** Commit `feat(conversations): response-time settings and overdue in the inbox`.

### Task 8: Verification

- [ ] **Step 1:** All three suites and typechecks green.
- [ ] **Step 2:** Mutation checks: remove the 2-minute throttle → Task 2 burst test fails; remove the quiet-hours check → Task 3 test fails; skip the access re-check in `POST /push-actions` → Task 5 test fails; restore each.
- [ ] **Step 3:** `impeccable detect --json` on changed UI files; fix findings.
- [ ] **Step 4:** Browser (local): inbox shows amber/red chips and the Overdue tab; settings panel saves; staff and portal device lists; Arabic and phone width. Real-device push (installed Android app and iPhone home-screen app: grouping, count, deep link, badge, Mark done) is checked on staging after deploy — note it as the owner's step if no device is available to the controller.
- [ ] **Step 5:** Mark Step 4 done in the spec; commit; ask the owner before merging and deploying.
