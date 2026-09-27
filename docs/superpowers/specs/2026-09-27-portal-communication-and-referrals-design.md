# Portal Communication and Referral Commissions — Design

Date: 2026-09-27
Branch: `feature/peak-portal`
Status: Draft for review
Builds on: `2026-09-21-peak-media-client-portal-design.md`,
`2026-09-24-influencer-portal-design.md` (portal identity, `contactId`, audiences)

## 1. Problem

Two capabilities apply identically to both portal audiences, so they get one shared
design rather than being duplicated in each portal's spec:

1. A **shared communication log**: an ongoing, two-way thread tied to a contact's
   account, visible to the portal user and to staff, distinct from staff's own
   internal notes.
2. **Referral commissions**: a client or influencer can introduce a prospective
   piece of business to Peak Media from their portal; if staff pursue it and it
   converts, the referrer may earn a commission, at staff's discretion.

## 2. Goals

- A portal user and staff can read and post to one chronological thread per
  account, without either side ever seeing staff's internal notes.
- A portal user can submit a referral: a prospect's name and contact details plus
  a description. Staff review it before it becomes anything real in the CRM.
- Staff decide, per referral, whether a commission applies at all, and set its
  terms. Nothing is computed automatically.
- A referrer can see their own referrals and any commission earned, and nothing
  about anyone else's.

## 3. Non-goals

- Replacing WhatsApp. This is a separate, simpler thread; nothing here reads or
  writes WhatsApp messages.
- File attachments in the thread (text only; revisit later if needed).
- Automatic commission calculation from a formula. Staff set the number.
- Automatic conversion of a referral into an `Opportunity`. A human decides.
- Extending the internal `Commission`/contribution system. That system computes
  staff commissions from versioned attribution rules and was not built to name an
  external party as the beneficiary; entangling it here risks its own
  calculations. This is a separate, much simpler table.

## 4. Decisions

| Decision | Rationale |
| --- | --- |
| The thread is a **new table**, never the same field as `Contact.notes` or any campaign `notes` | Those fields are staff's own internal notes today, written without expecting a client or influencer to ever read them. A new field means nothing internal can appear here by construction, not by a filter someone might forget. |
| A referral is its own object, **not** an `Opportunity` until staff convert it | An unreviewed external submission sitting in the real CRM opportunity list, editable and visible like any other, is a worse default than a small review queue. Staff convert deliberately. |
| Commission terms are set by staff, at review or conversion time, **per referral** | Matches "optional": some referrals earn nothing, some earn a rate staff choose case by case. Nothing here needs a company-wide commission policy. |
| Payout reuses existing documents, chosen by staff per case | Influencer commissions become a vendor bill, the same document influencers already get paid through for deliverables. Client commissions become a credit note (applied to a future invoice) or a vendor bill if a cash payout is preferred. No new payment mechanism. |
| A message from a portal user raises a notification for the contact's `ownerUserId`, and a submitted referral does the same | Reuses the existing notification system; nobody has to poll the portal to notice a new message or referral. |
| Everything scopes on `contactId`, exactly like the rest of the portal | Same session-bound scoping as the foundation; no new isolation mechanism. |

## 5. Data model

Migrations continue after the influencer portal's tables.

- `account_messages` — id, companyId, contactId, authorType (`staff` | `portal`),
  authorUserId (staff author) or authorPortalUserId (portal author, exactly one
  set), body, createdAt.
- `portal_referrals` — id, companyId, referrerContactId, referrerPortalUserId,
  prospectName, prospectContact (free text: email and/or phone), description,
  estimatedValue, currency, status (`Submitted` | `Under Review` | `Converted` |
  `Declined`), staffNote (internal, never returned to the portal), opportunityId
  (set on conversion), reviewedByUserId, reviewedAt, createdAt.
- `referral_commissions` — id, companyId, referralId, referrerContactId, basis
  (`Percent` | `Fixed`), ratePercent, fixedAmount, triggerEvent (`OpportunityWon` |
  `InvoicePaid`; when it becomes payable), status (`Pending` | `Approved` | `Paid` |
  `Voided`), payoutType (`vendor_bill` | `credit_note` | `none`), payoutRefId,
  approvedByUserId, approvedAt.

## 6. Access

- `GET /portal-api/<audience>/messages` and `POST .../messages`: scoped to the
  session's `contactId`. A message body is required and capped (2,000 characters).
- `GET /portal-api/<audience>/referrals` and `POST .../referrals`: same scoping.
  A portal user sees their own referrals' `status` and any linked
  `referral_commissions` row (basis, rate or amount, status), never `staffNote`,
  `reviewedByUserId`, or another contact's referrals.
- Internally: a "Shared with them" panel on the Contact page, separate from the
  existing internal notes field, for staff to read and post; a referrals queue
  (`Submitted` first) with an action to decline or convert to a real `Opportunity`
  and, optionally, attach commission terms in the same action.
- Converting a referral runs through the existing `Opportunity` creation path
  (same as any other opportunity), with `sourceType`/`sourceId` pointing back at
  the referral, the same provenance pattern `FollowUp.sourceTrigger` already uses.

## 7. Phases

Both pieces are additive to the existing five-phase roadmap, not a new phase:

- **Messages** land with each audience's dashboard: influencer portal's Phase 2,
  client portal's Phase 3. The dashboard's "needs your action" list already
  planned for the influencer portal gains unread messages as an item.
- **Referrals and commissions** land after each audience already has messages,
  since the referral flow reuses the same notification wiring: end of Phase 2 for
  influencers, end of Phase 3 for clients.

## 8. Testing

Isolation tests following the existing pattern: two contacts, two portal users,
every message and referral endpoint asserted to return nothing of the other's.
Conversion test: converting a referral creates exactly one `Opportunity` with the
right provenance, and the referral's `status` becomes `Converted`. Commission
tests: a `Pending` commission is invisible to payout logic until `Approved`; the
payout type determines which document (`vendor_bill` or `credit_note`) is created
and that its amount matches the stated basis.

## 9. Open questions for you

1. Should a portal user be able to edit or delete their own message after posting,
   or is it append-only once sent? Append-only is simpler and avoids "what did they
   originally say" disputes; that is the default here unless you'd rather they can
   edit shortly after posting.
2. For a client's referral commission paid as a credit note: does it apply
   automatically to their next invoice, or does an accountant apply it by hand,
   the same way a manual `Approved` step already gates the influencer case?
