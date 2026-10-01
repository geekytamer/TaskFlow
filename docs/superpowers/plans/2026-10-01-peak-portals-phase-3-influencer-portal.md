# Peak Portals — Phase 3: Influencer Portal

Date: 2026-10-01
Branch: `feature/peak-portal`
Builds on: `2026-09-24-influencer-portal-design.md` (I1, I2), Phase 2 (client portal),
`2026-09-27-portal-communication-and-referrals-design.md`.

Contracts, test cases and order only; code is written against the real files at
execution time (principle 2). Each slice goes DB → API → portal → staff → browser in
both languages → `next start`, and is committed working (principles 1, 3).

## Amendments to the influencer design, from reading the code (2026-10-01)

1. **Briefs and the client-approval switch live in new tables**, not new columns on
   `crm_campaigns` / `campaign_deliverables`: `portal_campaign_briefs (campaignId,
   influencerBrief, requireClientApproval)` and `portal_deliverable_briefs
   (deliverableId, brief)`. Same reason as `portal_catalogue`: shared tables used by
   every company are not changed for one tenant.
2. **Messages and referrals are in scope.** The design's "Messaging" non-goal predates
   the communication design. The backend for both is already audience-generic; this
   phase adds the influencer screens.
3. **Payouts are the bills that pay this influencer's own work**: bills linked from
   deliverables where they are the paid party (`vendorBillId`), plus their referral
   commission bills. Not every bill for `Contact.supplierId`, which can be unset or
   shared and would show unrelated payables.
4. **An influencer sees their own `agreedRate`** on their own assignments (their pay,
   per the 2026-09-28 decision). No market rates, no other influencer's rate, no
   client price, cost, budget or margin.
5. **Submissions are links only** in this phase, as designed; portal files stay on
   messages and requests.
6. **Staff review is recorded on the submission version** (`deliverable_submissions`
   carries the staff decision and comment), not as a new `deliverable_reviews` kind:
   that table's CHECK only allows `client`, and a decision belongs to the exact
   version reviewed. The client stage keeps using `deliverable_reviews`.
7. **Reminders** for unsubmitted deliverables due within 48 hours are created as
   follow-ups for the campaign owner plus an in-portal "due soon" item; reminder
   *email* waits for a verified sender domain (still an open input).

## Slices

### 3a — Profile and assignments

Migration `090_influencer_portal`: `portal_campaign_briefs`, `portal_deliverable_briefs`,
`portal_assignment_responses (assignmentId UNIQUE, portalUserId, decision, reason)`,
`contact_change_requests (id, companyId, contactId, portalUserId, changes JSON, status
pending|approved|rejected, note, reviewedByUserId, reviewedAt, createdAt)`.

Influencer API (`requireSessionFor('influencer')`):

- `GET /influencer/profile`: name, niche, location, languages, availability, accounts
  (platform, handle, url, followers, engagement), rate card amount and currency, and
  the pending change request if any. Never: notes, tags, owner, lead fields,
  visibility, custom fields, tax number, client/supplier links, catalogue listing.
- `POST /influencer/profile/availability`: `Available | Partially Available |
  Unavailable`, applied at once through `updateContact`.
- `POST /influencer/profile/change-requests`: any of niche, location, languages, rate
  card amount, accounts. One pending request at a time (409). Notifies the contact
  owner (fallback: inviter) and opens a review follow-up.
- `GET /influencer/assignments`: assignments whose status is not `Planned`, on
  non-archived campaigns. Status `awaiting_reply` (Contacted), `confirmed`,
  `declined` (Cancelled), `completed`. Campaign name, brand (client contact name),
  dates, agreed rate and currency, deliverables (title, platform, due date, status);
  the campaign brief and deliverable briefs only once confirmed.
- `POST /influencer/assignments/:id/respond`: `accepted | declined` (+ reason, required
  for decline) only from `Contacted`; moves the assignment through
  `updateCampaignAssignment`; one response per assignment; notifies the campaign
  owner; a decline also opens a follow-up.

Staff API (`canManagePortal`): campaign brief get/put, deliverable brief put, a
contact's change requests list, approve (applies through `updateContact`) and reject
with a note.

Tests: poison fixture (deliverable price and cost, campaign budget and notes,
assignment notes, a second assignee and their rate, contact notes/tags/owner, an
invoice); isolation between two influencers; Planned hidden; brief hidden before
accepting; respond only from Contacted and only once; a client session gets 401;
change request single-pending, approve applies, reject leaves the contact unchanged.

Portal: influencer navigation (Overview, Assignments, Profile, Messages, Referrals);
the Messages and Referrals pages become audience-generic. Staff: brief editor and
client-approval switch on the campaign, change-request review in the influencer sheet.

### 3b — Submissions and the review loop

Migration: `deliverable_submissions (id, deliverableId, contactId, portalUserId,
version, contentUrl, caption, submittedAt, staffDecision, staffComment,
reviewedByUserId, reviewedAt)`.

- Influencer: start (`Planned` → `In Progress`), submit link + caption (new version,
  `Submitted`, `contentUrl` set through `updateCampaignDeliverable`), mark published
  with the post URL once `Approved`.
- Staff: approve or request changes on the latest version. Changes → `In Progress`
  with the comment shown to the influencer. Approve → `Approved`, unless the campaign
  requires client approval and the client has not approved this link yet; then the
  deliverable waits for the client, and the client's approval (2c route) completes it.
- Client (2c) sees influencer-submitted content only after staff approve it.
- Due-soon reminders as in amendment 7.

### 3c — Payouts and dashboard

- `GET /influencer/payouts`: per amendment 3; status Pending (Draft), Approved
  (Approved/Overdue), Paid with date. Bill number, campaign name, amount, due date.
- Dashboard "needs your action": assignments awaiting reply, deliverables due or with
  changes requested, recent payouts, unread team messages.

## Exit criteria

Roadmap Phase 3: an influencer accepts an assignment, submits, staff request changes
then approve, the influencer marks it published, and payout status follows the vendor
bill. The secrecy fixture never appears in an influencer response (mutation-checked).
Driven in both languages at phone width and under `next start`.

## Still open (not blocking)

The structurally private workspace for influencers' non-Peak business (design §9) is
not designed. Nothing in this phase stores data about an influencer's other clients.
