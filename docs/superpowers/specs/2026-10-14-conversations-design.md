# Conversations — one place for every channel — Design

Date: 2026-10-14
Status: design approved section by section in conversation; this written spec awaits the owner's review.
Applies to: every TaskFlow company (not only Peak). The client/influencer portal is one channel among others, present only where the portal is enabled.

## 1. Problem

Communication is spread over ten surfaces that do not know about each other:

| Today | Where | Problem |
|---|---|---|
| Portal messages (staff ↔ client/influencer) | One thread per contact, inside the "Portal access" panel | Buried in an access-settings panel; no inbox across contacts; not tied to a campaign/request |
| WhatsApp (Green API) | Separate `/whatsapp` page | Cut off from the same person's other history |
| Logged activities (calls, WhatsApp, email typed in) | CRM activity log | Duplicates real messages; another list |
| Follow-ups | Follow-ups page | Also used as the landing place for portal events (tasks and alerts conflated) |
| Staff alerts | Bell + push | Separate from portal-user alerts |
| Portal-user alerts | WhatsApp digest + push | A second alert system |
| Content feedback | Inside deliverable review | Its own island |
| Internal notes | contact notes field, follow-up notes, opportunity notes | Scattered free text; no line between staff-only and client-visible |
| Task comments | Tasks only | No comments elsewhere |
| Email | System emails only (invites, passwords) | No email conversations |

Root causes: no single home per relationship; external vs internal not segregated; conversations not tied to their topic; tasks and alerts used for each other's job; no inbox for "waiting on us".

## 2. Decisions (owner, 2026-10-14)

1. **One inbox, all channels.** Portal, WhatsApp and email are channels of one conversation per party (approach A).
2. **Model:** Conversation → Threads → Messages; each message has a *channel* and a *visibility* (external / internal).
3. **Places:** staff Inbox; contact Conversation tab; threads embedded on campaigns, requests and content; portal Messages (portal channel only); alerts are pointers only; follow-ups are planned actions only; the activity log stays audit-only.
4. **Ownership & states:** conversation owner = contact owner by default; threads assignable; states Waiting on us / Waiting on them / Done / Snoozed; new external message reopens.
5. **Response time:** first-reply target 4 working hours by default (Muscat working week Sun–Thu 08:00–17:00), configurable per company; amber at half, red past it; feeds the Today queue.
6. **One alert system** for staff and portal users: per-person preferences of *what* × *how* (in-app, push, WhatsApp, email); grouping within 2 minutes; quiet hours 22:00–08:00 for push; "Seen" on portal messages.
7. **Email:** company shared mailboxes **and** per-user personal mailboxes over standard IMAP/SMTP (cPanel/Hostinger, Gmail app passwords, Zoho, …). Microsoft 365 (OAuth) is a later step.
8. **Every message shows which employee sent it** (owner, 2026-10-14), on every channel, including WhatsApp sent from the company number and email sent from a shared mailbox (see §3 Sender identity).
9. **Proper phone push** for TaskFlow and both portals (owner, 2026-10-14): installable apps, grouped and deep-linked notifications, badge counts, device management (see §7a).
10. **Personal mailboxes import everything.** Emails matching a contact or thread join that conversation (visible to staff who can see the contact); everything else stays visible to the mailbox owner only, in their Unmatched list, where they can attach it to a contact. A message the owner marks private stays owner-only.

## 3. Model

- **Conversation** — one per external party (a contact: client company, influencer, supplier) per company. Owner (staff user). Participants are derived: the contact's portal users, phone numbers, email addresses, plus staff who wrote in it.
- **Thread** — a topic inside a conversation. `General` always exists; others are tied to a context: campaign, request, proposal, deliverable (content review). Fields: subject, context (type, id), assignee, state, waitingSince, snoozedUntil, lastMessageAt, slaDueAt.
- **Message** — channel (`portal` | `whatsapp` | `email` | `call` | `meeting` | `system`), direction (`in` | `out` | `none`), visibility (`external` | `internal` | `owner_private`), author (staff user / portal user / external address or phone), body (text; email also keeps sanitized HTML), delivery status (`queued` | `sent` | `delivered` | `read` | `failed` + error), external ids (WhatsApp id, email Message-ID / In-Reply-To / References), seenAt (portal), attachments, mentions.
  - `internal` = staff only, shown shaded with a lock, can never be sent out.
  - `owner_private` = only the mailbox owner (unmatched or marked private personal email).
