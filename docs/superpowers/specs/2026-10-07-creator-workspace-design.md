# Creator Workspace — Design

Date: 2026-10-07
Status: approved in conversation (approach A, all five phases); this document records the decisions.
Replaces: the open "structurally private workspace" question in the influencer portal design (§9 of 2026-09-24-influencer-portal-design.md).

## 1. What this is

The influencer portal stops being a window onto Peak's work only. Peak gives its influencers, free, one place to run their whole business: every brand they work with, every deal, every deliverable, every payment and expense, and a media kit. Peak work is one part of that business and arrives in the same views automatically.

Decisions from the owner (2026-10-07):

- Peak provides it, free, to Peak's influencers. Accounts are still created by Peak's invitation; there is no self sign-up and no subscription.
- It covers work the influencer gets anywhere: directly from brands, through other agencies, or through Peak.
- **Peak can see everything an influencer records**, but only on that influencer's page in the staff app ("Work outside Peak": their clients and what each pays). It never appears in Peak's campaigns, opportunities, pipeline, reports, dashboard or search.
- Staff may turn one of an influencer's clients into a Peak contact, deliberately, one at a time.
- Influencers manage their own contacts (brands, agencies, managers, anyone).
- Nothing on the website says Peak can see the workspace; the paper contract signed before access covers it.
- Scope: deals, content calendar, income, expenses, media kit, files per deal, connected accounts with verified stats. **Not** invoices issued by the influencer.

Rules carried over unchanged: the client portal never sees rates; influencers see no market-rate benchmarks (2026-09-28); Peak data reaches the workspace only through the existing allowlisted DTOs.

## 2. Approach

