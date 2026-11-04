# Approvals, wave 2

Status: decided 2026-11-04 (owner: "I need these features implemented …
follow global top standards and ensure proper UX"; decide, don't ask).
Builds on `2026-11-03-approvals-design.md` (wave 1 and group sign-off).

## What is in it

1. **Leave requests** on the engine.
2. **Purchase requisitions** on the engine.
3. **Credit notes** and **vendor payments** approved *before* they post.
4. **Handing a step to someone else**: reassigning a stuck or slow step.
5. **Approval status on each document** (chip + trail) and an **All open**
   view for whoever runs approvals.

Without a policy for a type, nothing changes for that type (as in wave 1).

## How world-class systems do these (NetSuite, SAP, D365, Workday, Coupa)

- Leave: manager approves, HR optionally after; length decides extra steps.
- Requisitions: the requester's manager/budget owner approves before
  buying turns them into orders.
- Credit memos and vendor payments: an approval *before posting*, because
  once posted they are money (a reversing entry is not a control).
  Payments often get a second, treasury-style sign-off on top of the bill's.
- Reassignment: an approvals administrator can reassign a task; it is
  logged with a reason. The admin does not approve it themselves.
- Each document shows its approval status and history in place, not only
  in an inbox.

## Decisions

### Leave requests

- With a leave policy, a new leave request (status *Pending*) starts a
  request. The **amount is the number of days**, so a step "from 5" means
  five days or more. Settings shows "days" for leave instead of money.
- **Who asked:** the employee's own login when the employee has one,
  otherwise whoever recorded it. That makes "the requester's manager" the
  employee's HR line manager, which is what leave needs.
- Approving or rejecting by hand (the HR leave page buttons, PUT
  `/leave-requests/:id/status`) is refused while a policy applies and the
  request is not decided (409 `APPROVAL_PENDING`); the HR page shows the
  approval chip and sends people to decide in Approvals. Cancelling is
  always allowed (it withdraws the request).
- The engine decides the status: approved → *Approved*; rejected or sent
  back → *Rejected* with the note as the review note, reviewer = whoever
  decided the last step.
- Changing the dates (more days) asks again, like a higher amount.

### Purchase requisitions

- With a policy, **Submit** starts the request (amount = the estimated
  total). Draft requisitions don't ask.
- The old Approve / Reject buttons are refused while a policy applies
  (409 `APPROVAL_PENDING`); approval comes from the engine: approved →
  *Approved* (approvedBy = last approver); rejected → *Rejected* with the
  note; sent back → *Draft* again with the note, ready to edit and submit.
- Convert to purchase order still needs *Approved*.

### Credit notes and vendor payments: held until approved

Both post to the books the moment they are recorded, so they can't wait
"half posted". Instead the action is **held**:

- With a policy, recording a credit note or a vendor-bill payment saves a
  **held entry** (`approval_holds`: what was asked, amount, who, status)
  and starts its request. Nothing is posted. The API answers 202 with the
  hold; the screen says "Sent for approval" and lists it on the invoice
  or bill as *Waiting for approval*.
- On approval the entry is recorded exactly as asked, by the store, and the
  hold remembers the credit note or payment it became. If it can't be
  recorded any more (the period closed, the invoice was fully credited or
  the bill paid meanwhile), the hold is marked *failed* with the reason and
  the requester is told to record it again. Approval never forces a
  posting the books would refuse.
- Rejected or sent back: the hold ends with the note; nothing was posted.
  The requester may withdraw a waiting hold.
- **Limits count holds:** a new credit note or payment can't exceed what
  is left after the ones already waiting, so two held payments can't pay a
  bill twice.
- Every way in is covered: the vendor payment form, marking a bill *Paid*
  (holds a payment of what is outstanding), creating a bill as *Paid*
  (refused, create then pay), receiving a customer return with a credit
  (goods come back now, the credit is held and linked to the return when
  approved), and a campaign's scope reduction (its credit is held).
- Bank reconciliation matching is not a payment decision (the money has
  already left), so it is not held.
- The vendor-payment step comes **on top of** the bill's own approval: a
  bill must be approved before it can be paid at all (wave 1); the payment
  policy adds a second control for releasing money.

### Handing a step to someone else

- Who: anyone with `settings.manage_approvals` in the company whose people
  decide the step (the document's company, or the group for a group
  sign-off).
- What: the current step's approvers become one named person, with a
  required reason. The trail records *reassigned*: who did it, to whom, why.
  Earlier approvals in the step stay in the trail.
- Rules: the person must be able to open that company; not the requester
  (unless that policy allows your own); not someone who already approved
  this document in this round. The person is notified at once.
- The admin who reassigns does not thereby approve (spec decision: admins
  reassign, they don't approve steps they aren't on).

### Approval status on documents and the All open view

- A compact **chip** on the lists and record views of every wired document
  type: *Waiting · Finance (step 2 of 3)*, *Approved*, *Rejected*, *Changes
  requested*. Nothing when none is needed. Clicking it opens the steps and
  the full trail (who, when, note, on whose behalf), with Approve / Reject
  / Send back inline when you can decide.
- Fed by one call per list: `GET /companies/:id/approvals/status?docType=…`
  returns the status and current step of every document of that type with
  a request (no N+1 calls).
- **All open** tab in Approvals, for people with `settings.manage_approvals`:
  every waiting request of the company (and the requests waiting at its
  group sign-off), stuck ones first, each with *Hand to someone else*.

## Permissions

- Decisions: unchanged (being on the step is the permission).
- Reassigning and the All open view: `settings.manage_approvals` in the
  step's owner company.
- Status chips: whoever can read the document's company sees its chips.
- Withdrawing a hold: its requester, or an Admin of the company.

## Data

Migration 157 `approvals_wave2`: `approval_holds` (id, companyId, docType,
payload JSON, amount, label, party, status pending/approved/failed/
rejected/withdrawn, resultId, error, requesterId, createdAt, endedAt).
Trail kind `reassigned`.

## Not in this wave

- Conditions other than amount (category, department, vendor).
- Parallel branches; out-of-office auto-delegation from HR leave.
- Approving several documents at once.

## As built (2026-11-04)

- **Mark as Paid** (single or bulk) with a payment policy is refused with a
  pointer to *Record payment*, which holds the payment. Holding a payment
  for the whole outstanding amount from a bulk action would send many
  requests no one asked for one by one; refusing is clearer.
- Leave has no edit route, so "more days asks again" has nothing to hook
  into; *Cancelled → Pending* asks again, and *Approved/Rejected* by hand is
  refused while leave needs approval (only a leave still Pending from
  before the policy is decided by hand).
- Leave recorded for someone without a login by their own line manager:
  nobody counts as the requester, so that manager can decide it.
- Leave bands are days, so a group's leave sign-off ignores currencies.
- The status list and a request's details: leave is listed to everyone
  in the company; other documents need the document's own view permission
  (`purchasing.view`, `invoices.view`, `vendor-bills.view`, …). Details are
  open to whoever is on the request.
- A step counts as stuck when its only possible approver is the requester
  (and the policy doesn't allow your own). Nobody can hand a step to
  themselves.
- Holds: the hold and its request are saved together; credits waiting on an
  invoice trim a later return's credit; a release the books refuse tells
  the requester once.

### Review fixes (2026-11-04)

Fresh review found: cancelled leave approvable by hand (critical); an
administrator handing a step to themselves; a bill created Paid half-saved
under a payment policy; a second return blocked by a waiting credit;
amounts readable by any member through the details route; a manager who
recorded leave for their own staff unable to decide it; a hold saved
without its request on failure. All fixed with regression tests.

## Conditions other than amount (2026-11-04)

Owner: "build the non-amount conditions too". World-class systems (NetSuite
approval routing, SAP flexible workflow, D365 workflow conditions, Coupa
approval chains) route on supplier, customer, category, department,
project and type as well as amount. Decided:

- A step can carry **conditions**, each *field is one of …* or *field is
  not any of …*. A step applies only when its amount band **and every
  condition** hold. A document with no value for a field fails an *is*
  condition and passes an *is not* one.
- Fields per document (only what each document actually records):

  | Document | Fields |
  |---|---|
  | Purchase order | supplier |
  | Vendor bill, vendor payment | supplier |
  | Expense | category, project |
  | Invoice, quotation, credit note | client |
  | Purchase requisition | department, preferred supplier |
  | Leave request | leave type |
  | Document | template |
  | Payroll run | none |

- Supplier, client, project, leave type and template are chosen from the
  company's own records (ids); category and department are typed text,
  matched without regard to case or surrounding spaces.
- **Group sign-off steps** run for documents of other companies, whose
  suppliers and clients are different records, so they take only the text
  fields (category, department). Saving a group sign-off step with an id
  condition is refused.
- Changing a field a running request depended on asks again (counterparty
  changes already did; an expense's category or project now does too).
- Migration 158: `approval_rules.conditions` (JSON).
- Settings shows each step's conditions as a sentence ("Only when the
  supplier is Globex or Initech"); the inbox shows nothing new (the step
  is simply there or not).
- A company below that falls back to its group's ordinary steps meets the
  group's supplier/client/project/leave-type/template ids, which are the
  group's own records: an *is* step never applies to it and an *is not*
  step always does (more approval rather than less). Settings says so on a
  group company's steps.

### Conditions: review fixes (2026-11-04)

- Gates ask whether *this* document needs approval (`approvalNeeded`:
  some step of its chain applies to its amount and facts), not whether a
  policy exists: a policy for one client no longer turns every recurring
  invoice into a draft, and one for one supplier no longer refuses *Mark
  as Paid* or a bill created Paid for the others. Payments and credit
  notes are held only when they need it.
- Taking over an inherited policy leaves out conditions naming the group's
  own records, and says so.
- Documents made from typed templates (quote, letter, memo, certificate,
  statement, custom) can be named in a template condition.
- "Is not" over several values reads "is none of A, B"; text values are
  de-duplicated ignoring case; a purchase order's facts follow the saved
  supplier.

## Bulk approve and leftovers (2026-11-04)

- **Bulk approve** (Waiting for me): tick items, or select all, and the bar shows the count and the total per currency, with leave as days. A confirmation dialog follows. Each item goes through the ordinary decision call one after another, so every permission, limit, hold release and group step check still runs per document. Items that fail stay ticked and show their reason. Rejecting and sending back stay one by one because each needs a reason. There is no new backend route. The logic is in `frontend/src/modules/approvals/lib/bulk.ts` (tested).
- **Inherited policies show names:** the condition options load for this company and for each company whose policy is inherited. Choices come only from this company; the others only supply names. A record the reader can't open shows as "a record you cannot open", never as a raw id.
- **Group sign-off switch:** turning it on drops supplier, client, project and similar conditions and now says so in a toast.
- **Condition editor:** text drafts reset when a condition is removed, so a half-typed value doesn't move to the next row.
- **Status chips:** `ApprovalStore.statuses` reads the requests and all their steps in two queries instead of 3–4 per document. The shared step parser is `stepFromRow`.