- **Sender identity** — every message records its real author, whatever the channel:
  - staff messages store the employee (`authorUserId`) even when the outside party sees only the company WhatsApp number or a shared mailbox; the staff timeline shows the employee's photo and name, the channel, and the route ("via company WhatsApp", "via sales@peak…", "from tamer@…");
  - internal notes, logged calls/meetings and system lines show who wrote, logged or triggered them ("Proposal sent by Sara");
  - inbound messages show the outside person: portal user name, the contact person matched to the phone number, or the email sender's name and address;
  - messages are never re-attributed; an internal note can be edited by its author for 15 minutes and then shows "edited";
  - the portal shows the staff member's name with the company name ("Sara · Peak"), as today.
- **Attachment** — one file store for every channel (portal uploads, WhatsApp media, email attachments), listed per conversation in a Files tab.
- **Channel accounts** — WhatsApp instance (exists), mailboxes (shared / personal), portal (exists).

## 4. Data (new tables; migrations numbered after the current head)

- `conversations(id, companyId, contactId UNIQUE per company, ownerUserId, createdAt)`
- `conversation_threads(id, conversationId, companyId, subject, contextType, contextId, assigneeUserId, state, waitingSince, snoozedUntil, slaDueAt, lastMessageAt, createdAt)` — unique (conversationId, contextType, contextId)
- `conversation_messages(id, threadId, conversationId, companyId, channel, direction, visibility, authorType, authorUserId, authorPortalUserId, externalFrom, externalTo, subject, body, bodyHtml, status, error, externalId, inReplyTo, mailboxId, seenAt, createdAt)` — indexes on (threadId, createdAt), (companyId, externalId)
- `conversation_message_files(messageId, fileId)` — reuses `portal_files` storage (renamed concept: files)
- `conversation_mentions(messageId, userId)`
- `mailboxes(id, companyId, kind shared|personal, ownerUserId, address, displayName, imapHost, imapPort, smtpHost, smtpPort, username, passwordSealed, defaultAssigneeUserId, status, lastError, lastUid JSON per folder, createdAt)`
- `mail_unmatched(id, mailboxId, ownerUserId, messageId, from, to, subject, snippet, receivedAt, attachedToConversationId)` — owner-only list
- `alert_preferences(personType staff|portal, personId, event, inApp, push, whatsapp, email)` — replaces `portal_alert_prefs`; staff defaults seeded
- `alert_log` — one log for both audiences (replaces `portal_alert_log` / `portal_push_log` use)
- Company settings: `responseTargetHours` (4), working week and hours.

Secrets: mailbox passwords sealed with the existing token-sealing approach (key ring env, like `SOCIAL_TOKEN_KEYS` / `WHATSAPP_ENCRYPTION_KEY`); production refuses to start a mail poller without the key.

## 5. Channels

**Portal** — staff reply with channel Portal; portal users write from Messages. Seen = portal user opened the thread after the message.

**WhatsApp** — existing Green API instance per company. Incoming: match phone to a contact's phone numbers → its conversation, General thread (staff can move a message to another thread). Unknown number → Inbox "Unmatched" (link to contact or create one). Media saved as files. Outgoing from the composer. History imported once from `whatsapp_messages`.

**Email** —
- Poller per mailbox every 2 minutes over IMAP (INBOX and Sent), resuming by UID; later IMAP IDLE.
- Matching order: (1) In-Reply-To / References to a known message → its thread; (2) thread code in subject `[#T-xxxx]`; (3) sender/recipient address matches a contact → that contact's General thread; (4) otherwise: shared mailbox → Inbox Unmatched; personal mailbox → owner's `mail_unmatched`.
- Sending over SMTP from the user's personal mailbox when connected, else the thread's shared mailbox; proper Message-ID, In-Reply-To, References; thread code in subject; a copy appended to the mailbox Sent folder (IMAP APPEND) so it shows in the user's mail app.
- HTML is sanitized before display; remote images blocked until "show images"; attachments size-capped like portal files.
- Settings: Settings → Channels (shared, admin) and My profile → Email (personal), both with auto-filled cPanel defaults (`mail.<domain>`, 993/465) and a Test connection button.
- Leaving staff: personal mailbox disconnected; already-imported matched emails remain on the contact; owner_private items are deleted with the mailbox.

