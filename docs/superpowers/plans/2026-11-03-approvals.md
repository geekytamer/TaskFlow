# Approvals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Approvals by teams (Legal, Finance, Management), roles, named people and the requester's manager, with ordered steps, any/all, amount bands, delegation, reminders, an inbox and settings, on wave-1 documents.

**Architecture:** Evolve `approvals/approvals.ts` and its two tables rather than replace them: a rule row becomes a policy step (new columns `approvers` JSON, `need`, `maxAmount`); a document's `approval_steps` row carries its resolved `approvers` and `need`; decisions per approver go to `approval_decisions`; who asked goes to `approval_requests`. Teams and delegations are new tables. The existing `ApprovalStore` API, `levelsFor`, `decide` and the PO/expense wiring keep their signatures, so `approval-chains.test.js` stays the parity proof.

**Spec:** `docs/superpowers/specs/2026-11-03-approvals-design.md`

## Global Constraints

- Migration `155_approvals_v2`, idempotent; existing rules convert to steps with `approvers=[{kind:'role', id: approverRole}]`, `need='any'`, and the policy flag `allowSelf=1` (today's behaviour). New policies default `allowSelf=0`.
- A role approver keeps today's meaning: an Admin may act for any role step (`rolesActingAs`). Team, person and manager approvers mean exactly those people (or their delegate).
- One person, one step per document; any rejection rejects; editing that raises the amount restarts (as today).
- Doc types: `purchase_order`, `expense` (existing), then `vendor_bill`, `vendor_payment`, `invoice`, `credit_note`, `quotation`, `payroll_run`, `document`, `purchase_requisition`, `leave_request`.
- Group policy: a child company with no rules for a type uses its parent's.

## Review Focus

- A delegate approving for someone who is also the requester (must be refused when self-approval is off).
- An `all` step with a team that has nobody left in it (an empty team): the request must say so and stay pending, not auto-approve.
- The requester's manager step when the requester has no HR manager: skipped, with a trail entry.
- A child company using its group's policy whose team members belong to another company of the group.
- Converted rules: the same outcomes as before for the same actors.

---

### Task 1: Engine
Teams, members, delegations, steps with approvers/need/maxAmount, requests and decisions; `decide()` generalised. Tests: `test/approvals-engine.test.js` (team step, all-step, manager step, delegation, self-approval off/on, empty team, group policy inheritance, conversion parity); `approval-chains.test.js` unchanged and green.

### Task 2: API
`GET/PUT /companies/:id/approvals/teams`, `PUT /companies/:id/approvals/policies/:docType` (steps), `GET/PUT /me/approval-delegation`, inbox `GET /companies/:id/approvals?box=waiting|mine|decided`, decisions with `send_back`. Route registry declarations.

### Task 3: Wave-1 documents
Each doc type: start a request when submitted/created, block its action until approved (409 APPROVAL_PENDING), settle on outcome, restart on material edit. Tests per type.

### Task 4: Screens
Approvals inbox (three tabs, inline decisions, group fan-out), Settings → Approvals (teams, policies, delegation), status chip and trail on documents.

### Task 5: Reminders and escalation
In the recurring runner: re-notify after reminder hours, notify Admins after escalation hours, once each.

### Task 6: Ship
Suites ×3 engines, frontend checks, review, PR, production deploy.
