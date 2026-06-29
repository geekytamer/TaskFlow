# Follow-ups → World-Class CRM: Build Plan

_Synthesized from a 5-lens design workshop (rep execution, manager analytics, UX/IA, automation/AI, data model)._

## Product vision
Follow-ups becomes TaskFlow's relationship-protection engine: a first-class, polymorphic follow_ups entity (attachable to a contact, deal, invoice, or delivery) that powers an opinionated, keyboard-first "Today" work queue for reps, a load-balanced SLA command center for managers, and — later — multi-step cadences plus Claude-drafted next-best-actions and two-way WhatsApp/email. A rep is always handed the single next thing to do on the right channel with the right context, logs a structured outcome in one tap that auto-schedules the next touch, and reaches inbox-zero daily. No lead ever silently goes cold, no deal lacks an owner and a next step, and every touch is measured against the outcome it produces. The current ~310-line flat table is replaced by a calm multi-lens workspace (Today/List/Calendar/Board), fully bilingual (en/ar, RTL) and usable on a phone in the field.

## Top differentiators

- The first-class polymorphic follow_ups table — the single data-model unlock that lifts one-pending-per-contact, enables attach-to-deal/invoice, structured outcome/channel, reassignment, recurrence, and cadences. Every other feature is bolted onto a column without it.
- The outcome loop: a structured per-channel outcome chip (no-answer / connected / booked-meeting / replied / not-interested) that in ONE tap writes the activity AND atomically schedules the next follow-up via an outcome to next-step map — guaranteeing a thread is never dropped.
- A focused 'Today' work queue (single-card, keyboard-driven, urgency-scored) instead of a flat table — the difference between a tool used daily and one abandoned by week two.
- Coverage-Gap report: a guaranteed list of every open deal AND active lead with NO next step, sortable by value-at-risk — a manager report that is literally impossible to produce today.
- SLA policies with automatic breach escalation (speed-to-lead enforced, not hoped-for) layered on bulk reassignment + round-robin rebalancing for real team operations.
- Multi-step cadences/sequences built on the existing idempotent scheduler — enroll once, the system drives every timed cross-channel touch and auto-exits on reply or stage change.
- Claude-drafted next-best-action + on-brand call/WhatsApp/email drafts in the contact's language (en/ar), human-in-the-loop by default, that turn 'I should follow up but don't know what to say' into one editable click.
- Two-way WhatsApp via the existing Green API inbound webhook that auto-completes the matching follow-up on reply and exits the cadence — closing the loop with zero rep discipline.

## Design principles

- One next thing, not a table to scan — the default surface is a focused single-item queue (Today), with List/Calendar/Board as alternate lenses over the SAME query and zero re-entry to switch.
- The follow-up is a first-class entity — promote it out of contact.nextFollowupDate so a contact can carry many live threads and a follow-up can attach to a deal/invoice; the activity log stays the durable system-of-record for history.
- Completing a follow-up always births or intentionally ends the next one — structured outcome capture (one tap) auto-schedules the next touch, so the queue can never silently drain to nothing by accident.
- Keyboard-first and recoverable — j/k/e/s/d triage, snooze presets + natural language, and an undo toast on every destructive action; the mouse is optional.
- Right channel, prefilled — each follow-up declares its channel (Call/WhatsApp/Email/Meeting/Task) and renders the channel-appropriate action (click-to-call, WhatsApp composer, email) so there is zero per-touch setup tax.
- Automation is supervised, never a black box — cadences and AI drafts are draft-by-default, respect opt-out/quiet-hours/channel caps, and expose a kill-switch and an approval inbox before anything fires.
- Back-compat during migration — dual-read the legacy two sources behind a UNION shim and keep /done and /reschedule as aliases so nothing pending is lost and the current page keeps working through rollout.
- Reuse the existing spine — build on scheduleAutomaticFollowup's idempotency, the daily/hourly sweeps, the followup_due notification + email digest, LogActivityDialog/ActivityFeed, Green API, and i18n rather than inventing parallel infra.
- Bilingual and field-ready by construction — every view, gesture, calendar week-start, and bucket order mirrors correctly in RTL with Arabic copy, and collapses to a thumb-driven card stack on mobile.

## Phases

### Phase 0 — First-class follow-up entity + migration (the unlock)  _(effort: L)_
**Goal:** Promote follow-ups from the derived contact.nextFollowupDate + activity-event union into a real, indexed, polymorphic follow_ups table with a clean idempotency primitive and a back-compat dual-read shim, losing zero pending items.