**Calls & meetings** — "Log a call / meeting" in the composer creates a `call`/`meeting` entry (replaces the CRM "Log activity" list).

**System** — events such as "Proposal sent", "Request closed", "Content approved" post a `system` line in the relevant thread, so the thread tells the whole story.

## 6. Ownership, states, response time

- Owner = contact owner; new threads assigned to: campaign owner (campaign thread), opportunity owner (request/proposal thread), otherwise the conversation owner; mailbox default assignee for unmatched shared mail.
- Inbound external message → thread `Waiting on us`, `waitingSince` set if not already; staff external reply → `Waiting on them`; Done by staff; Snooze to a date → back to Waiting on us then; any new inbound reopens.
- `slaDueAt` = waitingSince + target in working hours. Amber at 50%, red past due. Red threads appear in the Today queue (Phase 1 of the marketing roadmap).

## 7. Alerts (one system)

- Events: new message (thread owner/assignee, or contact owner when unassigned), mention, assignment, SLA amber/red, plus the existing portal events (proposal, content to review, payout, request update, invitation, changes requested).
- Delivery per person per event: in-app (staff bell; portal bell), push (existing web push), WhatsApp (existing portal digest), email.
- Defaults: staff — push for own threads and mentions, in-app for all; portal users — push for new Peak messages, WhatsApp digest for things waiting on them.
- Messages within 2 minutes on one thread group into one alert; push quiet hours 22:00–08:00 (items wait for the morning digest).
- Alerts carry only a pointer (thread + message) and are derived from data, never stored as the record.
- Follow-ups are no longer created for incoming messages or portal events; they remain for planned actions (and a "Create follow-up" button on any message).

## 7a. Phone push (TaskFlow and both portals)

- **Installable apps** — TaskFlow, the client portal and the influencer portal each install to the home screen (web app manifest, icons, standalone). Android shows the install prompt; iPhone (iOS 16.4 and later) needs "Add to Home Screen" for push, so an in-app card walks iPhone users through it once, in English and Arabic.
- **What a notification shows** — title: the sender and party ("Sara · Al Noor Dates"); body: a preview of the message, which each person can switch off (privacy on lock screens); internal-note content is never sent to portal users and never previewed outside the company's own staff.
- **Grouping** — one notification per thread (`tag` = thread), replaced and re-alerted as new messages arrive, with a count ("3 new messages"); together with the 2-minute grouping and quiet hours of §7.
- **Opening** — tapping focuses the open app window if there is one, else opens it, straight on the thread at that message, and marks it seen.
- **Badge** — the app icon shows the number of threads waiting on the person (Badging API where the phone supports it; cleared as they are read).
- **Actions** — on Android: "Open" and, for staff, "Mark done"; iPhone shows the notification without actions (platform limit). Inline reply from a notification is not possible for web apps.
- **Devices** — My profile lists each device that receives push (name, last used), with "Send a test" and "Remove"; dead subscriptions are removed automatically when the push service rejects them.
- **Later, only if needed** — a native wrapper (store apps) would add inline reply and push on iPhones without installing from the browser; it needs Apple ($99/year) and Google ($25 once) developer accounts. Not in this plan.

## 8. Screens

1. **Inbox** (`/inbox`, top of sidebar, unread badge). Three columns: thread list (filters: Mine / Unassigned / All, Waiting on us, Channel, search) · timeline (internal notes shaded with a lock; composer with channel switch Portal / WhatsApp / Email / Internal note, templates, attachments, @mentions) · context panel (contact card, linked campaign/request, assign, snooze, done, create follow-up, files). Unmatched tab for WhatsApp numbers / shared-mailbox emails; personal Unmatched for the user's own mail.
2. **Contact page → Conversation tab** — same timeline and composer, all threads, Files tab.
3. **Embedded threads** — campaign, request (client-requests sheet), deliverable review, using the same component.
4. **Portal Messages** (client and influencer) — phone-first thread list (General + one per campaign/request) then the chat; portal channel only; Seen; files.
5. **Settings → Channels** — WhatsApp, shared mailboxes, portal, response-time target and working hours, templates; list of users with personal mailboxes.
6. **My profile → Email, Alerts and Devices** — connect / test / disconnect personal mailbox; alert preferences (what × how, preview on/off); devices receiving push with test and remove; the iPhone install card.
7. Redirects: `/whatsapp` → Inbox filtered to WhatsApp; Portal access panel keeps only access settings with a link to the conversation.

