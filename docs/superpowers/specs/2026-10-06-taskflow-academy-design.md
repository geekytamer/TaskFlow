# TaskFlow Academy — mandatory, hands-on, guided training

Date: 2026-10-06. Status: approved direction (owner chose A: practice company, story missions + XP + badges, module-by-module unlocks, everyone once, before/after numbers + live mini statements, guided overlays; then asked me to decide the rest and build).

## Goal

Every staff user learns TaskFlow by **doing real work in their own practice company**, guided step by step by an overlay, and **sees what each action does to the business** (cash, owed to you, owed by you, stock, revenue, VAT, profit). Finishing a mission unlocks the matching module in the real company; it is mandatory.

## What the owner decided

- Practice place: a private practice company per trainee (option A). Real books are never touched.
- Mandatory: real modules unlock mission by mission. Everyone takes it once, existing users included, with a grace period. Super admins can exempt.
- Game: story missions with objectives, XP, levels, badges; a team progress board (progress, not speed).
- Impact: a before → after panel after each objective, and live mini P&L / balance sheet.
- Guidance: overlays that point at the exact control for each step.

## Decisions I made (and why)

1. **Practice company = a real `companies` row with `isTraining = 1` and `trainingOwnerUserId`.** The trainee is its only member, as Admin there (so permission walls never block learning; what they *learn* still follows their real role, see 4). One per user; "Reset practice" deletes it (cascade) and makes a fresh one.
2. **Isolation is one rule applied at choke points, not scattered checks** (background jobs run normally inside a practice company — reminders there are realistic and reach only the trainee, in-app):
   - `GET /companies`: a training company is listed only for its owner (super admins included — they do not see other people's practice companies).
   - Notifications in a training company are stored already marked emailed and never reach the critical-email hook, so no email ever leaves.
   - Nobody else can be added to a practice company (user create and edit refuse it), so welcome emails and invites cannot reach real people from training. Practice companies have no WhatsApp instance and are never the portal company.
   - Admin overview counts and cross-company lists exclude training companies.
   - Tests plant a training company with invoices, overdue items and notifications and assert none of it shows in another user's company list, the admin overview, sweeps or email.
3. **Missions are code, not data** (`backend/src/academy/missions.ts`): id, chapter order, roles, modules unlocked, XP, story (en/ar), objectives. Each objective has a server **check** — a pure query against the practice company (e.g. "an invoice for a client exists and is fully paid") — so progress cannot be faked and survives reloads. Guided steps (route, target selector, text en/ar) live with the frontend mission content, keyed by objective id.
4. **Everyone takes the whole course** (owner, 2026-10-06: "it should cover everything from the start; in the practice company the user becomes like a manager"). Seeing how one person's work lands in someone else's numbers is the point. The highest real role only decides the **order**: missions of their own daily work first, so they unlock what they need soonest; First day always first, the month-end check always last. Missions whose modules are disabled in every one of the user's real companies are skipped. Left out on purpose: creating users and companies, permission groups, and module switches (administration, not daily work).
5. **Unlocks map module → mission** from the mission list. Modules no mission teaches (games, portal access, users, companies, permissions) stay open. Enforcement:
   - Frontend: locked modules show a lock in the sidebar and a "Finish mission X" card instead of the page.
   - Server: in a **real** company, *changes* (POST/PUT/PATCH/DELETE) to a locked module are refused with `403 { code: 'ACADEMY_LOCKED', module, missionId }`, checked inside `requireCompanyAccess`/`requireCompanyRoles` from the route's generated permission mapping, so list and record routes are both covered. Reads stay open: other screens rely on company details, people, custom fields and the currency (all in `settings`/`finance`), and blocking them broke modules the user had already unlocked. The app's lock page stands in for a locked module's own pages. Training companies are never gated.
   - Super admins are never gated (they must be able to administer and exempt). Exemptions (whole academy or one module) are super-admin actions, recorded in the activity log.
6. **Grace:** the first time the academy migration runs it stores a launch date. Users created before it keep full access until launch + 14 days, with a countdown banner; after that, locks apply. Users created after launch are locked from day one except Dashboard, Profile, Notifications and the Academy itself.
7. **Mandatory entry:** after sign-in, a user with a required mission still open and no grace lands on `/academy` (once per session; they can navigate to unlocked modules).
8. **Impact numbers come from the existing trial balance and P&L** (`getTrialBalance`, `getProfitAndLoss`), so the academy never invents figures: cash (1000+1010), owed to you (1100), stock (1200), input VAT (1150), owed to suppliers (2000), VAT owed (2200), commissions owed (2300), end-of-service owed (2400), revenue, expenses, profit. The dock snapshots before an objective and shows the change when the server confirms it.
9. **Practice data:** the practice company starts with the standard chart of accounts, VAT 5%, OMR, and an opening entry of OMR 20,000 owner's capital in the bank, so cash never starts negative. Everything else (clients, items, suppliers, staff) the trainee creates — that is the lesson. Story names are suggested in the copy (Al Waha Trading, Al Noor Hotel, Nakheel Farms).
10. **XP and levels:** XP per mission (50–150); levels every 200 XP; a badge per mission plus "Ready" for the month-end check. A team board on the academy page lists colleagues in the same real company with missions finished — no times, no ranks.
11. **Overlay:** a new non-blocking guide (not the existing step-through tour, which blocks the page): a spotlight ring around the target that lets clicks through, a small card with one instruction, a mission dock (story, objectives, XP, impact, statements toggle), a hint after 20 s idle, "Show me again". It reuses the existing `data-tutorial` targets and adds new ones where needed.

## Missions

19 missions, 60 objectives, about 2–2.5 hours. Order below is the story order; each role's path pulls its own missions forward. "Visit" objectives are reported by the browser; all others are server checks against the practice company.

| # | id | Objectives | Unlocks | Daily work of |
|---|---|---|---|---|
| 0 | first-day | open the dashboard; open notifications; switch language (reported) | dashboard | all |
| 1 | get-work-done | a project; a task; assigned; time logged; Done | projects, tasks | all |
| 2 | win-customer | a client contact; an opportunity; a follow-up; moved past first stage | contacts, crm | all |
| 3 | follow-through | a follow-up completed; one snoozed | — | Admin, Manager, Employee |
| 4 | see-the-work | visit Tasks, Diagram, Performance | — | Admin, Manager, Employee |
| 5 | buy-restock | supplier; item; approved requisition; RFQ awarded; PO received; bill approved; bill paid | purchasing, inventory, vendor-bills | Admin, Manager, Accountant |
| 6 | stock-control | a warehouse; a lot with expiry; a posted stock count | — | Admin, Manager, Accountant |
| 7 | match-bill | a non-draft bill linked to its PO; visit Bill matching | — | Admin, Manager, Accountant |
| 8 | sell-get-paid | quotation accepted; sales order; delivery; invoice; part paid; fully paid; credit note | sales, invoices | Admin, Manager, Accountant |
| 9 | credit-currency | a client credit limit; a sent invoice in a non-OMR currency | — | Admin, Manager, Accountant |
| 10 | make | a recipe; a completed work order | manufacturing | Admin, Manager |
| 11 | campaigns | an influencer contact; a campaign deliverable; a commission rule; a commission accrued | campaigns, commissions | Admin, Manager |
| 12 | documents | a template; a document; a final document | documents | all |
| 13 | run-books | an expense; a reversed journal entry; a budget | finance | Admin, Accountant |
| 14 | close-quarter | a filed VAT return; a locked period | — | Admin, Accountant |
| 15 | people-pay | employee; attendance; leave; payroll paid | hr, payroll | Admin, Manager, Accountant |
| 16 | run-company | company details; a custom field | settings | Admin |
| 17 | look-around | visit WhatsApp; visit Influencers | whatsapp | all |
| ★ | month-end | trial balance balances; nothing overdue; profit positive (after buy, sell, books) | — (badge Ready) | all |

## Data

Migration `104_academy`: `companies.isTraining`, `companies.trainingOwnerUserId`; `academy_state (userId PK, practiceCompanyId, xp, startedAt, graceUntil)`; `academy_missions (userId, missionId, completedAt, xp, PK)`; `academy_objectives (userId, missionId, objectiveId, completedAt, PK)` (for client-reported objectives and for "first done at"); `academy_exemptions (userId, module '*' or key, byUserId, reason, createdAt, PK(userId, module))`; `academy_settings (key PK, value)` with `launchedAt`.

## API

- `GET /academy/me` → practice company, missions for the user (status, objectives done/total with each objective's state), xp, level, badges, locked modules, grace.
- `POST /academy/start` (idempotent) → creates the practice company.
- `POST /academy/reset` → deletes and recreates the practice company (progress kept).
- `POST /academy/objectives/:missionId/:objectiveId` → for client-reported objectives only: first-day actions and "open this screen" objectives (`visit`, reported by the browser when the trainee opens that page in the practice company).
- `GET /academy/impact` → the metrics above for the practice company; `GET /academy/statements` → mini P&L and balance sheet.
- `GET /academy/team?companyId` → colleagues' mission counts (same real company, needs access).
- `POST /academy/exemptions` / `DELETE /academy/exemptions/:userId/:module` (super admin).

## Testing

Backend: isolation (planted training data never leaks: company list, admin overview, sweeps, email hook); practice company lifecycle (start idempotent, reset recreates, membership only for owner); every objective check true only when its data exists in the *practice* company (not in a real one); mission completion awards XP once; gating (locked → 403 ACADEMY_LOCKED on company routes in real companies, open in practice company, grace, exemptions, super admin bypass); impact equals trial balance. Mutation-check isolation and gating guards. Frontend: typecheck/lint; browser walk-through of missions 0–1 and the impact panel in en/ar.

## Out of scope (now)

Scored challenges, timers, competitive ranks; video; certificates; per-company custom missions.
