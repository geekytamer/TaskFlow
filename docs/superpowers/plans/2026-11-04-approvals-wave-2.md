# Approvals wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen: native, owner decides-don't-ask). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Leave, requisitions, credit notes and vendor payments on the approvals engine; reassigning steps; approval chips and trail on documents; All open view.

**Architecture:** Store-level gates as in wave 1 (`beginApproval`, `requireApproved`). Credit notes and vendor payments are *held* (`approval_holds`) and executed by the store on approval. The engine gains `reassign`. A per-type status endpoint feeds a shared `ApprovalChip` component.

**Tech Stack:** Node/Express + better-sqlite3 (backend/src), node:test on `dist`; Next.js + React (frontend/src), vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-approvals-wave-2-design.md`

## Global Constraints

- Without a policy for a type, behaviour is unchanged (every existing test passes untouched).
- 409 codes: `APPROVAL_PENDING`, `APPROVAL_REJECTED`, `APPROVAL_REQUIRED`; held answers are HTTP 202 `{ held: true, hold }`.
- Leave amount = days; every UI string bilingual via `tr(en, ar)`.
- Migration id `157_approvals_wave2`; update the migrations list in `backend/test/api.test.js`.
- Backend tests pass under PERMISSIONS_ENGINE legacy, shadow and v2; new routes declared in `authz/route-registry.ts`.

## Review Focus

- Two held payments that together exceed the bill → the second is refused (test in Task 3).
- A hold approved after the bill was paid in full meanwhile → hold `failed`, requester told, nothing posted (Task 3).
- Reassigning to the requester or to someone who already approved → refused (Task 4).
- Leave employee with no login → requester is the recorder; manager step skipped with note (Task 1).
- Requisition sent back → returns to Draft and can be submitted again, restarting the request (Task 2).

---

### Task 1: Leave requests on the engine
**Files:** `backend/src/data/store.ts` (createLeaveRequest, setLeaveRequestStatus, new `settleLeaveApproval`, updateLeaveRequest days change if exists, deleteLeaveRequest→forgetApproval), `backend/src/routes/hr.ts` PUT status, `server.ts` approvalDocs.leave_request, `routes/approvals.ts` WIRED_DOC_TYPES. Test: `backend/test/approvals-wave2.test.js`.
- [ ] Tests: `leave asks the employee's manager and approval sets Approved`; `hand approval refused while waiting (APPROVAL_PENDING), cancel allowed`; `rejection sets Rejected with the note`; `leave of 2 days skips a "from 5" step`; `employee without login: recorder is requester`.
- [ ] Implement: requester = `employee.userId ?? actor`; `beginApproval(companyId,'leave_request',id,days)` with explicit requester; `settleLeaveApproval(id, outcome, by, note)`.
- [ ] Build + run test file; commit.

### Task 2: Purchase requisitions on the engine
**Files:** store.ts submit/approve/reject + `settleRequisitionApproval`; server.ts approvalDocs.purchase_requisition; delete → forget.
- [ ] Tests: `submit starts the request; approve route refused while waiting`; `approved → Approved and convertible`; `sent back → Draft, resubmit restarts`; `no policy: old buttons work`.
- [ ] Implement, run, commit.

### Task 3: Held credit notes and vendor payments
**Files:** store.ts migration 157, `approval_holds` CRUD (`holdAction`, `releaseHold`, `endHold`, `listHolds(companyId, {docType, targetId})`, `withdrawHold`), gates in createCreditNote/createVendorBillPayment (refuse unless releasing), `requestCreditNote`, `requestVendorPayment`, updateVendorBillStatus Paid, receiveCustomerReturn, campaign scope credit; server.ts routes POST credit-notes / POST vendor-bills/:id/payments answer 202 when held; GET `/companies/:id/approval-holds?docType&targetId`, POST `/approval-holds/:id/withdraw`; approvalDocs.credit_note / vendor_payment (settle = release or end).
- [ ] Tests: `held payment posts nothing until approved, then posts once`; `two holds can't exceed the bill`; `approval after bill paid → failed, requester notified`; `rejected hold posts nothing`; `credit note held; return received keeps goods and links credit on approval`; `withdraw by requester`; `no policy unchanged`.
- [ ] Implement, run, commit.

### Task 4: Reassign + All open + status endpoint
**Files:** `approvals/approvals.ts` `reassign(docType, docId, by, toUserId, reason)` + TrailKind `reassigned` + `openFor(companyId)`; store `reassignApproval` (notifies); routes/approvals.ts `POST /approvals/:docType/:docId/reassign`, `GET /companies/:id/approvals?box=open`, `GET /companies/:id/approvals/status?docType=`; route-registry entries.
- [ ] Tests: `admin hands a stuck step to a person; they can decide; trail has reassigned with reason`; `refused: requester, earlier approver, someone outside the company, no reason`; `non-admin 403`; `status endpoint returns current step label per doc`; `open box lists stuck first`.
- [ ] Implement, run under 3 engines, commit.

### Task 5: Frontend
**Files:** `services/approvalService.ts` (POLICY_DOC_TYPES + 4, `getApprovalStatuses`, `getApprovalView`, `reassignApproval`, box `open`, holds API), `modules/approvals/components/approval-chip.tsx` (chip + popover trail + inline decide), `use-approval-statuses.ts` hook, `reassign-dialog.tsx`, approvals-page All open tab, settings panel days unit for leave, chips on invoices, quotations, vendor bills, POs, expenses, payroll, documents, leave, requisitions; held notices on credit note / payment forms + waiting holds list on invoice/bill.
- [ ] vitest for pure helpers (`approvalChipText`), lint, `next build`; browser check of each screen (en + ar, mobile width); commit.

### Task 6: Review, deploy
- [ ] Fresh code review of the branch; fix; full test runs; PR; deploy with backup/swap/rollback; spec "As built"; memory.