## 9. Migration of existing data

- `account_messages` + their files → General thread of each contact's conversation (channel portal).
- `whatsapp_messages` → matched conversations (or Unmatched).
- CRM activities → `call`/`meeting`/logged entries in the timeline (kept read-only with their original category).
- Deliverable review comments → the deliverable's thread (external for client-visible, internal for staff-only).
- Portal-event follow-ups already open stay as they are; no new ones are created.
- Old endpoints keep working until their screens are replaced, then are removed.

## 10. Security and privacy

- Visibility enforced on the server for every read: portal users get only `external` messages of the portal channel in their own conversation; staff get `external` + `internal` for contacts they can see (existing contact visibility rules); `owner_private` only for the owner.
- Mailbox credentials sealed; never returned to clients after saving.
- Email HTML sanitized; remote content blocked by default; attachment types and sizes capped; no automatic link fetching.
- Tests use poison fixtures to prove internal notes and owner-private mail never reach portal users or other staff.

## 11. Delivery in phases (each ships alone)

1. ✅ **Done 2026-10-15 (branch feature/conversations, 4f9674a..HEAD)** — **Foundation + portal channel** — tables, conversation/thread/message API, migration of portal messages, internal notes, Inbox (portal + internal), contact Conversation tab, portal Messages with threads and Seen, states and assignment.
2. **WhatsApp into the Inbox** — inbound/outbound through conversations, Unmatched, history import, `/whatsapp` redirect.
3. **Email** — shared mailboxes, then personal mailboxes (import everything, owner Unmatched), sending with threading and Sent copy, Settings/Profile screens.
4. ✅ **Done 2026-10-15 (branch feature/conversations-step4, 424cfbb..HEAD)** — **One alert system + response times + phone push** — preferences, grouping, quiet hours, deep-linked and grouped push with badges and devices, install guidance, SLA colours and Today queue, follow-ups decoupled. Rulings: only conversation messages stopped raising follow-ups (other portal events move in step 5); no Today queue yet, so overdue threads use an Inbox Overdue filter plus a notification; storage-excursion alarms bypass quiet hours; existing WhatsApp opt-ins keep every group.
5. **Context threads** — campaign, request, proposal and content-review threads embedded; review comments and CRM activities migrated; system lines.
6. Later: Microsoft 365 OAuth, IMAP IDLE, shared templates library growth.

## 12. Testing

`node --test` per phase: visibility (poison internal/owner-private content never leaks to portal or other staff), matching (email headers, subject code, address; WhatsApp phone), state transitions and reopening, SLA in working hours (weekend and after-hours cases), alert grouping and quiet hours, migrations (counts and ownership preserved), mailbox sealing and connection-test errors (a fake IMAP/SMTP server in tests), HTML sanitization, sender identity (staff author stored and shown for WhatsApp/shared-mailbox sends; never lost on migration), push payloads (tag per thread, deep link, preview switch respected, no internal content to portal users, dead subscriptions removed). Browser checks in English/Arabic, desktop and phone, light and dark, for Inbox, contact tab and portal Messages; push checked on an installed Android app and an installed iPhone app (grouping, deep link, badge). Mutation checks on visibility guards.

## 13. Product brief for the screens (feeds Impeccable)

- **Who:** account managers and sales (live in the Inbox all day), finance and operations (accounts@ mail, suppliers), managers (watching response times); clients and influencers on phones in the portal.
- **Mode:** Operate — speed of triage, clarity of who-sees-what, calm density; not decoration.
- **Must feel:** one obvious place to answer people; the line between "client sees this" and "only us" impossible to miss; Arabic and English equal; works one-handed on a phone for portal users.
- **Assumptions to confirm at design time:** team size per company (5–30 staff), message volume (tens to low hundreds per day per company), most clients reachable on WhatsApp first.