**Features:**
- Create follow_ups table (migration 059) with polymorphic entityType/entityId reusing ActivityEvent['entityType'], plus owner, channel, type, status, priority, dueAt/reminderAt/snoozedUntil, outcome/outcomeNote, sourceTrigger/sourceType/sourceId, recurrence/cadence columns
- Idempotent createFollowup(...) primitive backed by a UNIQUE partial index on (companyId, entityType, entityId, sourceTrigger, sourceId) WHERE sourceId IS NOT NULL — replaces the 90-day metadata-JSON scan inside scheduleAutomaticFollowup
- Backfill within migration 059: every contact.nextFollowupDate and every open activity_events.nextActionDueDate becomes a follow_ups row, de-duped exactly like today's seenContactIds guard
- Rewire existing trigger call sites (opportunity Proposal/Negotiation/Won, sweepOverdueInvoiceFollowups) onto createFollowup; rewrite sweepFollowupDueReminders to read follow_ups via the sweep index
- Dual-read UNION shim in listFollowups + keep POST /followups/:id/done and /reschedule as thin aliases so the current followups-page.tsx keeps working through rollout

**Data-model changes:**
- New table follow_ups (id, companyId, ownerUserId, ownerName, entityType, entityId, title, type, channel, status DEFAULT 'open', priority DEFAULT 'normal', dueAt, reminderAt, snoozedUntil, completedAt, completedByUserId, outcome, outcomeNote, notes, sourceTrigger, sourceType, sourceId, recurrenceRule, recurrenceParentId, sequenceId, sequenceRunId, stepIndex, createdAt, updatedAt)
- Indexes: idx_followups_owner_due(companyId,ownerUserId,status,dueAt); idx_followups_entity(entityType,entityId,status); idx_followups_company_due(companyId,status,dueAt); idx_followups_sweep_reminder(status,reminderAt); idx_followups_sweep_snooze(status,snoozedUntil); UNIQUE idx_followups_idem(companyId,entityType,entityId,sourceTrigger,sourceId) WHERE sourceId IS NOT NULL
- types.ts: add FollowUp interface + FollowUpStatus/Outcome/Type/Channel unions, reusing ActivityEvent['entityType'] for FollowUp.entityType
- Keep contact.nextFollowupDate/Note readable as a denormalized 'soonest' cache for one release; planned migration 060 drops them once writes funnel through createFollowup

### Phase 1 — Rep 'Today' workspace: structured outcome, channel, snooze, keyboard  _(effort: L)_
**Goal:** Replace the flat table with a focused, keyboard-driven Today queue where structured outcome capture auto-schedules the next touch, channel is explicit, and snooze is instant — the daily inbox-zero loop.

**Features:**
- Today single-card work queue (urgency-ordered) with List view retained for power users; persistent view switcher (Today | List) that persists per user
- Structured per-channel OUTCOME capture as an inline strip (not the full LogActivityDialog): one chip writes the CrmActivity AND atomically creates/advances the next follow-up via an outcome→next-step map; toast with undo
- Per-follow-up channel as a first-class field rendering the channel-appropriate primary action: click-to-call (tel:) + auto-open outcome, WhatsApp composer (Green API), email composer
- Keyboard triage layer (j/k navigate, E log-outcome, S snooze, X skip, D done, C call, W WhatsApp, M email, U undo, ? cheat-sheet) registered through the command-palette keybinding infra, RTL/i18n-safe
- Snooze (distinct from reschedule) with fixed + natural presets (Later today, Tomorrow 9am, Monday, after weekend) and a small NL parse; remembers most-used choice
- Smart queue ordering by urgency score (overdue + priority + late-stage deal float to top) and inline contact mini-360 on the card (last activities, open deals, days-since-touch, priority) with a next-best-action hint line
- Rich empty/zero states: inbox-zero celebration, never-set-up coaching, filtered-empty — and a sidebar overdue badge; full Arabic/RTL parity + mobile swipe triage

**Data-model changes:**
- Promote outcome to a typed enum on follow-up completion (reuse the existing activity_events.outcome column for the logged activity); persist follow_ups.outcome/outcomeNote
- Add follow_ups.channel population on all create paths and channel defaults per sourceTrigger (e.g. InvoiceOverdue → WhatsApp)
- POST /followups/:id/complete {outcome,outcomeNote,channelUsed,logActivity?,nextFollowup?} and POST /followups/:id/snooze {until} (status='snoozed'); add sweepSnoozeWakeups to flip snoozed→open

### Phase 2 — Manager command center: bulk ops, reassignment, coverage gaps, SLAs  _(effort: L)_
**Goal:** Turn the page into a team operating surface: rebalance load in two clicks, guarantee every open deal has an owner and a next step, and enforce follow-up SLAs with automatic escalation.

