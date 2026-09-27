# Influencer Portal — Design

Date: 2026-09-24
Branch: `feature/peak-portal`
Status: Draft for review
Builds on: `2026-09-21-peak-media-client-portal-design.md` (portal identity, `audience = influencer`)
Related: `2026-09-24-engagement-games-design.md` (shares `connected_accounts` and the social worker)

## 1. Problem

Influencers are `Contact` records with the `Influencer` role. Staff enter everything
about them: profile, rates, follower counts, deliverable links, payout status. That is
slow, goes stale, and leaves the client portal's deliverable review with nothing to
review until staff type it in.

The influencer portal lets each influencer see and act on their own work, and lets
their follower and engagement figures update themselves once they connect their
accounts.

## 2. Goals

- An influencer sees their profile, assignments, briefs, deliverables and payouts.
- An influencer accepts or declines assignments and submits deliverables.
- Follower and engagement figures are fetched automatically for connected accounts,
  and marked as verified wherever clients see them.
- Nothing about client prices, margins or other influencers reaches an influencer.

## 3. Non-goals

- Public sign-up. Accounts are invited by staff.
- Negotiating rates in the portal. An influencer sees their agreed rate and can
  propose a new rate card, which staff review.
- Messaging. Staff already use the WhatsApp module.
- The shared communication log and referral commissions, which are the same for both audiences: `2026-09-27-portal-communication-and-referrals-design.md`.
- Contracts or e-signature, and file uploads for drafts (links only in v1).
- Posting to social platforms on the influencer's behalf.

## 4. Decisions

| Decision | Rationale |
| --- | --- |
| Identity is `portal_users` with `audience = influencer` bound to a `contactId` that holds the `Influencer` role | Reuses the foundation. Staff invite from the influencer page. An influencer can be invited without being visible in the client catalogue (`portalVisible` is separate). |
| Every influencer response is an **allowlist DTO** (`portal/influencer-dto.ts`) | A separate DTO set from the client portal, because the secrecy runs both ways: clients never see influencer rates, influencers never see client prices. |
| Influencer-facing text is stored in **new fields**: `crm_campaigns.influencerBrief` and `campaign_deliverables.influencerBrief` | Existing `notes` are internal and may hold anything. Staff write the brief on purpose, so internal notes cannot leak. |
| The influencer for a deliverable is `vendorContactId ?? contactId`, and they must hold a non-cancelled `CampaignAssignment` on its campaign | Same rule `generateCampaignVendorBills` already uses to decide who is paid. |
| Assignments in `Planned` are hidden; from `Contacted` the influencer sees the campaign name, **the client's brand name**, dates, their deliverables and their own `agreedRate` | Influencers need the brand to judge conflicts before accepting. |
| Accept and decline go through the existing assignment status values (`Contacted` → `Confirmed` or `Cancelled`); declines record a reason | No new lifecycle. Once `Confirmed`, changes go through staff. |
| Status enum for deliverables is **unchanged**; approval is tracked in `deliverable_reviews` | Adding states to a shared enum touches every consumer. `Approved` is set when every required review approves the latest submission. |
| `crm_campaigns.requireClientApproval` (default 0) adds the client's review to the required set | Some clients approve content, others leave it to the agency. |
| Profile edits are **change requests** reviewed by staff, except `availabilityStatus`, which applies at once | Catalogue data is what clients pay against. |
| Automatic stats overwrite manual stats for a connected account and mark them read-only | One source of truth per account, with a visible provenance. |

## 5. Connected accounts and automatic stats

**Connect.** From the portal an influencer connects an account through the
platform's official OAuth flow (authorization code with PKCE, `state` bound to the
portal session, fixed redirect URIs per host). Scopes are the minimum for reading
their own profile and media. They can disconnect at any time: the token is revoked
at the platform where its API allows, and the stored secret is deleted.

**Storage.** New table, shared with games:

- `connected_accounts` — id, companyId, ownerType (`contact` | `client`), ownerId,
  platform, externalAccountId, handle, tokenEncrypted, refreshTokenEncrypted, keyId,
  scopes, expiresAt, status (`active` | `needs_reconnect` | `revoked`),
  connectedByPortalUserId, connectedAt, lastSyncedAt, lastError.

Tokens are encrypted with AES-256-GCM. The key comes from an environment variable
that is not in git, with a `keyId` so it can be rotated. No API response ever
includes a token, only `status`. Rotating the currently unrotated deployment
secrets comes first.

**Sync.** The social worker (`backend/src/social/`, its own process) runs a daily,
staggered job per active account:

1. Refresh the token before it expires.
2. Fetch followers and, where the platform allows, recent media to compute average
   views and engagement rate. Engagement rate is defined once for all platforms:
   average of (likes + comments) over the last 12 posts, divided by followers. The
   definition is shown in the UI.
3. Insert an `influencer_stat_snapshots` row and update the matching entry in
   `contacts.influencerAccounts`.
4. On an authorization failure, set `needs_reconnect`, email the influencer, and
   notify the contact's owner. The last synced figures stay, labelled with their date.

`influencer_stat_snapshots` — id, contactId, platform, connectedAccountId,
followers, avgViews, engagementRate, capturedAt.

