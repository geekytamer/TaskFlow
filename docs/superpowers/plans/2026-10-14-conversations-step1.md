# Conversations — Step 1 (Inbox + portal channel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One conversation per party with threads and messages (portal + internal notes), visible in a staff Inbox and on the contact page, and threaded Messages in both portals, replacing the single `account_messages` thread.

**Architecture:** A new backend module `backend/src/conversations/` owns storage (`ConversationsStore` on `DataStore.conversations`), visibility rules and DTOs, staff routes and portal routes. Migration 131 creates the tables and copies `account_messages` into each contact's General thread keeping message ids (so existing `portal_files` rows with `parentType='message'` stay attached). The old message endpoints become thin wrappers over the General thread until their screens are gone. Frontend: one shared thread component used by the Inbox and the contact Conversation tab; the portal gets a thread list and a thread page.

**Tech Stack:** Express + better-sqlite3 (backend, `node:test` + supertest, `npm test` builds first), Next.js staff app (shadcn, `tr(en, ar)`, `apiFetch`), Next.js portal (`t(lang, key)` dictionary in `portal/src/lib/i18n.ts`).

**Spec:** `docs/superpowers/specs/2026-10-14-conversations-design.md` (sections 2, 3, 4, 6, 8, 9, 10). Step 4 (alerts, response times, push) follows this plan; follow-ups are NOT decoupled here.

## Global Constraints

- Every TaskFlow company gets conversations; the portal channel exists only where the portal is enabled (`portalCompanyId`).
- Message body 1–4000 characters (`MAX_MESSAGE_CHARS`); at most 10 files per message (`MAX_FILES_PER_ITEM`), reuse `parseMessage` / `parseFileIds` / `store.thread.attach`.
- Channels in this step: `portal`, `internal` visibility notes (stored as channel `note`, visibility `internal`), `system` reserved. Visibility values: `external` | `internal` | `owner_private`.
- Thread states: `waiting_us` | `waiting_them` | `done` | `snoozed`; a snoozed thread whose `snoozedUntil` has passed reads as `waiting_us`.
- Inbound portal message → `waiting_us` (keep the earliest `waitingSince`); staff external reply → `waiting_them` (clear `waitingSince`); internal note changes no state.
- Conversation owner = contact `ownerUserId`; General thread assignee = owner.
- Every message keeps its real author (`authorUserId` / `authorPortalUserId`); staff views always show author name and photo, channel and time; the portal shows "Name · Company".
- Internal notes editable by their author for 15 minutes, then read-only; edited ones show "edited".
- Portal "Seen" = a portal user of that contact read the thread after the staff message was created.
- Staff see a conversation only if they can see its contact (`visibility = 'Public'` or owner or `CONTACTS_PRIVATE_READ`).
- All new UI copy in English and Arabic; RTL safe; phone width without horizontal scroll.
- UI tasks: read Impeccable `reference/craft-floor.md` before editing; run `impeccable detect --json <changed files>` once after the UI tasks.

## Review Focus

1. A contact switched to Private after messages exist — a staff member without access must not see its thread in the Inbox list, counts or by id (404).
2. A portal user requesting another contact's thread id or message id — 404, never the content.
3. A thread snoozed until a date that has passed — listed under Waiting on us and counted in the badge.
4. A mention of a user who is not a member of the company — 400, nothing stored.
5. Migrating an `account_messages` row whose staff author was deleted — the message is kept with a null author name, its files still download.

---

### Task 1: Storage and migration

**Files:**
- Create: `backend/src/conversations/conversations-store.ts`
- Modify: `backend/src/data/store.ts` (migration `131_conversations` after `130_request_close_reason`; `conversations` property beside `thread`)
- Modify: `backend/test/api.test.js` (pin `'131_conversations'`)
- Test: `backend/test/conversations-store.test.js`