**Features:**
- Team Workload & Overdue heatmap (one row per rep × Overdue/Today/Week/Total/No-Next-Step, color-graded, drill into queue) added as a tab on the existing CRM performance page
- Coverage-Gap report — every open opportunity AND active Lead/Client contact with no follow-up, filterable by owner/stage/value/last-activity, with inline schedule/assign
- Bulk actions with a selection bar (multi-select + shift-range): reassign, round-robin distribute, reschedule, snooze, mark done, set priority — one transaction, manager-gated for cross-owner
- Reassign endpoint that re-points ownerUserId on the follow-up (and optionally the linked contact/opportunity) and fires a lead_assigned-style notification to the new owner
- Follow-up SLA policies (NewLead/ProposalSent/InboundWhatsApp/OverdueInvoice/StageStalled → withinHours) with On-Track/At-Risk/Breached state computed on read, a manager SLA-Breaches inbox, and escalation to manager after a grace window via the crm notification family
- Leaderboard upgrade: add SLA compliance %, avg response time, activities-by-category, no-next-step count, overdue trend (leading indicators) to getCompanyPerformance
- Saved views + manager 'Today' triage (board grouped Overdue/Today/Week/Later, per-rep swimlanes) pinned to sidebar/command palette

**Data-model changes:**
- New table followup_sla_policies(id, companyId, trigger, withinHours, businessHoursOnly, escalateAfterHours, escalateToRole); compute slaState on read in listFollowups
- POST /companies/:id/followups/bulk {ids|filter, action, payload}; POST /followups/:id/reassign {ownerUserId}; GET /companies/:id/followups/team-summary; GET /companies/:id/coverage-gaps?ownerUserId&minValue
- Add a new 'crm' notification subtype for sla_breach / deal_slipping with manager recipients via listUserIdsByCompanyRoles
- Requires a company timezone + business-calendar field before SLA business-hours math is trustworthy

### Phase 3 — Cadences, sequences & recurrence  _(effort: XL)_
**Goal:** Turn ad-hoc follow-up into a disciplined, self-driving process: enroll once and the engine drives every timed cross-channel touch, auto-exiting on reply or stage change.

**Features:**
- First-class cadence model: cadences + cadence_steps (ordered: offsetDays, channel, intent, optional template, branchOnOutcome) + cadence_runs (per-enrollment runtime)
- Enroll a contact or deal into a cadence from contact 360, pipeline card, or in bulk from a lead list; a step-progress pip on the row ('step 2 of 5')
- Cadence engine: sweepCadenceEnrollments materializes the next step's follow-up via createFollowup at dayOffset; outcome-based branching (no-answer×N → reschedule/notify; replied/booked → exit/pause); pause/resume/exit cleanly cancel future steps
- Starter cadences: New-lead 5-touch, Post-proposal nudge, Dormant-revival, Renewal runway, Invoice-overdue dunning (reusing the existing overdue sweep)
- Recurrence via RRULE: on complete, compute next occurrence and insert a fresh follow-up linked by recurrenceParentId, preserving each occurrence's outcome history
- Calendar/Agenda and Board views over the same query (drag-to-reschedule, week-start respects locale, snoozed in a Waiting column) plus a Timeline lens reusing ActivityFeed

**Data-model changes:**
- New tables: cadences(id, companyId, name, targetEntityType, isActive); cadence_steps(id, cadenceId, stepIndex, offsetDays, type, channel, titleTemplate, branchOnOutcome JSON, UNIQUE(cadenceId,stepIndex)); cadence_runs(id, companyId, cadenceId, entityType, entityId, ownerUserId, currentStepIndex, status, startedAt, completedAt)
- Populate follow_ups.sequenceId/sequenceRunId/stepIndex/recurrenceRule/recurrenceParentId on cadence- and recurrence-generated rows; per-run idempotency key + max-steps cap to prevent runaway chains
- POST /companies/:id/cadences (CRUD); POST /contacts|deals/:id/enroll {cadenceId}; POST /enrollments/:id/{pause|resume|exit}; new sweepCadenceEnrollments on the existing reminder interval
- GET /companies/:id/followups gains view=today|week|board + groupBy filters for the new lenses

### Phase 4 — AI next-best-action, two-way messaging & integrations  _(effort: XL)_
**Goal:** Make the queue self-aware: Claude drafts the actual touch and recommends the next-best-action, inbound replies auto-close follow-ups, and meetings sync to the calendar — all supervised by guardrails.