`InfluencerAccount` (stored as JSON in the existing column, so no migration) gains
optional `statsSource` (`manual` | `connected`), `statsSyncedAt` and
`connectedAccountId`. When the account's platform matches
`contact.influencerPlatform`, the sync also updates the legacy `followerCount` and
`engagementRate` so older readers stay correct.

**Display.** The client catalogue shows a "Verified" badge and an "as of" date for
connected figures, and "Reported" for manual ones. Staff see connection status per
platform on the influencer page.

Which platforms can be read, and with what account type, is decided by the games
design's G0 spike. Reading an influencer's own profile needs less access than
reading other people's comments, so this is expected to be feasible first.

## 6. Data model

New tables, added as migrations after the foundation's:

- `connected_accounts`, `influencer_stat_snapshots` (§5).
- `deliverable_submissions` — id, deliverableId, contactId, portalUserId, version,
  contentUrl, caption, notes, submittedAt.
- `contact_change_requests` — id, contactId, requestedByPortalUserId, changesJson,
  status (`pending` | `approved` | `rejected`), reviewedByUserId, reviewedAt, note.
- `portal_assignment_responses` — id, assignmentId, portalUserId, decision
  (`accepted` | `declined`), reason, createdAt.

New columns: `crm_campaigns.influencerBrief`, `crm_campaigns.requireClientApproval`,
`campaign_deliverables.influencerBrief`.

## 7. What an influencer sees and does

**Dashboard.** A "needs your action" list: assignments awaiting a reply,
deliverables due or with changes requested, recent payouts.

**Profile.** Displays their record from an allowlist: name, niche, location,
languages, availability, accounts with figures and their provenance, and their rate
card. Editable through a change request: niche, location, languages, rate card,
non-connected accounts and their manual figures. Never shown or editable: notes, tags,
lead fields, owner, priority, visibility, `portalVisible`, custom fields, tax number,
client and supplier links. Login email is not editable here.

**Assignments.** Accept or decline with a reason. After accepting, the campaign's
`influencerBrief`, their deliverables with due dates, and each deliverable's brief.

**Deliverables.** `Planned` → the influencer starts it (`In Progress`) → submits a
link and caption (`Submitted`, a new `deliverable_submissions` version). Staff review
first; if the campaign requires it, the client reviews next. "Changes requested"
returns the deliverable to `In Progress` with the reviewer's comment. When approved,
the influencer marks it published with the post URL (`Published`, `publishedAt`,
`contentUrl`). Email reminders go out 48 hours before an unsubmitted due date.

**Payouts.** Read-only list of vendor bills for the influencer's linked supplier
(`Contact.supplierId`): bill number, campaign, amount, due date, and status shown as
Pending (`Draft`), Approved (`Approved` or `Overdue`), or Paid with the paid date. A
deliverable shows only the label. If the contact has no linked supplier, the list is
empty.

## 8. Security requirements

1. Everything in the foundation §6 applies, with `req.portal.contactId` as the scope.
2. Another influencer's assignment, deliverable, submission, bill or change request
   returns 404.
3. Never in an influencer DTO: `CampaignDeliverable.price` and `cost`, client
   budget, proposals, invoices, payments, commissions, expenses, other assignees,
   other influencers' rates, internal notes, owner user ids.
4. OAuth callbacks verify `state`, reject unknown redirect URIs, and bind the
   connection to the session's `contactId`. A connection cannot be created for a
   different influencer.
5. Portal actions run under `store.runAsActor` as `Portal: <name> (influencer)`.
6. Tests use a fixture campaign carrying a price, a cost, a client budget, a second
   assignee and internal notes, and assert none of it appears in any influencer
   response.

## 9. Phases

**I1 — Profile and assignments.** Invitation from the influencer page, profile view,
change requests with a staff review queue, availability, assignments with accept and
decline, the brief fields and their internal editors.

**I2 — Submissions and payouts.** Submissions and versions, the review loop with the
staff review queue, `requireClientApproval`, mark published, payouts, reminders.
I1 and I2 come before the client portal's Phase 2.

**I3 — Connected accounts and stats.** The connect flow for the first platform
chosen by the G0 spike, encryption, the social worker, snapshots, token refresh and
reconnect handling, verified badges in the client catalogue, connection status for
staff. Depends on G0 and on platform app approval, so it can ship after the client
portal's Phase 1.

**Later.** WhatsApp notifications, draft file uploads, more platforms, and flagging
sudden follower jumps for staff.

## 10. Testing

Backend `node --test`: isolation between two influencers; the DTO fixture in §8.6;
assignment and deliverable transitions including the two-stage approval and the
optional client stage; payout status mapping; change-request approval applying
through `updateContact`; the sync job against recorded platform fixtures, including
expiry, revocation and rate limiting; token encryption round trip with key rotation.
Each phase is also driven through a real browser on staging in English and Arabic.

## 11. Inputs needed

1. A Peak-owned Meta developer account and app, shared with games, so app review
   can start early. It needs a public privacy policy, data-deletion instructions and
   terms pages on Peak's domain.
2. Which platforms Peak's influencers mainly use, to order I3.
3. The sender domain for invitation and reminder emails.