**A — a workspace module of its own** (chosen). New tables under `backend/src/workspace/`, owned by the influencer (`companyId` of the portal + the influencer's `contactId`). Peak work is not copied into them: it is read from Peak's records at request time and shown beside the influencer's own entries, read-only, marked "Peak". Staff read the workspace through one endpoint on the influencer's contact.

Rejected: reusing Peak's contacts and opportunities with a flag (every Peak screen would have to filter it forever, and one missed filter leaks an influencer's clients into Peak's pipeline); a separate service and database (twice the operations for a free internal tool).

## 3. Data model (migration 119 onward)

All tables carry `companyId` and `ownerContactId` (the influencer). Every query filters on both. Amounts are numbers with their own `currency` (ISO code); no conversion anywhere, totals are per currency.

| Table | Columns (besides id, companyId, ownerContactId, createdAt, updatedAt) |
|---|---|
| `ws_contacts` | name, kind (`brand`, `agency`, `manager`, `other`), company, email, phone, notes, `peakContactId` (set when staff turn it into a Peak contact), archivedAt |
| `ws_contact_notes` | wsContactId, body |
| `ws_deals` | wsContactId (nullable: the brand), title, amount, currency, status (`lead`, `confirmed`, `delivered`, `paid`, `cancelled`), startDate, endDate, notes |
| `ws_deliverables` | dealId, title, platform, dueDate, status (`todo`, `done`), postUrl |
| `ws_payments` | dealId, amount, currency, receivedOn, note |
| `ws_expenses` | dealId (nullable), category (`production`, `travel`, `agency_fee`, `manager_fee`, `equipment`, `other`), amount, currency, spentOn, note |
| `ws_files` | dealId, fileName, mimeType, sizeBytes, content (same checks as portal files: real type from the first bytes, PDF/PNG/JPEG/WebP, 10 MB) |
| `ws_settings` | ownerContactId primary key with companyId; defaultCurrency |
| `ws_media_kits` | slug (unique), published, headline, bio, contactEmail, featuredContactIds (JSON, brands the influencer chooses to show), manualStats (JSON: platform, handle, followers, engagement) |

Deal status is the influencer's own; nothing derives it, except that recording payments never changes it silently: the UI offers "Mark paid" when payments reach the amount.

## 4. Peak work inside the workspace (read-time, never copied)

- **Deals**: each visible Peak assignment (same rule as today's Assignments page) appears as a deal with `source: 'peak'`, title = campaign name, brand = campaign brand, amount = agreed rate, status mapped (awaiting reply → `lead`, confirmed → `confirmed`, completed → `delivered`, and `paid` once its payout bills are paid). Its deliverables are the influencer's paid deliverables, with today's controls (accept/decline, start, submit, publish) kept on the deal page.
- **Income**: each Peak payout (today's `payoutsFor`) is income with `source: 'peak'`; paid ones count as received, approved/pending ones as owed.
- Peak items are read-only in the workspace and link to the same actions they have today. Old URLs `/assignments` and `/payouts` redirect to `/deals?source=peak` and `/money`, so links already sent in emails and WhatsApp alerts keep working.

## 5. What staff see

`GET /contacts/:id/workspace` (staff API) returns, for an influencer contact: their workspace contacts, deals with amounts and status, totals received and owed per brand per currency, and the last activity date. Gate: Admin and Manager (management of influencer business, not accounting). The staff app shows it as a "Work outside Peak" section on the contact detail page, only for influencer contacts with a portal account.

`POST /contacts/:id/workspace/contacts/:wsContactId/peak-contact` creates a Peak contact (Organization, role Lead, name/email/phone/company copied, owner = the acting user) and stores its id on the workspace contact. Calling it again returns the same Peak contact. Nothing else crosses over.

Workspace data is excluded from every other staff surface by construction: no other staff route reads `ws_*` tables. A test pins this (§9).

## 6. Portal structure (influencer)

Navigation: **Home · Deals · Calendar · Money · Messages** (primary), **Contacts · Media kit · Profile · Analytics · Games · Referrals** (secondary). Phone bar: Home, Deals, Calendar, Money; More holds the rest.

- **Home**: what needs the influencer today across all work: Peak replies waiting, deliverables due this week, money owed, unread messages.
- **Deals**: one list, newest activity first, filter by status and source (all / mine / Peak). A deal page shows brand, amount, dates, deliverables, payments, expenses, files and notes; Peak deals show Peak's brief and controls instead.
- **Calendar**: every deliverable (own and Peak) by due date: an agenda list on phones, a month grid on wide screens; overdue items lead.
- **Money**: received and owed this month and this year, per currency; by brand; expenses and profit; the list of payments and expenses with add forms. Peak payouts appear as Peak income.
- **Contacts**: the influencer's contacts with their deals and notes.
- **Messages**: the conversation with Peak, redesigned (§7).
- **Media kit**: an editor and a public page at `/kit/<slug>` on the influencer host (no sign-in). It shows headline, bio, chosen brands, contact email, and stats: verified stats from connected accounts first (with "Verified" and the as-of date), manual stats for platforms not connected.

## 7. Redesign of payouts, assignments and messages

Done with the impeccable skill, inside the phase where each page changes, on the portal's existing tokens and components (`ui.tsx`), English and Arabic, phone first:

- Assignments become Peak deals in Deals: a decision card for offers awaiting a reply at the top; the rest as compact rows opening a deal page, instead of one long card per assignment.
- Payouts become Money: statement-style totals, then a dated ledger; status shown as text and position, not colour alone.
- Messages: a real conversation layout with day separators, the composer pinned on phones, files shown as attachments, WhatsApp alert settings moved to Profile.

## 8. Phases

| Phase | Builds | Redesign |
|---|---|---|
| W1 | Workspace module, contacts and notes, deals with deliverables and files, Peak assignments as deals; staff "Work outside Peak" and "make a Peak contact" | Assignments → Deals |
| W2 | Payments, expenses, Money page, Peak payouts as income; Calendar | Payouts → Money |
| W3 | Messages | Messages |
| W4 | Media kit editor and public page (manual stats) | |
| W5 | Verified stats from connected accounts into the media kit and Home | |

Connected accounts, token handling and daily snapshots already exist (Meta work, against recorded fixtures); W5 only reads them. Live data waits for the Meta app (M0).

## 9. Testing

Backend `node --test`, per phase:

- Isolation: influencer A cannot read, change or attach to B's contacts, deals, payments, expenses or files (404, not 403).
- Staff: the workspace endpoint is refused to Employee and Accountant; "make a Peak contact" is idempotent and copies only the listed fields.
- Separation: with workspace data present, Peak's contacts list, search, opportunities, campaigns and dashboard return exactly what they return without it (poisoned fixture: a workspace brand named like a Peak search term).
- Peak mirror: assignment and payout states map as in §4; a declined or hidden assignment does not appear.
- Money: totals per currency, owed = confirmed/delivered deal amounts minus payments, Peak paid payouts counted once.
- Media kit: an unpublished kit is 404 publicly; only chosen brands show; stats prefer verified.

Portal: unit tests for pure helpers (calendar grouping, money totals); each phase driven in a real browser in English and Arabic.
