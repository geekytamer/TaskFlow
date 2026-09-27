# Peak Portals — Roadmap

Date: 2026-09-24
Branch: `feature/peak-portal`
Designs: `docs/superpowers/specs/2026-09-21-peak-media-client-portal-design.md`,
`2026-09-24-influencer-portal-design.md`, `2026-09-24-engagement-games-design.md`,
`2026-09-27-portal-communication-and-referrals-design.md`

Five phases. Each ends with working software that can be signed in to, has its own
tests, and is checked in a real browser before the next phase starts. The detailed
task plan for a phase is written when that phase begins, because what each phase
teaches about the codebase changes the next one. This numbering replaces the phase
numbers inside the three designs.

| # | Phase | One line |
|---|---|---|
| 1 | Foundation | Identity, the portal app, and staff invitations |
| 2 | Influencer portal | Influencers work their assignments and get paid visibly |
| 3 | Client portal | Clients browse, request, approve and follow campaigns |
| 4 | Money | Invoices, receipts, then Peak Flexi instalments |
| 5 | Reach | Connected accounts, verified stats, and the engagement games |

## Phase 1 — Foundation

**Status: built and verified locally on 2026-09-24.** Backend 307 tests, portal 7 tests,
both typechecks, both production builds, a clean `npm audit` on the portal, and ESLint clean on the
frontend files touched (the portal has no lint setup yet). Driven in a
browser: invitation, sign-in, sign-out, wrong password, Arabic right to left, phone width,
a session replayed on the other audience's host (rejected), staff invite and disable from
the Clients and Influencers pages, and an Employee who does not see the access controls.
Also run in production mode as one build and two processes. **Not done:** deployment to a
server, real email delivery, and the Peak Media company itself (the checks used the demo
company). See `2026-09-24-peak-portals-phase-1-foundation.md`, Execution notes.

**Delivers.** `portal_users`, invitations and sessions; the portal API
(`/portal-api/<audience>/*`); the `contacts:portal.manage` permission; staff invite,
list, re-invite and disable from the Clients and Influencers pages; the `portal/`
Next app with sign-in, invitation acceptance and a branded empty dashboard for both
audiences, in English and Arabic (RTL); deployment templates.

**Designs covered.** Client portal §4–§6 and its Phase 0; influencer portal §4
(identity row).

**Exit criteria.**
- An Admin or Manager invites a client contact and an influencer contact; each
  accepts the link, signs in on its own host and sees its own dashboard.
- A client session cannot open an influencer route, neither can open an internal
  route, and an internal token cannot open a portal route.
- Disabling a user ends their session immediately.
- Backend suite, portal unit tests, both typechecks, lint and both builds pass.
- Checked in a browser at desktop and phone width, in English and Arabic.

## Phase 2 — Influencer portal

**Delivers.** Influencer designs §7 I1 and I2: profile with staff-reviewed change
requests, assignments with accept and decline, briefs (`influencerBrief` fields),
deliverable submissions with the staff review loop, `requireClientApproval`, mark
published, payouts read from vendor bills, and due-date reminder emails.

**Depends on.** Phase 1.

**Also delivers**, from the communication and referrals design: the shared message
thread on the influencer's dashboard, and, once messages ship, the referral flow
(submit a referral, see its status and any commission).

**Exit criteria.** An influencer accepts an assignment, submits a deliverable, staff
request changes then approve, the influencer marks it published, and payout status
follows the vendor bill. The secrecy fixture (price, cost, budget, other assignees,
internal notes) never appears in an influencer response. A message posted by the
influencer notifies the account owner; a submitted referral does the same, and its
status and commission are visible only to the influencer who submitted it.

## Phase 3 — Client portal

**Delivers.** Client design phases 1 and 2: `client_pricing_profiles` and
`contacts.portalVisible`, the catalogue with an indicative price per pricing mode,
campaign requests that create an `Opportunity` and a `FollowUp`, proposal accept and
decline through `updateCrmProposalStatus`, campaign and deliverable tracking, and the
client stage of deliverable review.

**Depends on.** Phase 2 (client review needs influencer submissions).

**Also delivers**, from the communication and referrals design: the shared message
thread, and the referral flow for clients.

**Exit criteria.** A client submits a shortlist, staff build a proposal, the client
accepts it, follows the campaign, and approves a submitted deliverable. Influencer
rates and margins never appear in a client response under any of the three pricing
modes. A message posted by the client notifies the account owner; a submitted
referral does the same, and its status and commission are visible only to the
client who submitted it.

## Phase 4 — Money

**Delivers.** Invoices and receipts (list, detail, PDF, a new receipt document,
per-campaign statement), then Peak Flexi: `payment_plans`, eligibility against
`Client.creditLimit`, finance approval, installment tracking against `Payment`,
overdue installments as `FollowUp` entries.

**Depends on.** Phase 3. **Needs from you** before its second half: the accountant's
view on invoicing the Plus service fee.

**Exit criteria.** A client sees only their invoices and payments and downloads a PDF
of each. A plan request is approved by finance and its installments are settled and
tracked; an overdue installment raises a follow-up.

## Phase 5 — Reach

**Delivers.** The platform feasibility spike; `connected_accounts` with encryption,
the social worker, follower and engagement sync with verified badges; the games
module with manual points, scoring, the public lobby and result freezing; then the
first comment collector the spike supports.

**Depends on.** Phase 2 for the influencer portal, and on external approvals.
**Needs from you** to start: a Peak-owned Meta developer account with privacy,
data-deletion and terms pages, and the platforms Peak's influencers use.

**Exit criteria.** A connected account's figures update daily and show as verified to
clients. An admin creates a game, staff award points, the public lobby ranks
participants, and the result freezes at the end time. Any collector shipped passes its
recorded-fixture tests and the deleted-comment reconciliation test.

## Amendments to the designs, from reading the code

These supersede the designs where they differ.

1. **Client users bind to the organisation contact, not a `Client` record.**
   Campaigns, proposals and opportunities hang off the contact; invoices use
   `contact.clientId ?? contact.id`. `portal_users` therefore has one `contactId`
   column for both audiences.
2. **The portal app is the only public entry.** Its server calls the backend over
   loopback and stores the token in an httpOnly cookie. nginx never routes
   `/portal-api/`, and no CORS origin is enabled for it.
3. **One portal deployment serves one company**, set with `PORTAL_COMPANY_ID`.
4. **Password reset in Phase 1 is a staff re-invite.** Self-service reset is not in
   the five phases.
5. **Contacts do not get internal `users` accounts.** Everything a client or
   influencer needs (own campaigns, billings, a shared message thread, referrals
   with an optional commission) is additive scope inside the existing portal, not
   a login to the internal app. The internal app has no per-record scoping outside
   Projects and Tasks: every other role either sees nothing or sees the whole
   company's data, so a contact logging in there would either be useless or would
   need every one of ~300 routes re-audited to add a `contactId` check. The portal
   already does this safely in a few hundred lines.
