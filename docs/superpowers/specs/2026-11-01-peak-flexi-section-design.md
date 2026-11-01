# Peak Flexi section in TaskFlow

Status: design approved by Tamer (owner), 2026-11-01. Branch `feature/peak-flexi-section`, built on phase 1 (PR #17, master c4edd9d).

## Why

Phase 1 made the balance real, but staff see Peak Flexi in two scattered places: one CRM page (`/crm/flexi`) and a section on the contact page. Tamer wants one sidebar section, like Directory, holding everything about the service: applications, client accounts, campaign requests, website leads, settings, and the controls a credit service needs. The later phases (paying from the balance, instalments, collections, influencer payouts, Cash Exposure) will add pages to this same section.

## The section

A new sidebar section, **Peak Flexi / بيك فلكسي**, placed after CRM:

| Page | Route | Purpose |
|---|---|---|
| Overview | `/flexi` | Totals and alerts |
| Applications | `/flexi/applications` | The phase 1 review page, moved here. `/crm/flexi` redirects, so links already in notifications keep working |
| Accounts | `/flexi/accounts`, `/flexi/accounts/[contactId]` | Every Flexi client, and one client's account file |
| Campaign requests | `/flexi/requests` | Campaign requests from Flexi clients, against their available balance |
| Leads | `/flexi/leads` | Companies that applied on the public `/join` page and have no portal account yet |
| Settings | `/flexi/settings` | Standard balance, default terms, allowed months, the client terms text |

The CRM nav entry "Peak Flexi" is removed; the contact page keeps its Flexi section, which now links to the account file.

## Overview (`/flexi`)

- Figures: total approved balance, total used, total available, number of active / frozen accounts, applications waiting.
- Alerts, each linking to the page that resolves it:
  - applications waiting more than 2 days;
  - accounts that have used 80% or more of their balance;
  - frozen accounts;
  - campaign requests asking to pay from the balance where the budget is above what is available.
- Every figure is in the company currency.

## Accounts

**List (`/flexi/accounts`):** company, balance, used, available, % used (bar), terms (down payment %, max months), state, active since. Search by name; filter by state (active, frozen, closed).

**Account file (`/flexi/accounts/[contactId]`):**
- Header: balance, used, available, terms, state, link to the contact.
- Actions (need the manage permission, below), each asking for a reason that is saved:
  - **Adjust balance or terms**: new balance (must stay above 0), down payment %, max months.
  - **Freeze**: the client keeps the account but available becomes 0; the portal card says the account is paused and to contact PEAK. **Unfreeze** reverses it.
  - **Close**: ends the account (balance 0, Flexi off). A closed client may apply again later as a new activation.
- **Timeline**: every event on the account, newest first: applied, approved, rejected, withdrawn, adjusted, frozen, unfrozen, closed, terms accepted. Each line shows who, when, before/after amounts and the reason.
- Applications with their papers, open invoices counting against the balance, and this client's campaign requests.

## Campaign requests (`/flexi/requests`)

- Lists portal campaign requests from contacts that have a Flexi account, or that chose to pay from the balance.
- Today the wizard's "pay in instalments" choice is only a sentence inside the objective. It becomes a real field: `portal_campaign_requests.payWith` (`'full' | 'flexi'`, default `'full'`), sent by the wizard and accepted by `parseBrief`.
- Each row: client, title, budget, pay choice, client's available balance, and a flag when the budget is above what is available, or when the client has no active account but chose Flexi.
- Opening a row goes to the existing client request sheet (`/crm/client-requests?open=<id>`); this page does not duplicate the proposal workflow.

## Leads (`/flexi/leads`)

- Lists contacts the `/join` page created (tag `peak-flexi`) that have no portal user yet: company, person, phone, email, CR number, services wanted, role, date.
- **Invite to the portal**: adds the Client role to the contact and sends the existing portal invitation to the lead's email. Disabled with a hint when the lead left no email.
- Once invited, the lead disappears from this list; when they activate inside the portal, they show under Applications.

## Settings (`/flexi/settings`)

Stored per company in a new `flexi_settings` table, read by `FlexiStore` instead of today's constants:

- Standard balance (default 850).
- Default down payment % (default 40).
- Allowed instalment months (default 3, 6, 12) and the default max months for an activation (6) and an increase (12).
- **Client terms**: the Arabic and English text the client must accept before applying. Saving a new text increases the terms version. A default text ships with the feature; it says plainly that PEAK reviews each application, the balance and terms are set per client, PEAK may pause or close an account, and late instalments may pause the account. **It must be checked by PEAK's lawyer before it is relied on.**

## Terms acceptance (client portal)

- The activation and increase forms show the current terms (expandable) and a required checkbox "I have read and accept the Peak Flexi terms".
- The application stores `termsVersion`, `termsAcceptedAt` and the accepting portal user. The account timeline shows "terms accepted (version N)".
- The backend refuses an application without acceptance of the current version (400).

## Data

Migration `147_peak_flexi_section`:
- `flexi_settings` (`companyId` primary key, `standardAmount`, `defaultUpfrontPct`, `allowedMonths` JSON, `activationMonths`, `increaseMonths`, `termsVersion`, `termsAr`, `termsEn`, `updatedAt`, `updatedBy`).
- `flexi_events` (`id`, `companyId`, `contactId`, `kind`, `amountBefore`, `amountAfter`, `upfrontPct`, `maxMonths`, `note`, `actorUserId`, `actorPortalUserId`, `applicationId`, `createdAt`). Kinds: `applied`, `approved`, `rejected`, `withdrawn`, `adjusted`, `frozen`, `unfrozen`, `closed`, `terms_accepted`. Existing phase 1 applications are back-filled as `applied` plus their decision.
- `clients.flexiState` (`'active' | 'frozen' | 'closed'`, null when never activated). Approval sets `active`; `flexiEnabled` stays true for active and frozen accounts.
- `flexi_applications` gains `termsVersion`, `termsAcceptedAt`.
- `portal_campaign_requests` gains `payWith` (default `'full'`).

`balanceOf` returns the state; available is 0 when frozen or closed. Increases cannot be requested while frozen.

## Permissions

- `FLEXI_REVIEW` (exists; Admin, Manager, Accountant): see the whole section and decide applications.
- New `FLEXI_MANAGE` = `invoices:flexi.manage` (Admin, Accountant): adjust, freeze, unfreeze, close, edit settings, invite leads. A migration grants it to existing built-in groups, as 146 did.
- Both are assignable to any group under the permissions engine, so a dedicated Flexi team can get them without being managers.

## Out of scope

Paying from the balance and instalment schedules, collections and lateness, periodic document review reminders, influencer payouts and referrals, Cash Exposure. These are phases 2 and 3 and will add pages to this section.

## Testing

Backend (node:test + supertest):
- settings: defaults when none saved; saving terms bumps the version; FlexiStore uses the saved standard amount and default terms;
- applications refused without acceptance of the current terms version; accepted ones store version, time and user, and write a `terms_accepted` event;
- adjust, freeze, unfreeze and close: permission (`FLEXI_MANAGE` only), reason required, balance stays above 0, events written with before/after, available is 0 when frozen, an increase is refused while frozen, a closed account can apply again;
- overview figures and alerts on a seeded company;
- campaign requests: `payWith` round-trips from the portal; the list flags over-budget and no-account rows;
- leads: only `peak-flexi` contacts without a portal user; invite adds the Client role and creates the portal user; refused without email;
- another company's ids give 404 on every new route; an Employee gets 403.

Staff app and portal: type-check, existing tests, and a prod-build browser run of each page (desktop and 390px), including the frozen card and the terms checkbox.