**Interfaces:**
- Produces (types): `Conversation { id, companyId, contactId, ownerUserId, createdAt }`; `Thread { id, conversationId, companyId, contactId, subject, contextType: string|null, contextId: string|null, assigneeUserId: string|null, state: ThreadState, waitingSince: string|null, snoozedUntil: string|null, lastMessageAt: string|null, createdAt }`; `ConvMessage { id, threadId, conversationId, companyId, channel: 'portal'|'note'|'system', direction: 'in'|'out'|'none', visibility: Visibility, authorType: 'staff'|'portal'|'system', authorUserId, authorPortalUserId, body, editedAt: string|null, createdAt }`.
- Produces (`ConversationsStore`): `ensureConversation(companyId, contactId): Conversation`; `generalThread(companyId, contactId): Thread`; `getThread(id): Thread|undefined`; `threadsOf(conversationId): Thread[]`; `listThreads(companyId, filter: { contactIds?: Set<string>; assigneeUserId?: string|null; states?: ThreadState[] }): Thread[]` (ordered by lastMessageAt desc); `addMessage(input: Omit<ConvMessage,'id'|'createdAt'|'editedAt'|'conversationId'|'companyId'> & { threadId: string }): ConvMessage` (applies the state rules of Global Constraints in the same transaction); `messages(threadId): ConvMessage[]`; `getMessage(id)`; `editNote(id, body, now)`; `setAssignee(threadId, userId|null)`; `setState(threadId, state, snoozedUntil?)`; `markRead(threadId, reader: { type: 'staff'|'portal'; id: string }, at)`; `readsOf(threadId): Array<{ readerType, readerId, lastReadAt }>`; `addMentions(messageId, userIds)`; `mentionsOf(messageId): string[]`; `effectiveState(thread, now): ThreadState`.
- Tables: `conversations`, `conversation_threads`, `conversation_messages`, `conversation_reads(threadId, readerType, readerId, lastReadAt, PK all three)`, `conversation_mentions(messageId, userId)`; columns as spec §4 plus `editedAt`.

- [ ] **Step 1: Write failing tests** in `conversations-store.test.js`:
  - `ensureConversation is one per contact and creates the General thread assigned to the contact owner` — call twice, same id; `generalThread(...).subject === 'General'`, `assigneeUserId === contact.ownerUserId`.
  - `a portal message sets waiting_us and keeps the first waitingSince; a staff portal reply sets waiting_them; a note changes nothing` — assert `state` and `waitingSince` after each.
  - `a snoozed thread past its date reads as waiting_us` — `effectiveState(thread, later) === 'waiting_us'`.
  - `migration 131 copies account_messages into the General thread with the same ids, authors and files` — open a `DataStore` on a temp file, insert rows into `account_messages` (one portal, one staff with files attached through `store.thread.attach`, one whose staff author is then deleted), then simulate the pre-131 database by `DELETE FROM schema_migrations WHERE id = '131_conversations'` and dropping the five new tables, close it, open a new `DataStore` on the same file (the migration runs again) and assert ids, `authorUserId`, `body`, file still found by `store.thread.filesOf('message', id)`, and a deleted-author row kept.
- [ ] **Step 2:** `cd backend && npm run build && NODE_ENV=test node --test --require ./test/helpers/loopback.js test/conversations-store.test.js` → FAIL (module missing).
- [ ] **Step 3:** Implement the store and migration. Migration copies with `INSERT INTO conversation_messages ... SELECT` from `account_messages` (channel `portal`, visibility `external`, direction `in` for portal authors, `out` for staff), creating conversations and General threads first; thread `state` from the last message (portal → `waiting_us` with `waitingSince` = earliest unanswered portal message after the last staff one; else `waiting_them`).
- [ ] **Step 4:** Run the test → PASS; run `npm test` → all green.
- [ ] **Step 5:** Commit `feat(conversations): storage and migration of portal messages`.

### Task 2: Visibility and views

**Files:**
- Create: `backend/src/conversations/visibility.ts`, `backend/src/conversations/views.ts`
- Test: `backend/test/conversations-visibility.test.js`

