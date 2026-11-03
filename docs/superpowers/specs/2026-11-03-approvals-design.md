# Approvals

Status: proposed and decided, 2026-11-03 (owner: "include approvals from
accountants, legal teams, managers and the like"; decide, don't ask).

## Today

`approvals/approvals.ts`: per company and document type, amount thresholds,
each needing one fixed role (Manager, Accountant, Admin), approved in order,
one person per document, any rejection rejects. Only purchase orders and
expenses use it. Requisitions, leave and payroll have their own one-off
approve/reject switches.

## What world-class systems do (NetSuite, SAP Flexible Workflow, Dynamics 365, Odoo Approvals, Coupa)

- **Approvers are people, groups or relationships**, not only roles: a named
  team (Legal, Finance), the requester's manager, a specific person, the
  budget or department owner.
- **Policies per document with conditions**: amount bands, category,
  department, vendor, project.
- **Steps in order; a step can need anyone in it, or everyone.**
- **Segregation of duties**: never your own request; one person one step.
- **Delegation** while away, **reminders and escalation**, a **single
  inbox**, a **full trail** with comments.
- **Edits after approval re-open it** when they change what was approved.
- **Group policies** set once by the parent and used by its companies.

## The model

### Approver teams

Named teams per company: *Legal*, *Finance*, *Management*, or any other.
Members are people of that company (or, for a group company's team, of any
company in its group). Every company starts with three seeded teams mirroring
today's roles, so nothing changes until someone edits them: *Managers* (role
Manager), *Accountants* (role Accountant) and *Admins* (role Admin). A team
can hold roles (everyone with the role, now and later) and named people.

### Policies

One policy per document type per company, as an ordered list of steps:

- **who**: one or more of: a team, a role, a person, or *the requester's
  manager* (HR line manager, else none and the step is skipped with a note).
- **need**: `any` (one of them) or `all` (each of them).
- **when** (optional): amount from / up to; that is the existing threshold
  model, so today's rules convert one-to-one into steps with *when amount ≥ X*.
- A step whose condition doesn't hold is left out when the request starts.

A company without a policy for a type behaves as today. A child company with
no policy of its own **uses its group's policy** for that type (group
control); its own policy, once set, wins.

### Running a request

- Submitting (or saving a document whose type needs approval) starts a
  request: the steps whose conditions hold, in order.
- The current step's approvers see it in their inbox and are notified (bell,
  push, email). An approver decides: approve, reject (reason required), or
  send back for changes (reason required).
- **Never your own**: the requester can't approve any step. **One person,
  one step**: someone who approved an earlier step can't approve another.
- `all` steps finish when every named approver (each person, or one member
  per team/role named) has approved.
- Reject: the request ends rejected; the document goes back to draft.
  Send back: same, but marked "changes requested".
- **Edits after approval** that raise the amount, or change the counterparty,
  restart the request. Other edits keep it.
- **Delegation**: a person can hand their approvals to a colleague for a date
  range; the colleague decides "for" them, and the trail says so.
- **Reminders**: a step waiting longer than the policy's reminder hours
  (default 24) re-notifies; after the escalation hours (default 72) it also
  notifies the company's Admins.
- **Trail**: every start, decision, delegation, reminder and restart, with
  who, when and the comment, on the document.

### Documents covered

Wave 1 (this build): purchase orders, expenses (both moved onto the engine
unchanged), vendor bills (before they can be paid), payments of vendor bills,
customer invoices (before they can be sent), credit notes, quotations (before
sending), payroll runs (before they can be marked paid), contracts and
documents (Legal review before a document is finalised), purchase
requisitions and leave requests (their current approve/reject becomes the
engine's, with the default policy "requester's manager", keeping today's
behaviour of Managers/Admins deciding when no manager is set).

What "blocked" means per document: the action listed above is refused with a
clear message (409 APPROVAL_PENDING / APPROVAL_REJECTED) until approved.

### Screens

- **Approvals** (sidebar): *Waiting for me*, *My requests*, *Decided*; each
  item shows the document, amount in its currency, requester, step, who else
  is on it, waiting time; approve / reject / send back inline; opens the
  document. Group shown whole: every company's items (fan-out).
- **Settings → Approvals**: teams (members, roles), policies per document
  type (steps, who, any/all, amount band, reminder hours), delegation ("away
  from … to …, hand to …"). A group company's page says which companies use
  its policies.
- **On each document**: a status chip (Waiting for Legal · step 2 of 3) and
  the trail.

## Permissions

- Managing teams and policies: `settings.manage_approvals` (Admin), as today.
- Deciding: being an approver of the current step (team member, role holder,
  named person, manager, or their delegate). No extra permission key: the
  policy is the permission. An Admin may *not* decide steps they aren't on;
  they can reassign a stuck step to someone (logged).
- Seeing a request: requester, approvers on any step, and whoever can see the
  document.

## Build order

1. Engine: teams, policies, steps with any/all and conditions, requests,
   trail, delegation; existing PO and expense rules converted (parity tests:
   same outcomes for the same rules).
2. Wire wave 1 documents with their blocks.
3. Inbox and settings screens, chips and trails on documents, notifications,
   reminders and escalation (the existing recurring runner).
4. Group policies (inherit unless overridden).

## Decisions

- Teams over raw roles: legal and finance teams are named groups of people;
  roles still work inside a team.
- Admins don't approve by default role; they reassign. Fewer silent
  self-approvals by senior staff.
- Leave and requisitions move onto the engine; their existing statuses stay
  as the document's state.
- Parallel "all" steps rather than parallel branches: covers "Legal and
  Finance both sign" without a flow designer.

## As built, wave 1 (2026-11-03)

- Wired: purchase orders and expenses (unchanged behaviour), vendor bills
  (payment waits), customer invoices (sending and emailing wait; a new invoice
  starts as a draft), quotations (sending, accepting and converting wait),
  payroll runs (approving and paying wait), documents (finalising waits; a new
  document starts as a draft).
- **Rulings:** credit notes, vendor payments, leave and purchase requisitions
  follow in wave 2 (credit notes and payments are posted the moment they are
  recorded, and leave and requisitions have their own approve step today; each
  needs its state reshaped, not a gate). No seeded teams: roles are offered
  directly as approvers, so an empty Legal team never blocks a company that
  didn't ask for one. A role approver keeps "an Admin may act for any role
  step"; team, person and manager approvers mean exactly those people.
- Rules saved through the old PUT /approvals/rules keep `allowSelf` (today's
  behaviour); policies saved through the new API default to "never your own".

### Review fixes (2026-11-03)

- Purchase orders and expenses record who asked and use the group's policy;
  when every step falls away (a manager step with no manager) they need none.
- No way past approval: a vendor bill can't be created Paid, an invoice can't
  leave Draft by any route (status, edit, Overdue) or be emailed, the payroll
  bank file waits too, and recurring invoices are held as drafts.
- A restart keeps the first requester. Rewriting a document, reopening a final
  one, or changing a document's counterparty asks again. A deleted document's
  request goes with it.
- Only people who can open the document's company can decide it (a group
  policy naming someone outside that company flags the step as stuck). Teams
  take people of the company's group only. A delegate decides purchase-order
  and expense role steps on their colleague's behalf.
- Having approved an earlier step, a person may still reject a later one (as
  before). Decisions are checked inside their transaction. Reminders count per
  round. A one-day delegation is fine. Old-style rules save in amount order.
- Policies only for wired document types. Chains waiting before this release
  are not reminded or escalated on day one.
- Not built: reassigning a stuck step (the escalation message points to
  Settings → Approvals instead).