**Features:**
- Claude-backed followupAssist service (model claude-opus-4-8, adaptive thinking, streaming, prompt-cached company/persona prefix) returning a ranked next-best-action + editable call/WhatsApp/email drafts in the contact's language (en/ar, RTL)
- Sentiment & priority scoring on inbound and at enrollment (Haiku tier for high-volume) → colored signal on each row and a default 'work the hottest first' sort, auto-escalating at-risk accounts into a save cadence
- Two-way WhatsApp: extend the existing Green API inbound webhook to auto-complete the matching open follow-up (outcome='replied'), score sentiment, and exit the active cadence; sending an AI draft logs the activity + marks done in one action
- Conversion analytics: activity-by-category joined to opportunity stage progression and Won — calls-per-win, touches-to-close, channel-advancement, plus 'deals slipping' (days-in-stage/last-activity ranked by value-at-risk)
- Calendar sync: token-protected per-user/per-follow-up .ics feeds first; optional Google two-way OAuth as a later sub-phase (Meeting follow-ups create/update events; reschedules move dueAt)
- AI/automation guardrails: draft-by-default, quiet hours, per-contact channel caps, company-wide kill-switch, an 'AI suggested N touches' approval inbox, model-id/prompt-version audit, graceful template fallback on Claude refusal/stop_reason and when ANTHROPIC_API_KEY is unset
- Automation control center to enable/pause cadences and triggers per company and review what's scheduled

**Data-model changes:**
- Add follow_ups.aiDraftId + contact.sentiment + contact.priorityScore; optional ai_drafts table storing model id + prompt version for audit
- Add per-company automation settings (quiet hours, channel caps, kill-switch, autoSend opt-in) + per-contact opt-out flag
- POST /companies/:id/followups/:fid/suggest and POST /contacts/:id/ai/draft (streamed); closeFollowupOnInbound(contactId) in the webhook path with a confidence threshold + manual reconcile fallback
- GET /companies/:id/crm-conversion analytics endpoint; GET /companies/:id|users/:id/followups.ics token-protected feeds (deliveries public-link model); inbound email left as net-new infra (Resend inbound route) flagged for later

## Feature catalog

| Feature | Phase | Category | Value | Effort |
|---|---|---|---|---|
| First-class polymorphic follow_ups table (entityType/entityId reusing ActivityEvent union) | Phase 0 | data-model | high | L |
| Idempotent createFollowup primitive + UNIQUE partial idempotency index (replaces metadata-JSON scan) | Phase 0 | data-model | high | M |
| Backfill migration 059 from contact.nextFollowupDate + open activity_events (de-duped, zero loss) | Phase 0 | data-model | high | M |
| Dual-read UNION shim in listFollowups + /done & /reschedule back-compat aliases | Phase 0 | data-model | high | M |
| Rewire existing auto-triggers + sweepFollowupDueReminders onto follow_ups via sweep index | Phase 0 | data-model | high | M |
| Performance indexes (owner-due, entity, company-due, sweep-reminder, sweep-snooze) | Phase 0 | data-model | medium | S |
| Today single-card work queue (urgency-ordered) replacing the flat table as default | Phase 1 | rep-ux | high | L |
| Structured per-channel OUTCOME capture that auto-schedules the next step (one-tap, atomic, undo) | Phase 1 | rep-ux | high | L |
| Per-follow-up channel as first-class field with channel-appropriate primary action | Phase 1 | rep-ux | high | M |
| Keyboard-first triage layer (j/k/e/s/x/d/c/w/m/u + ? cheat-sheet) via command-palette infra | Phase 1 | rep-ux | high | M |
| Snooze (distinct from reschedule) with fixed + natural-language presets + sweepSnoozeWakeups | Phase 1 | rep-ux | high | M |
| Smart urgency-score queue ordering + 'going cold' surfacing | Phase 1 | rep-ux | medium | M |
| Inline contact mini-360 on the Focus card + next-best-action hint line | Phase 1 | rep-ux | medium | M |
| Rich empty/zero/all-clear states + sidebar overdue badge + momentum/streak ring | Phase 1 | rep-ux | medium | S |
| Full Arabic/RTL parity + mobile swipe triage across all views | Phase 1 | rep-ux | high | M |
| Click-to-call / click-to-WhatsApp / send-email one-tap row actions (Green API + email) | Phase 1 | integrations | high | M |
| Team Workload & Overdue heatmap (per-rep × buckets, drill-in) | Phase 2 | manager-analytics | high | M |
| Coverage-Gap report — open deals + active leads with NO next step, ranked by value | Phase 2 | manager-analytics | high | M |
| Bulk actions + selection bar (reassign, round-robin, reschedule, snooze, done, set-priority) | Phase 2 | manager-analytics | high | M |
| Reassign endpoint re-pointing ownerUserId + new-owner notification | Phase 2 | manager-analytics | high | S |
| Follow-up SLA policies + On-Track/At-Risk/Breached state + breach inbox & escalation | Phase 2 | manager-analytics | high | L |
| Leaderboard upgrade with leading indicators (SLA %, response time, activities, no-next-step) | Phase 2 | manager-analytics | medium | M |
| Saved views + manager Today/swimlane triage board | Phase 2 | manager-analytics | medium | M |
| Multi-step cadences/sequences (cadences + cadence_steps + cadence_runs) engine | Phase 3 | automation-ai | high | XL |
| Enroll from contact/pipeline/bulk + step-progress pip; pause/resume/exit | Phase 3 | automation-ai | high | M |
| Outcome-based cadence branching (no-answer×N, replied→exit) + starter cadences | Phase 3 | automation-ai | high | L |
| Recurrence via RRULE with per-occurrence history (recurrenceParentId) | Phase 3 | automation-ai | medium | M |
| Calendar/Agenda + Board + Timeline views over the same query (drag-to-reschedule) | Phase 3 | rep-ux | medium | L |
| Expanded triggers (no-reply-in-N-days, post-meeting, birthday/anniversary, renewal runway) | Phase 3 | automation-ai | medium | M |
| Claude next-best-action + on-brand call/WhatsApp/email drafts (en/ar, streaming, prompt-cached) | Phase 4 | automation-ai | high | L |
| Sentiment & priority scoring (Haiku tier) driving 'hottest first' sort + at-risk save cadence | Phase 4 | automation-ai | medium | M |
| Two-way WhatsApp: inbound webhook auto-completes follow-up + exits cadence + sends draft | Phase 4 | integrations | high | L |
| Activity-to-outcome conversion analytics + deals-slipping/response-time reports | Phase 4 | manager-analytics | high | L |
| Calendar sync — token-protected .ics feeds (Google two-way OAuth later) | Phase 4 | integrations | medium | M |
| AI/automation guardrails (draft-by-default, quiet hours, channel caps, kill-switch, approval inbox, audit) | Phase 4 | automation-ai | high | M |
| Automation control center (enable/pause cadences & triggers, see scheduled) | Phase 4 | automation-ai | medium | M |