**Interfaces:**
- Consumes: Task 1 types and store.
- Produces: `type Viewer = { kind: 'staff'; userId: string; seesPrivate: boolean } | { kind: 'portal'; portalUserId: string; contactId: string }`; `canSeeContact(contact: Contact, viewer: StaffViewer): boolean`; `canSeeMessage(m: ConvMessage, viewer: Viewer, ownerOf?: (m) => string|null): boolean` (portal: `visibility==='external' && channel==='portal'`; staff: not `owner_private` unless owner); `staffMessageView(store, m, thread, now)` → `{ id, threadId, channel, direction, visibility, author: { kind: 'staff'|'portal'|'system', id: string|null, name: string|null, avatar: string|null }, body, files, mentions: Array<{ id, name }>, editedAt, editableUntil: string|null, seenAt: string|null, createdAt }`; `portalMessageView(store, m, viewerPortalUserId)` → `{ id, body, author: { kind: 'you'|'client'|'team', name, company: string|null }, files, createdAt, seen: boolean|null }`; `staffThreadView(store, thread, viewerUserId, now)` → `{ id, contact: { id, name }, subject, contextType, contextId, assignee: { id, name }|null, state, waitingSince, snoozedUntil, lastMessageAt, lastMessage: { body, authorName, visibility }|null, unread: boolean }`.

- [ ] **Step 1: Write failing tests** with a poison fixture: an internal note body `POISON-INTERNAL-7f3`, and an `owner_private` message `POISON-PRIVATE-91c`:
  - `portal viewers never see internal or owner-private messages` — filter `messages(thread)` with `canSeeMessage`, `JSON.stringify` of portal views contains neither poison.
  - `staff see internal notes but not someone else's owner-private mail`.
  - `a private contact is hidden from staff who are neither owner nor allowed` — `canSeeContact` false; true for owner and for `seesPrivate`.
  - `seenAt is set once a portal user of that contact read after the staff message` — markRead before and after; assert null then the read time.
  - `staff view keeps a deleted author as name null` (Review Focus 5).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `unread` = staff `lastReadAt` for viewer < `lastMessageAt` (or no read row). `editableUntil` = `createdAt + 15 min` for the viewer's own notes, else null.
- [ ] **Step 4:** Run → PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(conversations): visibility rules and views`.

### Task 3: Staff API

**Files:**
- Create: `backend/src/conversations/staff-routes.ts`
- Modify: `backend/src/server.ts` (mount `createConversationStaffRouter({ store, authMiddleware, requireCompanyAccess, viewerFor })` where `viewerFor(req, companyId)` returns `{ kind:'staff', userId, seesPrivate: allowsRule(req, companyId, 'CONTACTS_PRIVATE_READ') }`)
- Modify: `backend/src/portal/staff-routes.ts` (old `/companies/:companyId/contacts/:contactId/messages` GET/POST read and write the General thread via the conversations store; responses keep their current shape)
- Test: `backend/test/conversations-staff.test.js`

**Interfaces:**
- Routes (all `requireCompanyAccess`, contact visibility enforced, 404 when not visible):
  - `GET /companies/:companyId/inbox?view=mine|unassigned|all&state=waiting_us|waiting_them|done|snoozed|open&q=` → `{ threads: StaffThreadView[], counts: { mine, unassigned, all } }` (`open` = waiting_us + waiting_them; counts are waiting_us only, snoozed-past-date included).
  - `GET /companies/:companyId/contacts/:contactId/conversation` → `{ conversation: { id, owner }, threads: StaffThreadView[] }` (ensures it exists).
  - `GET /conversation-threads/:id` → `{ thread: StaffThreadView, messages: StaffMessageView[] }` and marks read for the viewer.
  - `POST /conversation-threads/:id/messages` body `{ kind: 'portal'|'note', body, fileIds?, mentionUserIds? }` → 201 `StaffMessageView`. `portal` requires the portal to be enabled for the company and is `external`; `note` is `internal`. Mentions only on notes, each id a member of the company (else 400). Mentioned users get `store.notify` with link `/inbox?thread=<id>&message=<id>`. A portal reply also runs the existing `afterStaffMessage` (closes the reply follow-up).
  - `PATCH /conversation-messages/:id` `{ body }` → own note within 15 minutes, else 403/409.
  - `PATCH /conversation-threads/:id` `{ assigneeUserId?: string|null, state?: 'done'|'waiting_us', snoozedUntil?: ISO date }` (`snoozedUntil` sets state `snoozed`; must be in the future; assignee must be a company member).
- Produces for the frontend: the JSON shapes above.

- [ ] **Step 1: Write failing tests**: inbox counts and views (mine/unassigned/all); private contact hidden from a non-owner Employee and 404 by id (Review Focus 1); portal reply → `waiting_them`, client message → `waiting_us`; note with a mention of a foreign-company user → 400 and nothing stored (Review Focus 4); mention notifies a member; note edit allowed at 10 min, refused at 16 min (fake `now` through a `clock` option or by updating `createdAt` in the DB); snooze past date appears in `waiting_us` and counts (Review Focus 3); old contact messages endpoint still returns the history after migration.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement routes and wiring.
- [ ] **Step 4:** Run → PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(conversations): staff inbox and thread API`.