## Open questions (decide before building)

1. Migration cutover: do we commit to dropping contact.nextFollowupDate/Note in a follow-up migration 060 (clean single-source) on a fixed timeline, or keep the denormalized 'soonest' cache indefinitely for back-compat? This decides how aggressively we funnel all writes through createFollowup.
2. Multi-entity attach scope for Phase 0: ship full polymorphic entityType (contact|opportunity|invoice|delivery|client|campaign) immediately, or start contact + opportunity + invoice only and add the rest later? Affects enriched-list join complexity.
3. AI provider usage (Phase 4): confirm Claude (claude-opus-4-8 for drafts, Haiku for high-volume sentiment), and whether we want on-demand-only generation vs bulk pre-drafting — this drives cost. Also confirm an ANTHROPIC_API_KEY budget and the degrade-to-template fallback is acceptable.
4. Channel priority order: WhatsApp (Green API) is clearly first for the GCC workflow — confirm Email is second and whether inbound email (net-new infra: Resend inbound route or IMAP poll) is in scope at all, or outbound-email only.
5. Auto-send policy: should cadence WhatsApp/email steps EVER auto-send without a rep tapping, or is draft-and-review the permanent default until per-company opt-in? Plus required quiet-hours, per-contact channel caps, and opt-out semantics for WhatsApp Business policy compliance.
6. Reassignment side effects: bulk reassign mutates contact/opportunity ownership which changes Employee-role visibility and commission attribution. Do we require an explicit confirm + audit log, and should reassigning a follow-up optionally NOT change deal ownership?
7. SLA prerequisites: SLA business-hours math needs a company timezone + business-calendar that doesn't exist yet. Confirm we add that in Phase 2, and which triggers/within-hours defaults ship first.
8. Recurrence + cadence guardrails: confirm a max-steps cap and per-run idempotency key, and the desired behavior when a deal is Won mid-cadence (auto-cancel remaining steps?).
9. Round-robin fairness needs an out-of-office/capacity signal that doesn't exist today — do we add a simple per-rep capacity target + OOO flag in Phase 2, or defer round-robin to a later phase?
10. Orphan handling: polymorphic entityId has no FK; when a linked contact/deal/invoice is deleted, do we soft-flag/skip orphaned follow-ups in the list or cascade-cancel them?