### Task 4: Portal API

**Files:**
- Create: `backend/src/conversations/portal-routes.ts` (registered from `backend/src/portal/routes.ts` next to `registerThreadRoutes`)
- Modify: `backend/src/portal/thread-routes.ts` (`GET/POST /:audience/messages` read/write the General thread; keep shapes), `backend/src/portal/thread.ts` (`afterPortalMessage` notification link → `/inbox?thread=<id>`), `backend/src/portal/alerts.ts` and `backend/src/portal/push-alerts.ts` (message events from staff `external` portal messages in the conversations store instead of `store.thread.messagesFor`)
- Test: `backend/test/conversations-portal.test.js`; update `backend/test/portal-alerts.test.js`, `backend/test/portal-push.test.js` if they seed through `store.thread.addMessage`.

**Interfaces:**
- `GET /:audience/threads` → `Array<{ id, subject, lastMessageAt, lastMessage: { body, authorKind }|null, unread: boolean }>` (only threads with at least one portal-visible message, plus General always).
- `GET /:audience/threads/:id` → `{ thread: { id, subject }, messages: PortalMessageView[] }`, marks read for the portal user.
- `POST /:audience/threads/:id/messages` `{ body, fileIds? }` → 201 `PortalMessageView` (channel portal, external, direction in; runs `afterPortalMessage`).

- [ ] **Step 1: Write failing tests**: a client lists only their own threads; another contact's thread id → 404 (Review Focus 2); internal note poison never appears in any portal response; opening a thread sets "Seen" on the staff message for staff; the legacy `/client/messages` still works and writes to General; alerts still fire for a staff portal message.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS; `npm test` green (all existing portal message tests).
- [ ] **Step 5:** Commit `feat(conversations): portal threads and seen`.

### Task 5: Staff thread component and service

**Files:**
- Create: `frontend/src/services/conversationService.ts`, `frontend/src/modules/conversations/components/thread-view.tsx`, `frontend/src/modules/conversations/components/message-bubble.tsx`, `frontend/src/modules/conversations/components/composer.tsx`
- Test: `frontend/src/modules/conversations/lib/compose.test.ts` (pure helpers)

**Interfaces:**
- Consumes: Task 3 routes.
- Produces: `getInbox(companyId, view, state, q)`, `getContactConversation(companyId, contactId)`, `getThread(id)`, `sendThreadMessage(id, { kind, body, fileIds, mentionUserIds })`, `editMessage(id, body)`, `updateThread(id, patch)`; `<ThreadView threadId onChanged />` (timeline + composer); helpers `canEdit(message, now): boolean`, `groupByDay(messages, locale)`.
- Behaviour pinned by the spec: internal notes shaded with a lock and the label "Internal note · only your team sees this"; every bubble shows author photo + name, channel, time, and for staff portal messages "Seen" or "Sent"; composer switch **Portal** / **Internal note** (Portal hidden when the company has no portal or the contact has no portal users); @mention picker only in note mode (uses `getCompanyPeople`); attachments via the existing staff upload route.

- [ ] **Step 1:** Write `compose.test.ts`: `canEdit` true at 14:59 after creation, false at 15:01; `groupByDay` groups across midnight in the given time zone.
- [ ] **Step 2:** `cd frontend && npm test` → FAIL.
- [ ] **Step 3:** Implement helpers, service and components (read Impeccable craft floor first).
- [ ] **Step 4:** `npm test` and `npx tsc --noEmit -p .` → PASS.
- [ ] **Step 5:** Commit `feat(conversations): thread view and composer`.

### Task 6: Staff Inbox page

**Files:**
- Create: `frontend/src/app/(app)/inbox/page.tsx`, `frontend/src/modules/conversations/components/inbox-page.tsx`, `frontend/src/modules/conversations/components/thread-list.tsx`, `frontend/src/modules/conversations/components/context-panel.tsx`
- Modify: `frontend/src/modules/layout/components/sidebar-nav.tsx` (Inbox first in Workspace, badge = `counts.mine + counts.unassigned` waiting), `command-palette.tsx`, `frontend/src/modules/layout/lib/nav-permissions.ts` (`'/inbox': 'crm:read'`), `frontend/src/context/i18n-context.tsx` (`nav.inbox` en/ar)

**Interfaces:**
- Consumes: Task 5 service and `<ThreadView>`.
- Layout: three columns on desktop (list · thread · context), one column with back navigation on phones; URL `?thread=<id>&message=<id>` opens and scrolls to a message; filters Mine / Unassigned / All and state tabs Waiting on us / Waiting on them / Done / Snoozed; search; context panel: contact card (link to contact), owner, assign (people picker), Done, Snooze (Tomorrow 08:00, Next week, pick date), Create follow-up (existing follow-up creation), files of the conversation.

- [ ] **Step 1:** Implement page and components (craft floor first).
- [ ] **Step 2:** `npx tsc --noEmit -p .`, `npm test`, eslint on changed files → clean.
- [ ] **Step 3:** Browser: as admin, open `/inbox`, open a thread, send a portal reply and an internal note with a mention, assign, snooze, mark done; check badge counts change; Arabic; phone width.
- [ ] **Step 4:** Commit `feat(conversations): staff inbox`.

### Task 7: Contact page Conversation tab

**Files:**
- Create: `frontend/src/modules/conversations/components/contact-conversation.tsx`
- Modify: `frontend/src/modules/contacts/components/contact-detail-page.tsx` (Conversation section with thread tabs using `<ThreadView>`), `frontend/src/modules/portal-access/components/portal-access-panel.tsx` (remove `<PortalThreadSection>`, add "Open conversation" link to `/contacts/<id>#conversation` or `/inbox?thread=`), delete `portal-thread-section.tsx` if nothing else imports it

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** tsc, tests, eslint clean.
- [ ] **Step 3:** Browser: contact page shows the conversation with history migrated from the old panel; influencer edit sheet no longer shows the thread and links to it.
- [ ] **Step 4:** Commit `feat(conversations): conversation on the contact page`.

### Task 8: Portal Messages with threads

**Files:**
- Modify: `portal/src/lib/messages.ts` (types and `getThreads`, `getThread`), `portal/src/app/(portal)/messages/page.tsx` (thread list; with one thread go straight to it), create `portal/src/app/(portal)/messages/[id]/page.tsx`, create `portal/src/app/api/threads/[id]/messages/route.ts` (forward with `forwardClientWrite`-style helper for both audiences), modify `portal/src/components/message-composer.tsx` (post to the thread route), `portal/src/lib/i18n.ts` (`msg.threads`, `msg.seen`, `msg.sent`, `msg.general` en/ar)
- Test: extend `portal/src/lib/message-groups.test.ts` for seen labelling if logic lands there

**Interfaces:**
- Consumes: Task 4 routes.
- Behaviour: thread list (subject, last message, unread dot); thread page with bubbles "Name · Company" for team messages, "You" for the viewer's own, the colleague's name for other portal users. The portal shows no read receipts; "Seen" is a staff-side marker only (Task 5).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `cd portal && npx tsc --noEmit -p .` (ignore `.next*` generated types) and `npm test` → clean.
- [ ] **Step 3:** Browser: client and influencer portals, Arabic and phone width; send a message, see it in the staff Inbox as Waiting on us; reply from staff, see it in the portal; staff sees "Seen" after the portal user opens the thread.
- [ ] **Step 4:** Commit `feat(portal): threaded messages`.

### Task 9: Verification and record

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-conversations-design.md` (mark Step 1 done with the commit range)

- [ ] **Step 1:** `cd backend && npm test`; `cd frontend && npm test && npx tsc --noEmit -p .`; `cd portal && npm test` → all green.
- [ ] **Step 2:** Mutation checks: remove the portal `canSeeMessage` filter → a Task 2/4 poison test fails; remove the private-contact check in the inbox query → Task 3 test fails; restore.
- [ ] **Step 3:** `/Users/tamerabbasher/.claude/skills/impeccable/scripts/impeccable detect --json` on the changed UI files; fix findings.
- [ ] **Step 4:** Commit `docs: conversations step 1 done`; ask the owner before deploying.
